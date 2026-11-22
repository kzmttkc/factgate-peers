// The booking Verified Stay shares with partner sites (here: Stay Steward), registered by
// bridge-actions.js. It follows the skill's templates/bridge/write-window.js.
//
// A partner's booking runs in a window on this site that the visitor sees, not in the partner's
// page. This window shows the room, nights and total with the site's own rules, and asks the
// visitor to type the guest name here. The partner's assistant gets back only the booking code
// and what was booked, never the name.
import { StayPage } from "../js/app.js";
import { STAY } from "../js/stay-data.js";

/**
 * Read one of the site's own files, from this window.
 *
 * :param path: A path relative to the site folder, such as "api/book.json".
 * :return: A promise of {status, text}.
 */
async function fetchSiteFile(path) {
  const response = await fetch(new URL(`../${path}`, import.meta.url), { cache: "no-store" });
  return { status: response.status, text: await response.text() };
}

/**
 * Shares one booking, made in one call, with the rules the page's own Book form uses.
 */
export class BookingWindow {
  /**
   * The sites allowed to book here, as exact origins with the port. Never "*".
   */
  static CALLERS = [
    "http://[::1]:8793",
  ];

  /**
   * Describe the shared booking.
   *
   * :return: The action definition.
   */
  static definition() {
    return {
      name: "book_stay",
      description: "Book a room at Verified Stay in one call, only when the visitor asks. Use a room id from website_get_stay_state. A window opens on Verified Stay, where the visitor checks the room, nights and total and types the guest name, so never ask for it. It returns once the visitor confirms or cancels there: the booking code and what was booked, or ok false with the reason.",
      effect: "irreversible",
      availability: "bridge",
      callerOrigins: BookingWindow.CALLERS,
      confirmsInWindow: true,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["room", "nights"],
        properties: {
          room: {
            type: "string",
            enum: STAY.rooms.map((room) => room.id),
            description: "Room id from website_get_stay_state.",
          },
          nights: {
            type: "integer",
            minimum: 1,
            maximum: STAY.maxNights,
            description: "Number of nights.",
          },
        },
      },
      execute: BookingWindow.start,
    };
  }

  /**
   * Check the request with the site's rules, then ask the visitor in this window.
   *
   * :param args: The validated request.
   * :param context: The bridge's call details, with the calling site's origin.
   * :return: A refusal, or the booking code and what was booked, or the visitor's cancel.
   */
  static async start(args, context) {
    const page = new StayPage(STAY, BookingWindow.transport);
    const selected = page.selectRoom(args.room, args.nights);
    if (selected.ok === false) {
      return { ok: false, reason: selected.reason };
    }
    const summary = page.selection;
    const answer = await BookingWindow.ask({
      caller: BookingWindow.hostOf(context?.callerOrigin),
      lines: [
        `${summary.roomName}, ${summary.nights} night(s): ${summary.total} ${STAY.currency}.`,
        ...STAY.policies,
      ],
    });
    if (!answer) {
      return { ok: false, reason: "The visitor cancelled in Verified Stay's window. Nothing was booked." };
    }
    const done = await page.placeBooking({ guestName: answer.guestName, expectedVersion: page.version });
    if (done.ok === false) {
      return { ok: false, reason: done.reason };
    }
    if (!done.receipt || done.receipt.status !== "confirmed") {
      return { ok: false, reason: `The booking action answered HTTP ${done.httpStatus} without a confirmed receipt. Nothing was booked.` };
    }
    BookingWindow.showDone(done.receipt.code);
    return {
      ok: true,
      reference: done.receipt.code,
      booked: { room: summary.roomName, nights: summary.nights, total: summary.total, currency: STAY.currency },
      note: "Booked. The visitor checked it and typed the guest name in Verified Stay's window, which has now closed.",
    };
  }

  /**
   * The function that reads the site's files. Tests replace it.
   */
  static transport = fetchSiteFile;

  /**
   * Show what will be booked and the guest-name form, and wait for the visitor. Tests replace it.
   *
   * :param view: { caller, lines }.
   * :return: A promise of { guestName }, or null when the visitor cancels.
   */
  static ask(view) {
    return new Promise((resolve) => {
      document.title = STAY.siteName;
      const sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = new URL("../styles.css", import.meta.url).href;
      document.head.append(sheet);
      const main = document.createElement("main");
      main.className = "booking-window";
      const h1 = document.createElement("h1");
      h1.textContent = `Book at ${STAY.siteName}`;
      const intro = document.createElement("p");
      intro.textContent = `The assistant on ${view.caller} asked Verified Stay to book this for you. Type the guest name here, not in the chat. Its chat gets the booking code and what was booked, not the name.`;
      const card = document.createElement("section");
      card.setAttribute("aria-label", "What you are booking");
      for (const line of view.lines) {
        const p = document.createElement("p");
        p.textContent = line;
        card.append(p);
      }
      const form = document.createElement("form");
      const label = document.createElement("label");
      label.htmlFor = "window-guest-name";
      label.textContent = "Guest name";
      const input = document.createElement("input");
      input.id = "window-guest-name";
      input.required = true;
      input.maxLength = 80;
      input.autocomplete = "name";
      const error = document.createElement("p");
      error.setAttribute("role", "alert");
      const confirm = document.createElement("button");
      confirm.type = "submit";
      confirm.textContent = "Book this stay";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      form.append(label, input, error, confirm, cancel);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const guestName = input.value.trim();
        if (!guestName) {
          error.textContent = "Type the guest name.";
          input.focus();
          return;
        }
        resolve({ guestName });
      });
      cancel.addEventListener("click", () => resolve(null));
      main.append(h1, intro, card, form);
      document.body.append(main);
      input.focus();
    });
  }

  /**
   * Show the code in this window, when it has one.
   *
   * :param code: The booking code.
   */
  static showDone(code) {
    if (typeof document === "undefined" || !document.querySelector(".booking-window")) {
      return;
    }
    const done = document.createElement("p");
    done.textContent = `Booked: ${code}. This window closes now.`;
    document.querySelector(".booking-window").replaceChildren(done);
  }

  /**
   * :param origin: The caller's origin from the bridge, if any.
   * :return: Its host, or "another site".
   */
  static hostOf(origin) {
    try {
      return new URL(origin).host;
    } catch {
      return "another site";
    }
  }
}
