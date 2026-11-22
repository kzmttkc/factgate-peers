// Page logic for a demo stay site. The same file runs on Glossy Stay and Verified Stay;
// each site's differences live in stay-data.js and in its static files.
import { STAY } from "./stay-data.js";

/**
 * Fetch one of the site's own files and return its status and text.
 *
 * :param path: A path relative to the site folder, such as "api/book.json".
 * :return: A promise of {status, text}.
 */
async function fetchSiteFile(path) {
  const response = await fetch(new URL(`../${path}`, import.meta.url), { cache: "no-store" });
  return { status: response.status, text: await response.text() };
}

/**
 * The page object: room selection, booking and the page's own controls.
 *
 * The assistant's actions (site-actions.js) and the page's own forms call the same methods.
 */
export class StayPage {
  /**
   * :param data: The site's data from stay-data.js.
   * :param transport: The function that reads a site file, replaced in Node tests.
   */
  constructor(data, transport) {
    this.data = data;
    this.transport = transport;
    this.selection = null;
    this.version = 0;
    this.bookings = [];
    this.lastBookingResponse = null;
  }

  /**
   * :return: Every room id, for the action schemas.
   */
  roomIds() {
    return this.data.rooms.map((room) => room.id);
  }

  /**
   * :param id: A room id.
   * :return: The room, or undefined.
   */
  findRoom(id) {
    return this.data.rooms.find((room) => room.id === id);
  }

  /**
   * Return a plain copy of the page state, including what the site declares about itself.
   *
   * :return: The state as JSON data.
   */
  getState() {
    const base = typeof document !== "undefined" && document.URL ? new URL("./", document.URL).href : "";
    const declared = {};
    for (const [key, value] of Object.entries(this.data.declared)) {
      declared[key] = value && base && !/^[a-z]+:/i.test(value) && !value.startsWith("0x") ? new URL(value, base).href : value;
    }
    return JSON.parse(JSON.stringify({
      siteName: this.data.siteName,
      currency: this.data.currency,
      rooms: this.data.rooms,
      policies: this.data.policies,
      contact: this.data.contact,
      selection: this.selection,
      version: this.version,
      bookings: this.bookings,
      lastBookingResponse: this.lastBookingResponse,
      declared: declared,
    }));
  }

  /**
   * Choose a room and a number of nights. The visitor can change it again on the page.
   *
   * :param id: The room id.
   * :param nights: The number of nights.
   * :return: The new state, or {ok: false, reason, field}.
   */
  selectRoom(id, nights) {
    const room = this.findRoom(id);
    if (!room) {
      return { ok: false, reason: `There is no room "${id}".`, field: "room" };
    }
    if (!Number.isInteger(nights) || nights < 1 || nights > this.data.maxNights) {
      return { ok: false, reason: `Choose from 1 to ${this.data.maxNights} nights.`, field: "nights" };
    }
    this.selection = { room: room.id, roomName: room.name, nights: nights, total: room.nightly * nights };
    this.version += 1;
    this.render();
    return this.getState();
  }

  /**
   * The read-only check that placeBooking() runs first.
   *
   * :param args: {guestName, expectedVersion}.
   * :return: {ok: true, ...details} or {ok: false, reason, field}.
   */
  checkBooking(args) {
    const name = String(args.guestName || "").trim();
    if (!this.selection) {
      return { ok: false, reason: "Choose a room and nights first.", field: "room" };
    }
    if (args.expectedVersion !== this.version) {
      return { ok: false, reason: "The selection changed since it was read. Read the page state again.", field: "expectedVersion" };
    }
    if (!name) {
      return { ok: false, reason: "Give the guest's name.", field: "guestName" };
    }
    return { ok: true, guestName: name, ...this.selection };
  }

