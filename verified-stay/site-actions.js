// Registers this site's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
import { App } from "./js/app.js";

/**
 * Describes the page's operations as actions the agents can call. Each one wraps a
 * method the page's own forms use, so the assistant and the page share one set of rules.
 */
class SiteActions {
  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.readStateAction());
    actions.register(SiteActions.selectRoomAction());
    actions.register(SiteActions.placeBookingAction());
  }

  /**
   * :return: The read action definition.
   */
  static readStateAction() {
    return {
      name: "get_stay_state",
      description: "Read the rooms, nightly prices, house policies, the visitor's current room choice with its version, past bookings, the last booking response, and the URLs where this site declares its booking action, payment quote, identity and MCP server. Call it before answering about rooms, prices, policies or payment, and again in each turn that needs it: the visitor can also use the page.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.readState,
    };
  }

  /**
   * :return: The page state.
   */
  static readState() {
    return App.page.getState();
  }

  /**
   * :return: The write action definition.
   */
  static selectRoomAction() {
    return {
      name: "select_room",
      description: "Call it only when the visitor asks, with a room id from website_get_stay_state. Puts that room and number of nights in the page's booking box, replacing any earlier choice. Returns the updated state with the new version, or ok false with a reason. Does not book.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["room", "nights"],
        properties: {
          room: {
            type: "string",
            enum: App.page.roomIds(),
            description: "Room id from website_get_stay_state.",
          },
          nights: {
            type: "integer",
            minimum: 1,
            maximum: 14,
            description: "Number of nights.",
          },
        },
      },
      execute: SiteActions.selectRoom,
    };
  }

  /**
   * :param args: The validated arguments.
   * :return: The updated state, or {ok: false, reason}.
   */
  static selectRoom(args) {
    return App.page.selectRoom(args.room, args.nights);
  }

  /**
   * :return: The irreversible action definition.
   */
  static placeBookingAction() {
    return {
      name: "place_booking",
      description: "Book the room in the page's booking box for the named guest. First ask for the guest's name. In the turn you call it, first call website_get_stay_state and wait for its result: this needs its current version. The browser asks the visitor to confirm. Returns the booking action's HTTP status, body length and receipt. Only a receipt with status confirmed is a booking; an empty receipt is not.",
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["guestName", "expectedVersion"],
        properties: {
          guestName: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "The guest's name as the visitor gave it.",
          },
          expectedVersion: {
            type: "integer",
            minimum: 0,
            description: "The latest version in this turn: from website_get_stay_state, or from a website_select_room made after that read.",
          },
        },
      },
      execute: SiteActions.placeBooking,
    };
  }

  /**
   * :param args: The validated, visitor-confirmed arguments.
   * :return: The booking response, or {ok: false, reason}.
   */
  static placeBooking(args) {
    return App.page.placeBooking(args);
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
