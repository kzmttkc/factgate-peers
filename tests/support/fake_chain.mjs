// Offline stand-ins for the public services FactGate reads, for the end-to-end tests: Base Sepolia
// JSON-RPC (ERC-8004 IdentityRegistry and ValidationRegistry) with the facts of the two demo
// agents as read on 2026-11-22 (README "On-chain records"), shortened to a few scores. Run the
// tests with FACTGATE_E2E_LIVE=1 to read the real chain instead.
import path from "node:path";
import { pathToFileURL } from "node:url";

const W = (n) => BigInt(n).toString(16).padStart(64, "0");
const WORD = (a) => `0x${"0".repeat(24)}${a.slice(2).toLowerCase()}`;
const STR = (s) => {
  const hex = Buffer.from(s).toString("hex");
  return `0x${W(32)}${W(Buffer.byteLength(s))}${hex.padEnd(Math.ceil(hex.length / 64) * 64 || 64, "0")}`;
};

export const JUDGE = "0x5ec4599a438fa0559ade8b8551b369d5c5adf0bc";

export const AGENTS = {
  10798: {
    owner: "0xf98f6b4d8f1a5a03271bbf2bee23236737d9ec31",
    uri: "https://raw.githubusercontent.com/kzmttkc/reactive-delivery-court/main/agents/seller-deliver.json",
    validations: [{ response: 99, answered: true }, { response: 100, answered: true }, { response: 0, answered: false }],
  },
  10799: {
    owner: "0x8dba1a8aed6ab7f1e2037bfc295f3a0a00be072f",
    uri: "https://raw.githubusercontent.com/kzmttkc/reactive-delivery-court/main/agents/seller-empty.json",
    validations: [{ response: 99, answered: true }, { response: 3, answered: true }],
  },
};

/**
 * Build the outside handler for PeerWeb.
 *
 * :param factgateSite: The FactGate site folder, to read the registry addresses and selectors.
 * :return: async (url, init) => Response | null.
 */
export async function fakeOutside(factgateSite) {
  const chain = await import(pathToFileURL(path.join(factgateSite, "js/chain.mjs")).href);
  const val = await import(pathToFileURL(path.join(factgateSite, "js/validation.mjs")).href);
  const hashOf = (agentId, i) => `0x${W(BigInt(agentId) * 1000n + BigInt(i + 1))}`;
  const tsOf = (n) => 1795200000 + Math.floor(n / 5);
  const head = 1000000;
  const answer = (body) => {
    const p0 = body.params && body.params[0];
    if (body.method === "eth_blockNumber") {
      return { result: `0x${head.toString(16)}` };
    }
    if (body.method === "eth_getBlockByNumber") {
      return { result: { timestamp: `0x${tsOf(parseInt(p0, 16)).toString(16)}` } };
    }
    if (body.method === "eth_getLogs") {
      const agentId = Number(BigInt(p0.topics[2]));
      const a = AGENTS[agentId];
      const i = a ? a.validations.findIndex((_, k) => hashOf(agentId, k) === p0.topics[3]) : -1;
      const v = i >= 0 ? a.validations[i] : null;
      const isResponse = p0.topics[0] === val.VALIDATION_TOPICS.response;
      if (v && (isResponse ? v.answered : !v.answered)) {
        return { result: [{ blockNumber: p0.fromBlock, transactionHash: `0x${String(agentId % 10).repeat(60)}${String(i).padStart(4, "0")}`, logIndex: "0x2", data: `0x${W(v.response)}` }] };
      }
      return { result: [] };
    }
    if (body.method !== "eth_call") {
      return { error: { code: -32601, message: `${body.method} is not read here` } };
    }
    const to = String(p0.to).toLowerCase();
    const data = String(p0.data);
    if (to === chain.IDENTITY_REGISTRY.testnet.toLowerCase()) {
      const agentId = Number(BigInt(`0x${data.slice(10)}`));
      const a = AGENTS[agentId];
      if (!a) {
        return { error: { code: 3, message: "execution reverted: ERC721NonexistentToken" } };
      }
      if (data.startsWith(chain.SELECTORS.ownerOf) || data.startsWith(chain.SELECTORS.getAgentWallet)) {
        return { result: WORD(a.owner) };
      }
      return { result: STR(a.uri) };
    }
    if (to === val.VALIDATION_REGISTRY.testnet.toLowerCase()) {
      if (data.startsWith(val.VALIDATION_SELECTORS.getAgentValidations)) {
        const agentId = Number(BigInt(`0x${data.slice(10)}`));
        const list = (AGENTS[agentId] || { validations: [] }).validations.map((_, i) => hashOf(agentId, i).slice(2));
        return { result: `0x${W(32)}${W(list.length)}${list.join("")}` };
      }
      const hash = `0x${data.slice(10)}`;
      for (const [agentId, a] of Object.entries(AGENTS)) {
        const i = a.validations.findIndex((_, k) => hashOf(agentId, k) === hash);
        if (i >= 0) {
          const v = a.validations[i];
          return { result: `0x${W(BigInt(JUDGE))}${W(agentId)}${W(v.answered ? v.response : 0)}${"ab".repeat(32)}${W(192)}${W(1795300000 + i)}${W(0)}` };
        }
      }
    }
    return { error: { code: -32000, message: `unexpected call to ${to}` } };
  };
  return async (url, init = {}) => {
    // The NANDA Index list (FactGate looks the counterparty up there): the demo stays are not in it.
    if (url.origin === "https://api.nandaindex.org" && url.pathname === "/api/v1/index") {
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.origin === "https://sepolia.base.org" && String(init.method || "GET").toUpperCase() === "POST") {
      const body = JSON.parse(init.body);
      const out = Array.isArray(body) ? body.map((b) => ({ jsonrpc: "2.0", id: b.id, ...answer(b) })) : { jsonrpc: "2.0", id: body.id ?? 1, ...answer(body) };
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    }
    return null;
  };
}