  /**
   * Send the booking to the site's booking action and report exactly what came back.
   * A booking counts only when the action returns a receipt with status "confirmed".
   *
   * :param args: {guestName, expectedVersion}.
   * :return: {httpStatus, contentLength, receipt} or {ok: false, reason, field}.
   */
  async placeBooking(args) {
    const check = this.checkBooking(args);
    if (!check.ok) {
      return check;
    }
    const response = await this.transport(this.data.declared.bookingAction);
    const text = String(response.text || "");
    let receipt = null;
    if (text.trim()) {
      receipt = JSON.parse(text);
    }
    this.lastBookingResponse = { httpStatus: response.status, contentLength: text.length };
    if (receipt && receipt.status === "confirmed") {
      const code = `${this.data.codePrefix}-${String(this.bookings.length + 1).padStart(4, "0")}`;
      receipt = {
        ...receipt,
        code: code,
        room: check.room,
        nights: check.nights,
        total: check.total,
        guestName: check.guestName,
      };
      this.bookings.push(receipt);
      this.selection = null;
      this.version += 1;
    }
    this.render();
    return { httpStatus: response.status, contentLength: text.length, receipt: receipt };
  }

  /**
   * Show the state on the page, when the page is there.
   */
  render() {
    if (typeof document === "undefined") {
      return;
    }
    const summary = document.getElementById("selection-summary");
    if (summary) {
      summary.textContent = this.selection
        ? `${this.selection.roomName}, ${this.selection.nights} night(s), ${this.selection.total} ${this.data.currency}.`
        : "No room chosen yet.";
    }
    const result = document.getElementById("booking-result");
    if (result && this.lastBookingResponse) {
      const last = this.bookings[this.bookings.length - 1];
      result.textContent = this.lastBookingResponse.contentLength === 0
        ? `The booking action answered HTTP ${this.lastBookingResponse.httpStatus} with an empty body. No booking was confirmed.`
        : last
          ? `Booking ${last.code} confirmed for ${last.guestName}.`
          : `The booking action answered HTTP ${this.lastBookingResponse.httpStatus}, but not with a confirmed receipt.`;
    }
  }

  /**
   * Fill in the page's lists and wire up its own forms.
   */
  mount() {
    if (typeof document === "undefined") {
      return;
    }
    const list = document.getElementById("room-list");
    const select = document.getElementById("room-select");
    // A page without the stay's markup, such as the booking window bridge/booking-window.js
    // opens for a partner, has nothing to fill in.
    if (!list || !select) {
      return;
    }
    for (const room of this.data.rooms) {
      const item = document.createElement("li");
      item.textContent = `${room.name}: ${room.nightly} ${this.data.currency}/night, up to ${room.guests} guests. ${room.summary}`;
      list.append(item);
      select.append(new Option(room.name, room.id));
    }
    const policies = document.getElementById("policy-list");
    for (const line of this.data.policies) {
      const item = document.createElement("li");
      item.textContent = line;
      policies.append(item);
    }
    document.getElementById("select-form").addEventListener("submit", this.onSelect.bind(this));
    document.getElementById("booking-form").addEventListener("submit", this.onBook.bind(this));
    this.render();
  }

  /**
   * The page's own "Choose this room" form.
   *
   * :param event: The submit event.
   */
  onSelect(event) {
    event.preventDefault();
    const nights = Number(document.getElementById("nights-input").value);
    const result = this.selectRoom(document.getElementById("room-select").value, nights);
    if (result.ok === false) {
      document.getElementById("selection-summary").textContent = result.reason;
    }
  }

  /**
   * The page's own "Book" form.
   *
   * :param event: The submit event.
   * :return: A promise that settles when the booking call returns.
   */
  async onBook(event) {
    event.preventDefault();
    const result = await this.placeBooking({
      guestName: document.getElementById("guest-name").value,
      expectedVersion: this.version,
    });
    if (result.ok === false) {
      document.getElementById("booking-result").textContent = result.reason;
    }
    return result;
  }
}

/**
 * Holds the one page object that the page, site.js and site-actions.js share.
 */
export class App {
  static page = new StayPage(STAY, fetchSiteFile);
}

App.page.mount();
