// What this demo site declares for FactGate: the author's test seller on Base Sepolia, the
// payee in the quote, the wallet it names, and the line that says who runs the demo.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const AGENT_ID = 10799;
const PAY_TO = "0x2222222222222222222222222222222222222222";
const WALLET = "0x1111111111111111111111111111111111111111";
const OFFICIAL_SEPOLIA = "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e";

test("the registration names the author's test seller in the official Base Sepolia IdentityRegistry", async () => {
  const reg = JSON.parse(await read(".well-known/agent-registration.json"));
  assert.deepEqual(reg.registrations, [{ agentId: AGENT_ID, agentRegistry: OFFICIAL_SEPOLIA }]);
  assert.equal(reg.agentWallet.toLowerCase(), WALLET);
});

test("the quote pays the declared payTo, and the manifest names the same wallet as the registration", async () => {
  const quote = JSON.parse(await read("pay/quote.json"));
  assert.equal(quote.accepts[0].payTo.toLowerCase(), PAY_TO);
  const manifest = JSON.parse(await read("agent-manifest.json"));
  assert.equal(manifest.trust.identity.agentWallet.toLowerCase(), `eip155:84532:${WALLET}`);
});

test("the page says the demo is run by the author", async () => {
  const html = await read("index.html");
  assert.ok(html.includes("Demo sites run by the author. Agent IDs are the author's test sellers on Base Sepolia."));
});
