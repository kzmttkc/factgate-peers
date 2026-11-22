// Stay Steward's own checks: its named partner links agree across links.json, the network and the
// manifest; only target_url may leave as private context; the gate's decisions; the build.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolveAgentifySkill, resolveFactgateSite } from "../../tests/support/paths.mjs";
import { DEFAULT_POLICY, FactGateGate, policyAllows } from "../js/factgate-gate.mjs";
import { FACTGATE, GATE_POLICY, STAYS, TripPage } from "../js/trip.mjs";

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SKILL = resolveAgentifySkill();
const json = async (f) => JSON.parse(await readFile(path.join(DIR, f), "utf8"));

test("the three partners are named the same way in links.json, the network's link slots, the manifest's imports and allowed_peers", async () => {
  const links = (await json("links.json")).networks.stay_steward;
  const network = await json("stay_steward.network.json");
  const manifest = await json("agent-manifest.json");
  const names = ["factgate", "verified_stay", "glossy_stay"];
  assert.deepEqual(Object.keys(links).sort(), [...names].sort());
  assert.deepEqual(Object.keys(network.link_slots).sort(), [...names].sort());
  assert.deepEqual(network.tools[0].tools, names);
  assert.deepEqual(manifest.linking.imports.map((i) => [i.reference, i.url]), names.map((n) => [n, links[n]]));
  assert.deepEqual([...manifest.allowed_peers].sort(), [...new Set(names.map((n) => new URL(links[n]).origin))].sort());
  assert.equal(manifest.peer_policy.mode, "closed");
  // Each URL ends with the exact published network name (spec 3.2).
  assert.equal(links.factgate, FACTGATE.url);
  for (const stay of STAYS) {
    assert.equal(links[stay.link], stay.url);
    assert.equal(new URL(stay.url).pathname.split("/").pop(), stay.link);
  }
});

test("only target_url may pass to a partner as private context", async () => {
  const network = await json("stay_steward.network.json");
  assert.deepEqual(network.tools[0].allow, { to_downstream: { sly_data: ["target_url"] } });
  const page = new TripPage();
  assert.deepEqual(Object.keys(page.privateContext()).sort(), ["check_in", "check_out", "guest_name", "target_url"]);
  // What the assistant can read has neither the dates nor the name.
  const trip = JSON.stringify(page.getTrip());
  for (const v of [page.trip.guestName, page.trip.checkIn, page.trip.checkOut]) {
    assert.ok(!trip.includes(v), `get_trip returned ${v}`);
  }
  assert.equal(page.getTrip().nights, 2);
  assert.equal(page.update({ checkOut: "2027-01-14" }).ok, false);
  assert.equal(page.update({ stay: "glossy_stay" }).ok, true);
  assert.equal(page.privateContext().target_url, "http://127.0.0.1:8791/glossy_stay");
});

test("the gate: FactGate and this page go to the card; a stay goes only after FactGate, and never after BLOCK", () => {
  const log = [];
  const gate = new FactGateGate({ factgateUrl: FACTGATE.url, pageOrigin: "http://[::1]:8793", labels: { "127.0.0.1:8792": "Verified Stay", "127.0.0.1:8791": "Glossy Stay" }, record: (e) => log.push(e) });
  const card = (host) => gate.decide({ kind: "network", peerOrigin: host, peerLabel: host });
  assert.equal(card("localhost:8790").action, "ask");
  assert.equal(card("[::1]:8793").action, "ask");
  assert.equal(card("127.0.0.1:8792").action, "decline");
  assert.match(card("127.0.0.1:8792").reason, /has not checked Verified Stay/);
  const receipt = (url, verdict, reasons = []) => ({ action: "http://localhost:8790/factgate#gate_check", status: "succeeded", result: { url, verdict, reasons } });
  gate.observe([receipt("http://127.0.0.1:8792/verified_stay", "ALLOW"), receipt("http://127.0.0.1:8791/glossy_stay", "BLOCK", [{ effect: "BLOCK", text: "payTo 0x2222 is not the registered wallet." }])]);
  assert.deepEqual(card("127.0.0.1:8792"), { action: "ask", label: "Verified Stay (FactGate: ALLOW)" });
  const blocked = card("127.0.0.1:8791");
  assert.equal(blocked.action, "decline");
  assert.match(blocked.reason, /BLOCK for Glossy Stay.*payTo 0x2222/);
  // A receipt from any other action, or a failed one, records nothing.
  gate.observe([{ action: "http://127.0.0.1:8792/verified_stay#gate_check", status: "succeeded", result: { url: "http://evil.example/x", verdict: "ALLOW" } }, { ...receipt("http://other.example/x", "ALLOW"), status: "unknown" }]);
  assert.equal(card("other.example").action, "decline");
  assert.equal(card("evil.example").action, "decline");
  assert.equal(gate.decide({ kind: "mcp", peerOrigin: "x.example", peerLabel: "Destination service" }).action, "ask");
  assert.equal(log.filter((l) => l.kind === "check").length, 2);
});

