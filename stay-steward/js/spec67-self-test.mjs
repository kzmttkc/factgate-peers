// Replays five recorded section-6 stop messages through the gate log (no network, no runtime checks).
import { FactGateGate } from "./factgate-gate.mjs";

const PAGE_ORIGIN = "https://stay-steward-demo.vercel.app";
const FACTGATE_URL = "https://factgate.vercel.app/factgate";

const HOSTS = Object.freeze({
  factgate: "factgate.vercel.app",
  verified: "verified-stay-demo.vercel.app",
  denied: "not-allowed.example",
});

function labels() {
  return {
    [HOSTS.factgate]: "FactGate",
    [HOSTS.verified]: "Verified Stay",
    [HOSTS.denied]: "Rogue Stay",
    "stay-steward-demo.vercel.app": "Stay Steward",
  };
}

const FIXTURES = [
  {
    name: "invalid_network",
    event: {
      kind: "tool",
      phase: "end",
      resultPreview: `Error from tool 'verified_stay': Network 'verified_stay' (${HOSTS.verified}) failed validation: unknown tool ghost_desk`,
    },
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
    event: {
      kind: "tool",
      phase: "end",
      resultPreview: `Error from tool 'rogue_stay': Policy: ${HOSTS.denied} is not in stay_steward's allowed_peers; refusing to contact it.`,
    },
    stop: "denied_origin",
  },
  {
    name: "denied_origin_visitor",
    event: { kind: "consent", phase: "note", decision: "declined", peerOrigin: HOSTS.verified },
    stop: "declined",
  },
];

/**
 * Replay the five recorded section-6 stop messages through the gate log.
 *
 * :param record: optional `(entry) => void`; default collects lines.
 * :return: `{ ok: true, lines: string[] }` or `{ ok: false, reason }`
 */
export function runSpec67SelfTest(record = null) {
  const lines = [];
  const sink = record || ((e) => lines.push(e.text));
  const gate = new FactGateGate({
    factgateUrl: FACTGATE_URL,
    pageOrigin: PAGE_ORIGIN,
    labels: labels(),
    record: sink,
  });
  for (const f of FIXTURES) {
    const entry = gate.stopFrom(f.event);
    if (!entry || entry.stop !== f.stop) {
      return { ok: false, reason: `fixture ${f.name}: expected stop ${f.stop}, got ${entry && entry.stop}` };
    }
    sink(entry);
  }
  return { ok: true, lines: record ? undefined : lines };
}