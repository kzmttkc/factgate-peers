// Stay Steward: a fictional booking agent for the FactGate demo. Every name here is made up.
//
// The page keeps the visitor's trip (dates and guest name) and the stay they want. That is
// private context: site.js hands it to the runtime as sly_data, and the steward's network allows
// only one field, target_url, to pass to a partner network (stay_steward.hocon, "allow"). The
// dates and the name never leave this page.

/**
 * The stays the steward can book, by the name its network uses for each (links.json).
 */
export const STAYS = Object.freeze([
  Object.freeze({ link: "verified_stay", label: "Verified Stay", url: "http://127.0.0.1:8792/verified_stay" }),
  Object.freeze({ link: "glossy_stay", label: "Glossy Stay", url: "http://127.0.0.1:8791/glossy_stay" }),
]);

/**
 * FactGate, the checker the steward asks before it links to a stay.
 */
export const FACTGATE = Object.freeze({ link: "factgate", label: "FactGate", url: "http://localhost:8790/factgate" });

const DAY = 24 * 60 * 60 * 1000;

/**
 * The page object: the trip, the chosen stay, and the gate log the page shows.
 */
export class TripPage {
  constructor() {
    this.trip = { checkIn: "2027-01-14", checkOut: "2027-01-16", guestName: "Kai Tanaka", stay: "verified_stay" };
    this.log = [];
    this.listeners = [];
  }

  /**
   * The chosen stay.
   *
   * :return: One of STAYS.
   */
  stay() {
    return STAYS.find((s) => s.link === this.trip.stay) || STAYS[0];
  }

  /**
   * Number of nights between the dates, or null when they do not make a stay.
   */
  nights() {
    const a = Date.parse(`${this.trip.checkIn}T00:00:00Z`);
    const b = Date.parse(`${this.trip.checkOut}T00:00:00Z`);
    const n = Math.round((b - a) / DAY);
    return Number.isInteger(n) && n >= 1 && n <= 14 ? n : null;
  }

  /**
   * Change the trip. Refuses dates that do not make a stay of 1 to 14 nights.
   *
   * :param next: Any of { checkIn, checkOut, guestName, stay }.
   * :return: { ok: true } or { ok: false, reason, field }.
   */
  update(next) {
    const merged = { ...this.trip, ...next };
    if (!STAYS.some((s) => s.link === merged.stay)) {
      return { ok: false, reason: "Choose Verified Stay or Glossy Stay.", field: "stay" };
    }
    const before = this.trip;
    this.trip = merged;
    if (this.nights() === null) {
      this.trip = before;
      return { ok: false, reason: "Choose a check-out 1 to 14 nights after check-in.", field: "checkOut" };
    }
    return { ok: true };
  }

  /**
   * The private context for the runtime (sly_data). Only target_url may pass to a partner.
   *
   * :return: { check_in, check_out, guest_name, target_url }.
   */
  privateContext() {
    return {
      check_in: this.trip.checkIn,
      check_out: this.trip.checkOut,
      guest_name: this.trip.guestName,
      target_url: this.stay().url,
    };
  }

  /**
   * What the assistant may read: the chosen stay and the number of nights. Not the dates or
   * the name, which stay on this page.
   */
  getTrip() {
    const stay = this.stay();
    return {
      stay: stay.label,
      stayNetwork: stay.link,
      stayUrl: stay.url,
      nights: this.nights(),
      factgate: FACTGATE.url,
      note: "The dates and the guest name stay on this page. The stay's own window asks for the guest name when it books.",
    };
  }

  /**
   * Add a line to the gate log the page shows.
   *
   * :param entry: { kind: "check" | "card" | "stop" | "context" | "done", text }.
   */
  record(entry) {
    const line = { at: new Date().toISOString(), ...entry };
    this.log.push(line);
    for (const listener of this.listeners) {
      listener(line);
    }
    return line;
  }
}

export class Trip {
  static page = new TripPage();
}