test("the gate turns runtime stops into lines the page shows", () => {
  const gate = new FactGateGate({ factgateUrl: FACTGATE.url, pageOrigin: "http://[::1]:8793" });
  assert.equal(gate.stopFrom({ kind: "composition_limit", phase: "note", reason: "that network was already consulted for this query" }).stop, "budget");
  assert.equal(gate.stopFrom({ kind: "tool", phase: "end", resultPreview: "Error from tool 'rogue': Policy: 127.0.0.1:8799 is not in stay_steward's allowed_peers; refusing to contact it." }).stop, "denied_origin");
  assert.equal(gate.stopFrom({ kind: "tool", phase: "end", resultPreview: "Error from tool 'verified_stay': Network 'verified_stay' (127.0.0.1:8792) failed validation: x" }).stop, "invalid_network");
  assert.equal(gate.stopFrom({ kind: "tool", phase: "end", resultPreview: "Skipped stay_steward: that network is already in this request's call chain. Continue" }).stop, "cycle");
  assert.equal(gate.stopFrom({ kind: "consent", phase: "note", decision: "declined", peerOrigin: "127.0.0.1:8792" }).stop, "declined");
  assert.match(gate.stopFrom({ kind: "remote_call", phase: "start", peerOrigin: "localhost:8790", requestPayload: { sly_data: { target_url: "<redacted>" } } }).text, /Private context sent to localhost:8790: target_url/);
  assert.equal(gate.stopFrom({ kind: "tool", phase: "end", resultPreview: "{\"ok\":true}" }), null);
});

test("the build passes --check; its only warnings are the expected ones for named links", async (t) => {
  if (!existsSync(path.join(SKILL, "scripts/build_network.mjs"))) return t.skip(`set AGENTIFY_SKILL to the agentic-web skills/agentify-website folder (not found at ${SKILL})`);
  const run = promisify(execFile);
  const { stdout, stderr } = await run(process.execPath, [path.join(SKILL, "scripts/build_network.mjs"), path.join(DIR, "stay_steward.hocon"), "--manifest", path.join(DIR, "agent-manifest.json"), "--check"]);
  const warnings = `${stdout}\n${stderr}`.split("\n").filter((l) => l.startsWith("WARNING"));
  assert.equal(warnings.length, 5, warnings.join("\n"));
  assert.ok(warnings.every((w) => /link_slots|linking\.imports|allowed_peers lists http/.test(w)), warnings.join("\n"));
});

test("the shared gate is FactGate's factgate-gate.mjs, byte for byte", async (t) => {
  const site = resolveFactgateSite();
  if (!existsSync(path.join(site, "factgate-gate.mjs"))) return t.skip(`set FACTGATE_SITE to a factgate checkout's site folder (not found at ${site})`);
  const ours = await readFile(path.join(DIR, "js/factgate-gate.mjs"), "utf8");
  const theirs = await readFile(path.join(site, "factgate-gate.mjs"), "utf8");
  assert.equal(ours, theirs, "stay-steward/js/factgate-gate.mjs differs from FactGate's site/factgate-gate.mjs");
});

test("the gate policy: ALLOW passes, BLOCK never, CAUTION only for the kinds a site accepts; the default accepts none", () => {
  assert.deepEqual(DEFAULT_POLICY.passCaution, []);
  assert.equal(policyAllows(DEFAULT_POLICY, { verdict: "ALLOW" }).pass, true);
  assert.equal(policyAllows(DEFAULT_POLICY, { verdict: "CAUTION", cautions: ["identity_unknown"] }).pass, false);
  assert.equal(policyAllows(GATE_POLICY, { verdict: "CAUTION", cautions: ["identity_unknown"] }).pass, true);
  assert.equal(policyAllows(GATE_POLICY, { verdict: "CAUTION", cautions: ["identity_unknown", "unreachable"] }).pass, false);
  assert.equal(policyAllows(GATE_POLICY, { verdict: "CAUTION", cautions: ["steering"] }).pass, false);
  // BLOCK cannot be let through, whatever the list says; unknown kinds are dropped from a policy.
  assert.equal(policyAllows({ passCaution: ["BLOCK", "identity_unknown"] }, { verdict: "BLOCK" }).pass, false);
  assert.equal(policyAllows({ passCaution: ["anything"] }, { verdict: "CAUTION", cautions: ["anything"] }).pass, false);
  // A CAUTION with no kinds named (an older FactGate) is "unknown", which no policy lists.
  assert.equal(policyAllows(GATE_POLICY, { verdict: "CAUTION", reasons: [{ effect: "CAUTION" }] }).pass, false);
  const gate = new FactGateGate({ factgateUrl: FACTGATE.url, pageOrigin: "http://[::1]:8793", policy: GATE_POLICY });
  const receipt = (url, verdict, cautions) => ({ action: "http://localhost:8790/factgate#gate_check", status: "succeeded", result: { url, verdict, cautions, reasons: [] } });
  gate.observe([receipt("http://a.example/a", "CAUTION", ["identity_unknown"]), receipt("http://b.example/b", "CAUTION", ["unreachable", "identity_unknown"])]);
  assert.equal(gate.decide({ kind: "network", peerOrigin: "a.example" }).action, "ask");
  assert.equal(gate.decide({ kind: "network", peerOrigin: "b.example" }).action, "decline");
  assert.match(gate.decide({ kind: "network", peerOrigin: "b.example" }).reason, /CAUTION for b\.example \(b\.example\) \(unreachable\), which this site's policy does not accept/);
});
