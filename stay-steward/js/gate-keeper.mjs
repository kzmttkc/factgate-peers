// The gate before linking. Stay Steward never loads a stay's agent network unless FactGate
// checked that stay in this visit and did not answer BLOCK.
//
// It is page code, not a model instruction, so a model that ignores its instructions still
// cannot link to a blocked stay:
//   1. It watches the runtime's action receipts. A receipt from FactGate's gate_check (FactGate's
//      bridge, run in FactGate's window) records { host -> verdict, reasons }.
//   2. It sits in front of the runtime's consent step (engine.requestConsent). Before the card
//      for a partner network, it decides: FactGate itself and this page's own origin go to the
//      card; a stay with ALLOW or CAUTION goes to the card (CAUTION says so on the card); a stay
//      FactGate blocked, or never checked, is declined at once. A declined call fetches nothing
//      (runtime/runner.js returns "The user declined to contact <host>").
//   3. It listens to the runtime's trace and puts every stop on the page: over budget, refused
//      by policy, an invalid network, a cycle, a declined card.
// The runtime's own checks (allowed_peers, budgets, cycles, validation) still run after this.

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "");
  }
}

export class GateKeeper {
  /**
   * :param options: { factgateUrl, pageOrigin, labels: { host: label }, record(entry) }
   */
  constructor({ factgateUrl, pageOrigin, labels = {}, record = () => {} }) {
    this.factgateUrl = factgateUrl;
    this.factgateHost = hostOf(factgateUrl);
    this.factgateBase = new URL("./", factgateUrl).href.replace(/\/$/, "");
    this.pageHost = hostOf(pageOrigin);
    this.labels = labels;
    this.record = record;
    // host -> { verdict, reasons, url, checkedAt }
    this.verdicts = new Map();
    // Hosts whose card the gate declined, so the runtime's "declined" note is not shown twice.
    this.gateDeclined = new Set();
  }

  label(host) {
    return this.labels[host] || host;
  }

  /**
   * Record FactGate's verdicts from a batch of action receipts.
   *
   * :param receipts: The runtime's receipts, or null when the visitor declined.
   */
  observe(receipts) {
    for (const r of Array.isArray(receipts) ? receipts : []) {
      if (r && r.action === `${this.factgateBase}/factgate#gate_check` && r.status === "succeeded" && r.result && typeof r.result.url === "string" && typeof r.result.verdict === "string") {
        const host = hostOf(r.result.url);
        const reasons = Array.isArray(r.result.reasons) ? r.result.reasons : [];
        this.verdicts.set(host, { verdict: r.result.verdict, reasons, url: r.result.url, checkedAt: r.result.checkedAt });
        const worst = reasons.filter((x) => x.effect === r.result.verdict).map((x) => x.text);
        this.record({ kind: "check", host, verdict: r.result.verdict, text: `FactGate checked ${this.label(host)} (${host}): ${r.result.verdict}.${worst.length ? ` ${worst[0]}` : ""}` });
      }
    }
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
    if (host === this.factgateHost) {
      return { action: "ask", label: this.label(host) };
    }
    if (host === this.pageHost) {
      return { action: "ask", label: this.label(host) };
    }
    const v = this.verdicts.get(host);
    if (!v) {
      return { action: "decline", label: this.label(host), reason: `FactGate has not checked ${this.label(host)} (${host}) in this visit, so Stay Steward does not link to it.` };
    }
    if (v.verdict === "BLOCK") {
      const why = v.reasons.filter((x) => x.effect === "BLOCK").map((x) => x.text);
      return { action: "decline", label: this.label(host), reason: `FactGate answered BLOCK for ${this.label(host)} (${host}), so Stay Steward does not link to it. ${why.join(" ")}`.trim() };
    }
    if (v.verdict === "CAUTION") {
      return { action: "ask", label: `${this.label(host)} (FactGate: CAUTION)` };
    }
    return { action: "ask", label: `${this.label(host)} (FactGate: ALLOW)` };
  }

  /**
   * Turn one runtime trace event into a stop the page shows, or null.
   */
  stopFrom(ev) {
    if (ev.kind === "composition_limit" && ev.phase === "note") {
      return { kind: "stop", stop: "budget", text: `Stopped (over budget): ${ev.reason}.` };
    }
    if (ev.kind === "consent" && ev.phase === "note" && ev.decision === "declined") {
      // A call the gate itself declined is already on the page.
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
      return { kind: "context", text: `Private context sent to ${this.label(ev.peerOrigin)}: ${keys.length ? keys.join(", ") : "nothing"}. The dates and the guest name stay on this page.` };
    }
    return null;
  }

  /**
   * Attach the gate to a runtime engine.
   *
   * :param engine: The runtime Engine.
   * :param show: async (info) => "allow" | "always" | "decline": the runtime's card, for calls
   *   the gate lets through. Defaults to the engine's own consent step.
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
    return this;
  }
}
