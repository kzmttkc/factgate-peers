// The "Check with FactGate" button: the same gate the assistant goes through, run by page code,
// with no model and no key. It needs only the runtime engine (booted without a key) and the gate.
//
//   1. gate.check(): the card for FactGate, FactGate's network loaded by name, FactGate's
//      gate_check in FactGate's own window (its card lists each origin it reads). FactGate
//      receives only target_url.
//   2. If the gate passes the stay (ALLOW, or a CAUTION this site's policy accepts): the stay's
//      card, the stay's network loaded by name (spec 3.2), its rooms read, and its booking window
//      opened (the stay's own book_stay; the visitor checks the room, nights and total and types
//      the guest name there).
//   3. If not (BLOCK, a CAUTION the policy does not accept, or no verdict): stop, and say why.

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url || "");
  }
}

function refOf(networkUrl, action) {
  const u = new URL(networkUrl);
  const network = u.pathname.split("/").filter(Boolean).pop();
  return `${new URL("./", u).href.replace(/\/$/, "")}/${encodeURIComponent(network)}#${action}`;
}

function newId() {
  return globalThis.crypto && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID() : `ss-${Date.now()}`;
}

async function run(engine, ref, args) {
  const plan = engine.actions.prepare({ kind: "action", action: ref, arguments: args });
  // A partner's write is confirmed in the partner's own window (confirmsInWindow), as when the
  // assistant calls it from the stay's network.
  const receipts = await engine.actions.execute(plan, async () => true, newId());
  return receipts && receipts[0];
}

/**
 * Check the chosen stay with FactGate, then book it in its own window, or stop.
 *
 * :param options: { engine, gate, stay: { label, url }, nights, record(entry) }
 * :return: { ok, step: "factgate" | "gate" | "load" | "rooms" | "booking" | "done", verdict?, reason?, booking? }
 */
export async function checkAndBook({ engine, gate, stay, nights, record = () => {} }) {
  const host = hostOf(stay.url);
  const checked = await gate.check(engine, stay.url);
  if (!checked.ok) {
    return { ok: false, step: "factgate", reason: checked.reason };
  }
  if (!checked.pass) {
    const why = checked.reasons.filter((r) => r.effect === checked.verdict).map((r) => r.short || r.text).join(" ");
    const reason = `${checked.why} ${why}`.trim();
    record({ kind: "stop", stop: "gate", host, text: `Stopped by the gate: ${stay.label} is not loaded. ${reason}` });
    return { ok: false, step: "gate", verdict: checked.verdict, action: checked.action, reason };
  }
  const answer = await engine.requestConsent({
    kind: "network",
    peerLabel: stay.label,
    peerOrigin: host,
    requestText: `Book a room for ${nights} night(s). ${stay.label} receives only target_url.`,
    est: { totalTokens: 0, costText: "no model" },
  });
  if (answer === "decline") {
    record({ kind: "stop", stop: "declined", text: `Not contacted: ${stay.label} (${host}) was declined on its card.` });
    return { ok: false, step: "load", verdict: checked.verdict, reason: `${stay.label} was declined on its card.` };
  }
  try {
    await engine.resolveRemote(stay.url, [], null, engine.top.manifest);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    record({ kind: "stop", stop: /^Policy: /.test(message) ? "denied_origin" : /failed validation/.test(message) ? "invalid_network" : "error", text: `Stopped: ${stay.label}'s network could not be loaded: ${message}` });
    return { ok: false, step: "load", verdict: checked.verdict, reason: message };
  }
  record({ kind: "context", text: `Loaded ${stay.label}'s network by name after its card. It receives only target_url.` });
  const state = await run(engine, refOf(stay.url, "get_stay_state"), {});
  const rooms = state && state.status === "succeeded" && state.result && Array.isArray(state.result.rooms) ? state.result.rooms : [];
  if (!rooms.length) {
    record({ kind: "stop", stop: "error", text: `Stopped: ${stay.label} listed no rooms (${state ? state.error || state.status : "no answer"}).` });
    return { ok: false, step: "rooms", verdict: checked.verdict, reason: "no rooms" };
  }
  const booking = await run(engine, refOf(stay.url, "book_stay"), { room: rooms[0].id, nights });
  if (!booking || booking.status !== "succeeded" || !booking.result || booking.result.ok === false) {
    const why = booking ? booking.error || (booking.result && booking.result.reason) || booking.status : "cancelled";
    record({ kind: "stop", stop: "error", text: `Not booked: ${why}.` });
    return { ok: false, step: "booking", verdict: checked.verdict, reason: String(why) };
  }
  record({ kind: "done", text: `Booked at ${stay.label} in its own window: ${booking.result.reference || JSON.stringify(booking.result)}.` });
  return { ok: true, step: "done", verdict: checked.verdict, booking: booking.result };
}
