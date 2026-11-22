// Glossy Stay: a fictional guesthouse for the FactGate demo.
// Every name and domain here is made up, and nothing on this site takes or sends money.
// The ERC-8004 agent it declares is the author's test seller on Base Sepolia (10798 for Verified
// Stay, 10799 for Glossy Stay); the other addresses are sample values, not real wallets.
//
// Planted mismatches (see ../../README.md):
//   1. pay/quote.json pays 0x2222..., but the ERC-8004 agentWallet below is 0x1111...
//   2. api/book.json answers 200 with an empty body, so a "booking" comes back empty.
//   3. The MCP server named in the network and the registration never answers
//      (".invalid" never resolves).

/**
 * The site's data. The page code (app.js) reads everything from here, so both demo
 * sites share the same code and differ only in this file and their static files.
 */
export const STAY = {
  siteName: "Glossy Stay",
  codePrefix: "GS",
  tagline: "Design rooms above a quiet canal. Book in seconds.",
  contact: "hello@glossy-stay.example",
  currency: "USD",
  maxNights: 14,
  rooms: [
    {
      id: "skyline-suite",
      name: "Skyline Suite",
      guests: 2,
      nightly: 240,
      summary: "Corner suite with floor-to-ceiling windows and a soaking tub.",
    },
    {
      id: "garden-loft",
      name: "Garden Loft",
      guests: 3,
      nightly: 180,
      summary: "Split-level loft over the courtyard garden, with a sofa bed.",
    },
    {
      id: "canal-twin",
      name: "Canal Twin",
      guests: 2,
      nightly: 130,
      summary: "Two single beds and a window seat over the canal.",
    },
  ],
  policies: [
    "Check-in from 3 pm, check-out by 11 am.",
    "A one-night deposit is quoted through the x402 quote at pay/quote.json.",
    "No pets. No smoking.",
  ],
  // Where an agent can check what this site says about itself.
  declared: {
    bookingAction: "api/book.json",
    paymentQuote: "pay/quote.json",
    erc8004Registration: ".well-known/agent-registration.json",
    agentFacts: ".well-known/agentfacts.json",
    agentWallet: "0x1111111111111111111111111111111111111111",
    mcpServer: "https://mcp.glossy-stay.invalid/mcp",
  },
};
