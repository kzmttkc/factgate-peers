// factgate-gate.mjs: FactGate's gate for any agentic website that runs the reference runtime.
// One file, no imports. Copy it next to your page (or load it from FactGate's host) and:
//
//   import { FactGateGate } from "./factgate-gate.mjs";
//   const gate = new FactGateGate({ factgateUrl: "https://<factgate host>/factgate", pageOrigin: location.origin });
//   gate.install(engine);   // engine = the runtime's Engine (boot(...).engine)
//
// What it does (page code, not a model instruction, so a model that ignores its instructions
// still cannot link to a counterparty the gate stops):
//   1. It reads FactGate's verdict from the runtime's action receipt for FactGate's gate_check
//      (run in FactGate's own window, where the visitor approves each origin FactGate reads).
//   2. It sits in front of the runtime's consent step (engine.requestConsent). Before the card for
//      a partner network it decides: FactGate and this page's own origin go to the card; a
//      partner FactGate passed under the policy goes to the card; a partner FactGate blocked, did
//      not pass under the policy, or never checked in this visit is declined at once, and the
//      runtime fetches nothing from it.
//   3. It puts every stop on the page through `record`: the gate, over budget, refused by policy,
//      an invalid network, a cycle, a declined card, and the private context each partner got.
//   4. check(engine, url) runs FactGate's gate_check from page code, with no model and no key:
//      the card for FactGate, FactGate's network loaded by name, gate_check in FactGate's window.
//
// Policy (which verdicts pass). ALLOW always passes. BLOCK never passes. CAUTION passes only when
// every kind of CAUTION in the verdict is in policy.passCaution. Kinds (FactGate's `cautions`):
//   identity_unknown, unreachable, steering, no_delivery_record, declined, not_compared, delivery_warn
// The default passes no CAUTION (the safe side). Example: { passCaution: ["identity_unknown"] }
// links to a site that answers as declared but has no ERC-8004 registration, and still stops one
// that did not answer (unreachable) or that FactGate blocked.

export const DEFAULT_POLICY = Object.freeze({ passCaution: Object.freeze([]) });

export const CAUTION_KINDS = Object.freeze(["identity_unknown", "unreachable", "steering", "no_delivery_record", "declined", "not_compared", "delivery_warn"]);

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "");
  }
}

function lastSegment(url) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function newId() {
  return globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : `fg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Normalize a policy: only known CAUTION kinds, no repeats.
 *
 * :param policy: { passCaution?: string[] } or undefined.
 * :return: { passCaution: string[] }
 */
export function normalizePolicy(policy) {
  const list = policy && Array.isArray(policy.passCaution) ? policy.passCaution : [];
  return { passCaution: [...new Set(list.filter((k) => CAUTION_KINDS.includes(k)))] };
}

/**
 * Does a verdict pass under a policy?
 *
 * :param policy: A normalized policy.
 * :param verdict: { verdict, cautions?, reasons? } from FactGate's gate_check.
 * :return: { pass: boolean, why: string, cautions: string[] }
 */
export function policyAllows(policy, verdict) {
  const p = normalizePolicy(policy);
  const v = verdict && typeof verdict.verdict === "string" ? verdict.verdict : "";
  if (v === "ALLOW") {
    return { pass: true, why: "FactGate answered ALLOW.", cautions: [] };
  }
  if (v === "BLOCK") {
    return { pass: false, why: "FactGate answered BLOCK.", cautions: [] };
  }
  if (v !== "CAUTION") {
    return { pass: false, why: "FactGate gave no verdict.", cautions: [] };
  }
  let cautions = Array.isArray(verdict.cautions) ? verdict.cautions.filter((k) => typeof k === "string") : [];
  if (!cautions.length) {
    // An older FactGate without `cautions`: read the kinds from the reasons, else unknown.
    cautions = [...new Set((verdict.reasons || []).filter((r) => r && r.effect === "CAUTION").flatMap((r) => (Array.isArray(r.kinds) && r.kinds.length ? r.kinds : ["unknown"])))];
  }
  if (!cautions.length) {
    cautions = ["unknown"];
  }
  const outside = cautions.filter((k) => !p.passCaution.includes(k));
  if (outside.length === 0) {
    return { pass: true, why: `FactGate answered CAUTION (${cautions.join(", ")}), which this site's policy accepts.`, cautions };
  }
  return { pass: false, why: `FactGate answered CAUTION (${outside.join(", ")}), which this site's policy does not accept.`, cautions };
}

export class FactGateGate {
  /**
   * :param options: { factgateUrl, pageOrigin, labels?: { host: label }, record?(entry), policy? }
   *   factgateUrl: FactGate's network URL, such as "https://<factgate host>/factgate".
   *   record: receives each line the page should show: { kind: "check" | "stop" | "context" | "done", text, ... }.
   */
  constructor({ factgateUrl, pageOrigin, labels = {}, record = () => {}, policy = DEFAULT_POLICY }) {
    this.factgateUrl = factgateUrl;
    this.factgateHost = hostOf(factgateUrl);
    this.factgateBase = new URL("./", factgateUrl).href.replace(/\/$/, "");
    this.factgateNetwork = lastSegment(factgateUrl) || "factgate";
    this.pageHost = hostOf(pageOrigin);
    this.labels = labels;
    this.record = record;
    this.policy = normalizePolicy(policy);
    // host -> { verdict, reasons, cautions, url, checkedAt, action }
    this.verdicts = new Map();
    // Hosts whose card the gate declined, so the runtime's "declined" note is not shown twice.
    this.gateDeclined = new Set();
  }

