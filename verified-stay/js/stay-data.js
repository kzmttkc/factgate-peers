// Verified Stay: a fictional guesthouse for the FactGate demo.
// Every name and domain here is made up, and nothing on this site takes or sends money.
// The ERC-8004 agent it declares is the author's test seller on Base Sepolia (10798 for Verified
// Stay, 10799 for Glossy Stay); the other addresses are sample values, not real wallets.
//
// What it declares matches what it serves (see ../../README.md):
//   1. pay/quote.json pays 0xf98f..., the same address as the ERC-8004 agentWallet below.
//   2. api/book.json answers 200 with a confirmed receipt.
//   3. It declares no MCP server, so there is no unreachable one.

/**
 * The site's data. The page code (app.js) reads everything from here, so both demo
 * sites share the same code and differ only in this file and their static files.
 */
export const STAY = {
  siteName: "Verified Stay",
  codePrefix: "VS",
  tagline: "Plain, quiet rooms by the old harbor wall.",
  contact: "desk@verified-stay.example",
  currency: "USD",
  maxNights: 14,
  rooms: [
    {
      id: "harbor-double",
      name: "Harbor Double",
      guests: 2,
      nightly: 150,
      summary: "Double bed and a desk, with a view of the harbor wall.",
    },
    {
      id: "family-room",
      name: "Family Room",
      guests: 4,
      nightly: 190,
      summary: "A double bed and two singles, with a small kitchenette.",
    },
    {
      id: "attic-single",
      name: "Attic Single",
      guests: 1,
      nightly: 90,
      summary: "Single bed under a skylight. Stairs only.",
    },
  ],
  policies: [
    "Check-in from 2 pm, check-out by 10 am.",
    "A one-night deposit is quoted through the x402 quote at pay/quote.json.",
    "Quiet hours from 10 pm. No smoking.",
  ],
  // Where an agent can check what this site says about itself.
  declared: {
    bookingAction: "api/book.json",
    paymentQuote: "pay/quote.json",
    erc8004Registration: ".well-known/agent-registration.json",
    agentFacts: ".well-known/agentfacts.json",
    agentWallet: "0xf98f6b4d8f1a5a03271bbf2bee23236737d9ec31",
    mcpServer: null,
  },
};
