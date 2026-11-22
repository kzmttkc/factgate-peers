// Registers Stay Steward's page operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
import { Trip } from "./js/trip.mjs";

class SiteActions {
  static registerActions(actions) {
    actions.register(SiteActions.getTripAction());
  }

  static getTripAction() {
    return {
      name: "get_trip",
      description: "Read the stay the visitor picked on this page, its agent network URL, the number of nights and FactGate's URL. The dates and the guest name stay on the page and are not returned. Changes nothing.",
      effect: "read",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: () => Trip.page.getTrip(),
    };
  }
}

export const registerActions = SiteActions.registerActions;