  label(host) {
    return this.labels[host] || host;
  }

  /** The action reference of FactGate's gate_check, as the runtime registers it. */
  gateCheckRef() {
    return `${this.factgateBase}/${encodeURIComponent(this.factgateNetwork)}#gate_check`;
  }

  /**
   * Record FactGate's verdicts from a batch of action receipts.
   *
   * :param receipts: The runtime's receipts, or null when the visitor declined.
   */
  observe(receipts) {
    for (const r of Array.isArray(receipts) ? receipts : []) {
      if (r && r.action === this.gateCheckRef() && r.status === "succeeded" && r.result && typeof r.result.url === "string" && typeof r.result.verdict === "string") {
        const host = hostOf(r.result.url);
        const reasons = Array.isArray(r.result.reasons) ? r.result.reasons : [];
        const entry = { verdict: r.result.verdict, reasons, cautions: Array.isArray(r.result.cautions) ? r.result.cautions : [], url: r.result.url, checkedAt: r.result.checkedAt, action: r.result.action };
        this.verdicts.set(host, entry);
        const decision = policyAllows(this.policy, entry);
        const worst = reasons.filter((x) => x.effect === r.result.verdict).map((x) => x.short || x.text);
        const what = r.result.verdict === "CAUTION" ? ` (${decision.cautions.join(", ")})` : "";
        this.record({ kind: "check", host, verdict: r.result.verdict, pass: decision.pass, text: `FactGate checked ${this.label(host)} (${host}): ${r.result.verdict}${what}.${worst.length ? ` ${worst.join(" ")}` : ""}` });
      }
    }
  }

  /**
   * Whether the gate lets this page link to a host now.
   *
   * :return: { pass, why, verdict? }
   */
  allows(host) {
    const v = this.verdicts.get(host);
    if (!v) {
      return { pass: false, why: `FactGate has not checked ${this.label(host)} (${host}) in this visit.` };
    }
    return { ...policyAllows(this.policy, v), verdict: v.verdict };
  }

  /**
   * Decide what happens before a consent card.
   *
   * :param info: The runtime's card info: { kind, peerLabel, peerOrigin (a host), requestText }.
   * :return: { action: "ask" | "decline", label, reason? }
   */
  decide(info) {
    const host = String(info.peerOrigin || "");
    if (info.kind !== "network") {
      return { action: "ask", label: info.peerLabel };
    }
    if (host === this.factgateHost || host === this.pageHost) {
      return { action: "ask", label: this.label(host) };
    }
    const v = this.verdicts.get(host);
    const d = this.allows(host);
    const who = `${this.label(host)} (${host})`;
    if (!v) {
      return { action: "decline", label: this.label(host), reason: `FactGate has not checked ${who} in this visit, so this page does not link to it.` };
    }
    if (v.verdict === "BLOCK") {
      const why = v.reasons.filter((x) => x.effect === "BLOCK").map((x) => x.text).join(" ");
      return { action: "decline", label: this.label(host), reason: `FactGate answered BLOCK for ${who}, so this page does not link to it. ${why}`.trim() };
    }
    if (!d.pass) {
      const outside = d.cautions.filter((k) => !this.policy.passCaution.includes(k));
      return { action: "decline", label: this.label(host), reason: `FactGate answered ${v.verdict} for ${who}${outside.length ? ` (${outside.join(", ")})` : ""}, which this site's policy does not accept, so this page does not link to it.` };
    }
    return { action: "ask", label: `${this.label(host)} (FactGate: ${v.verdict})` };
  }

