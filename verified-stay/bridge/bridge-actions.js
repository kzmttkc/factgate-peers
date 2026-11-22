// What Verified Stay shares with partner sites, through its action bridge. The build names this
// file in bridge/agent-manifest.json. Only names in the manifest's "actions.agentTools" reach a
// partner's agents.
//
// get_stay_state runs in a hidden frame on this origin, which has no page: it returns the rooms,
// prices and policies, the same facts the public page shows, and nothing one visitor did.
// book_stay runs in a window on this origin that the visitor sees (booking-window.js).
import { StayPage } from "../js/app.js";
import { STAY } from "../js/stay-data.js";
import { BookingWindow } from "./booking-window.js";

class BridgeActions {
  /**
   * The sites allowed to read the rooms and prices: the facts the public page already shows.
   */
  static CALLERS = [
    "http://[::1]:8793",
  ];

  static registerActions(actions) {
    actions.register(BridgeActions.readStateAction());
    actions.register(BookingWindow.definition());
  }

  static readStateAction() {
    return {
      name: "get_stay_state",
      description: "Read Verified Stay's rooms, nightly prices and house policies, and the URLs where it declares its booking action, payment quote and identity. Changes nothing. Call it before answering about rooms or prices.",
      effect: "read",
      availability: "bridge",
      callerOrigins: BridgeActions.CALLERS,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: BridgeActions.readState,
    };
  }

  static readState() {
    const state = new StayPage(STAY, async () => ({ status: 0, text: "" })).getState();
    return { rooms: state.rooms, policies: state.policies, currency: state.currency, declared: state.declared };
  }
}

export const registerActions = BridgeActions.registerActions;
export { BookingWindow };
