// Spec section 6-7 stop cases as local fixtures (no network). Lines match FactGateGate.record / stopFrom.
import { FactGateGate } from "./factgate-gate.mjs";
import { FACTGATE, STAYS } from "./trip.mjs";

const PAGE_ORIGIN = "http://[::1]:8793";

function labels() {
  const out = { [new URL(FACTGATE.url).host]: FACTGATE.label };
  for (const s of STAYS) {
    out[new URL(s.url).host] = s.label;
  }
  out["[::1]:8793"] = "Stay Steward";
  return out;
}

const FIXTURES = [
  {
    name: "invalid_network",
    event: { kind: "tool", phase: "end", resultPreview: "Error from tool 'verified_stay': Network 'verified_stay' (127.0.0.1:8792) failed validation: unknown tool ghost_desk" },
    stop: "invalid_network",
  },
  {
    name: "cycle",
    event: { kind: "tool", phase: "end", resultPreview: "Skipped stay_steward: that network is already in this request's call chain. Continue" },
    stop: "cycle",
  },
  {
    name: "over_budget",
    event: { kind: "composition_limit", phase: "note", reason: "that network was already consulted for this query" },
    stop: "budget",
  },
  {
    name: "denied_origin_policy",
    event: { kind: "tool", phase: "end", resultPreview: "Error from tool 'rogue_stay': Policy: 127.0.0.1:8799 is not in stay_steward's allowed_peers; refusing to contact it." },
    stop: "denied_origin",
  },
  {
    name: "denied_origin_visitor",
    event: { kind: "consent", phase: "note", decision: "declined", peerOrigin: "127.0.0.1:8792" },
    stop: "declined",
  },
];

/**
 * Run the five 6-7 fixtures; each line is what the gate log would show.
 *
 * :param record: optional `(entry) => void`; default collects lines.
 * :return: `{ ok: true, lines: string[] }` or `{ ok: false, reason }`
 */
export function runSpec67SelfTest(record = null) {
  const lines = [];
  const sink = record || ((e) => lines.push(e.text));
  const gate = new FactGateGate({ factgateUrl: FACTGATE.url, pageOrigin: PAGE_ORIGIN, labels: labels(), record: sink });
  for (const f of FIXTURES) {
    const entry = gate.stopFrom(f.event);
    if (!entry || entry.stop !== f.stop) {
      return { ok: false, reason: `fixture ${f.name}: expected stop ${f.stop}, got ${entry && entry.stop}` };
    }
    sink(entry);
  }
  return { ok: true, lines: record ? undefined : lines };
}