  /**
   * Turn one runtime trace event into a stop the page shows, or null.
   */
  stopFrom(ev) {
    if (ev.kind === "composition_limit" && ev.phase === "note") {
      return { kind: "stop", stop: "budget", text: `Stopped (over budget): ${ev.reason}.` };
    }
    if (ev.kind === "consent" && ev.phase === "note" && ev.decision === "declined") {
      if (this.gateDeclined.has(ev.peerOrigin)) {
        this.gateDeclined.delete(ev.peerOrigin);
        return null;
      }
      return { kind: "stop", stop: "declined", text: `Not contacted: ${this.label(ev.peerOrigin)} (${ev.peerOrigin}) was declined on its card.` };
    }
    if (ev.kind === "tool" && ev.phase === "end") {
      const preview = String(ev.resultPreview || "");
      const message = preview.replace(/^Error from tool '[^']+': /, "");
      if (/already in this request's call chain/.test(preview)) {
        return { kind: "stop", stop: "cycle", text: `Stopped (cycle): ${preview}` };
      }
      if (/^Error from tool '[^']+': Policy: /.test(preview)) {
        return { kind: "stop", stop: "denied_origin", text: `Stopped (origin not allowed): ${message}` };
      }
      if (/^Error from tool '[^']+': .*failed validation/.test(preview)) {
        return { kind: "stop", stop: "invalid_network", text: `Stopped (invalid network): ${message}` };
      }
      if (/^Error from tool '[^']+': /.test(preview)) {
        return { kind: "stop", stop: "error", text: `Stopped (error): ${message}` };
      }
    }
    if (ev.kind === "remote_call" && ev.phase === "start") {
      const keys = Object.keys((ev.requestPayload && ev.requestPayload.sly_data) || {});
      return { kind: "context", text: `Private context sent to ${this.label(ev.peerOrigin)}: ${keys.length ? keys.join(", ") : "nothing"}.` };
    }
    return null;
  }

  /**
   * Attach the gate to a runtime engine.
   *
   * :param engine: The runtime Engine.
   * :param show: async (info) => "allow" | "always" | "decline": the card for calls the gate lets
   *   through. Defaults to the engine's own consent step.
   */
  install(engine, show) {
    const actions = engine.actions;
    const execute = actions.execute.bind(actions);
    actions.execute = async (plan, confirm, invocationId) => {
      const receipts = await execute(plan, confirm, invocationId);
      this.observe(receipts);
      return receipts;
    };
    const ask = typeof show === "function" ? show : engine.requestConsent.bind(engine);
    engine.requestConsent = async (info) => {
      const d = this.decide(info);
      if (d.action === "decline") {
        this.gateDeclined.add(info.peerOrigin);
        this.record({ kind: "stop", stop: "gate", host: info.peerOrigin, text: `Stopped by the gate: ${d.reason}` });
        return "decline";
      }
      return ask({ ...info, peerLabel: d.label });
    };
    engine.trace.addEventListener("event", (event) => {
      const stop = this.stopFrom(event.detail);
      if (stop) {
        this.record(stop);
      }
    });
    this.engine = engine;
    return this;
  }

  /**
   * Check one counterparty with FactGate from page code: no model, no key. Shows the card for
   * FactGate, loads FactGate's network by name (its manifest, network and action catalog), and
   * runs FactGate's gate_check in FactGate's own window, where the visitor approves each origin
   * FactGate reads. FactGate receives only target_url.
   *
   * :param engine: The runtime Engine (install() must have run).
   * :param targetUrl: The counterparty's URL.
   * :return: { ok: true, host, verdict, cautions, reasons, action, pass, why } or { ok: false, reason }.
   */
  async check(engine, targetUrl) {
    const host = hostOf(targetUrl);
    if (!engine.top) {
      await engine.loadTop();
    }
    const answer = await engine.requestConsent({
      kind: "network",
      peerLabel: this.label(this.factgateHost),
      peerOrigin: this.factgateHost,
      requestText: `Check ${targetUrl} (FactGate receives only target_url)`,
      est: { totalTokens: 0, costText: "no model" },
    });
    if (answer === "decline") {
      this.record({ kind: "stop", stop: "declined", text: `Not contacted: ${this.label(this.factgateHost)} (${this.factgateHost}) was declined on its card, so ${this.label(host)} was not checked.` });
      return { ok: false, reason: `FactGate was declined, so ${this.label(host)} was not checked.` };
    }
    try {
      await engine.resolveRemote(this.factgateUrl, [], null, engine.top.manifest);
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      this.record({ kind: "stop", stop: /^Policy: /.test(message) ? "denied_origin" : "error", text: `Stopped: FactGate's network could not be loaded: ${message}` });
      return { ok: false, reason: message };
    }
    this.record({ kind: "context", text: `Sent to ${this.label(this.factgateHost)}: target_url = ${targetUrl}. Nothing else from this page.` });
    let receipts;
    try {
      const plan = engine.actions.prepare({ kind: "action", action: this.gateCheckRef(), arguments: { url: targetUrl } });
      // FactGate's window shows its own card before it contacts anything (confirmsInWindow).
      receipts = await engine.actions.execute(plan, async () => true, newId());
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      this.record({ kind: "stop", stop: "error", text: `Stopped: FactGate's gate_check did not run: ${message}` });
      return { ok: false, reason: message };
    }
    const receipt = receipts && receipts[0];
    if (!receipt || receipt.status !== "succeeded" || !receipt.result || typeof receipt.result.verdict !== "string") {
      const why = receipt ? receipt.error || (receipt.result && receipt.result.reason) || receipt.status : "cancelled";
      this.record({ kind: "stop", stop: "error", text: `Stopped: FactGate gave no verdict for ${this.label(host)} (${why}).` });
      return { ok: false, reason: `FactGate gave no verdict (${why}).` };
    }
    const d = this.allows(host);
    const r = receipt.result;
    return { ok: true, host, verdict: r.verdict, cautions: r.cautions || [], reasons: r.reasons || [], action: r.action, pass: d.pass, why: d.why };
  }
}
