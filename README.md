# FactGate demo peers: Stay Steward, Glossy Stay and Verified Stay

Three fictional sites for the FactGate demo: a booking agent (Stay Steward) and two
guesthouses. Stay Steward loads FactGate and the two stays as partner networks by name, asks
FactGate about a stay before it loads that stay, and books in the stay's own window. See
"Stay Steward" below.

## Run the tests from a fresh clone

Clone the three repos **side by side** (sibling folders), then run the test suites from each checkout:

```shell
mkdir -p ~/demo && cd ~/demo
git clone https://github.com/kzmttkc/factgate
git clone https://github.com/kzmttkc/factgate-peers
git clone https://github.com/cognizant-ai-labs/agentic-web
```

From `factgate-peers` (expects `../factgate/site` and `../agentic-web/skills/agentify-website`):

```shell
cd factgate-peers
node --test "*/tests/*.test.mjs" "tests/*.test.mjs"
```

Expected: **55 tests, 55 pass, 0 fail, 0 skipped** (includes ten three-site end-to-end tests in `tests/three_sites.e2e.test.mjs`).

From `factgate`:

```shell
cd ../factgate
node --test "test/*.test.mjs" "site/tests/*.test.mjs"
```

Expected: **183 tests, 176 pass, 0 fail, 7 skipped** (skipped rows are template tests for irreversible actions; FactGate defines none) — run `node --test "test/*.test.mjs" "site/tests/*.test.mjs"` in `../factgate`.

Optional overrides: `FACTGATE_DIR` or `FACTGATE_SITE` for the FactGate `site/` folder; `AGENTIFY_SKILL` for `agentic-web/skills/agentify-website`. If `../factgate` is missing, only `tests/three_sites.e2e.test.mjs` fails, with clone instructions (spec 6-4..6-7).

The two guesthouse sites: Both are static open agentic
websites (Worldwide Agentic Web MVP spec, §2, §3 and §6): each publishes
`agent-manifest.json`, a two-agent network and page-local site actions, and runs in the
browser with the reference runtime. Every name and domain here is made up. Each site
declares one of the author's own test seller agents on Base Sepolia (ERC-8004 agentId 10798
for Verified Stay, 10799 for Glossy Stay, both from the Delivery Court demo); the other
addresses are sample values, not real wallets. Nothing here can take or send money. Both
pages say so in the footer: "Demo sites run by the author. Agent IDs are the author's test
sellers on Base Sepolia."

- **Glossy Stay** looks complete: polished manifest, ERC-8004 registration, self-signed
  AgentFacts, an x402 quote. Three things it declares are not what it serves.
- **Verified Stay** declares the same kinds of things, and each one matches what it serves.

Expected FactGate verdicts: **Glossy Stay = BLOCK**, **Verified Stay = ALLOW**.

## Deployed

| Site | URL |
| --- | --- |
| Stay Steward | https://stay-steward-demo.vercel.app/ (network `https://stay-steward-demo.vercel.app/stay_steward`) |
| Verified Stay | https://verified-stay-demo.vercel.app/ (network `https://verified-stay-demo.vercel.app/verified_stay`) |
| Glossy Stay | https://glossy-stay-demo.vercel.app/ (network `https://glossy-stay-demo.vercel.app/glossy_stay`) |
| FactGate | https://factgate.vercel.app/ (source: https://github.com/kzmttkc/factgate) |

On Stay Steward, press **Check with FactGate** (no AI key needed). Verified Stay ends with a booking in its own window. Glossy Stay stops at FactGate's BLOCK.

`node deploy/build-public.mjs` writes `dist/<project>/` for each site, with the local URLs rewritten to the public ones in `deploy/public-origins.json` and a `vercel.json` that adds `Access-Control-Allow-Origin: *` on the manifest, network file, links.json, agent-mcp.json, `bridge/`, `.well-known/`, `pay/` and `api/`, and the worker's Content-Security-Policy. Deploy with `vercel deploy --prod dist/<project>`. The source folders keep the local URLs, so the local run and the tests below are unchanged.

## Run

From this folder, one terminal per site (FactGate itself: sibling `../factgate` or
https://github.com/kzmttkc/factgate, on `http://localhost:8790`):

```shell
node serve.mjs glossy-stay --port 8791                  # http://127.0.0.1:8791/
node serve.mjs verified-stay --port 8792                # http://127.0.0.1:8792/
node serve.mjs stay-steward --host ::1 --port 8793      # http://[::1]:8793/
```

Stay Steward runs on its own host name (`[::1]`), so a key saved on its page is never mirrored
into a cookie the other sites receive (runtime/byok.js, per host name).

`serve.mjs` runs the reference
`../agentic-web/skills/agentify-website/scripts/serve_site.mjs` when present (else
`~/factgate-ref/...`, or set `SERVE_SITE` / `AGENTIFY_SKILL` to use another copy).
serve_site sends
`Access-Control-Allow-Origin: *` only on the agent-site public files. `serve.mjs` adds the
same header to the four extra files FactGate reads from another origin:
`pay/quote.json`, `api/book.json`, `.well-known/agent-registration.json` and
`.well-known/agentfacts.json`. Run with plain serve_site, those four come back without the
header and a browser on another origin cannot read them.

FactGate's page is assumed to run at `http://localhost:8790`.

## Where to look

| What | Glossy Stay (8791) | Verified Stay (8792) |
| --- | --- | --- |
| Network URL (spec §3.2) | `http://127.0.0.1:8791/glossy_stay` | `http://127.0.0.1:8792/verified_stay` |
| Manifest | `/agent-manifest.json` | `/agent-manifest.json` |
| Network definition | `/glossy_stay.network.json` | `/verified_stay.network.json` |
| Agents | `glossy_front_desk` (front) → `glossy_policy_desk` | `verified_front_desk` (front) → `verified_policy_desk` |
| Site actions | `get_stay_state` (read), `select_room` (write), `place_booking` (irreversible) | same |
| Payment quote (x402, 402 simulated) | `/pay/quote.json` | `/pay/quote.json` |
| Booking action (the paid resource) | `/api/book.json` | `/api/book.json` |
| ERC-8004 registration | `/.well-known/agent-registration.json` | `/.well-known/agent-registration.json` |
| AgentFacts (self-signed) | `/.well-known/agentfacts.json` | `/.well-known/agentfacts.json` |
| MCP server declared | `https://mcp.glossy-stay.invalid/mcp` (network tool of `glossy_policy_desk`, registration `services`, AgentFacts `endpoints.mcp`, manifest `trust.mcp`) | none |

Each manifest also has a `trust` block that points to the registration, AgentFacts, quote
and booking action, and repeats the declared `agentWallet` as a CAIP-10 id
(`eip155:84532:0x…`).

### How the 402 is simulated

A static host cannot answer 402. `pay/quote.json` is the body a real server would send
with `402 Payment Required` for `GET /api/book.json`, in the x402 `accepts` format, plus
`"simulatedHttpStatus": 402`. The resource it names is `api/book.json` on the same site.
There is no way to pay: nothing verifies or settles a payment.

### How the booking action works

`place_booking` (the page's own Book button and the assistant's website action call the
same method) fetches `api/book.json` and returns
`{httpStatus, contentLength, receipt}`. A booking counts only when the body is a receipt
with `"status": "confirmed"`. The page shows what came back.

## Planted mismatches (Glossy Stay)

| # | Declared | Actually served | Check |
| --- | --- | --- | --- |
| 1 | ERC-8004 `agentWallet` = `0x1111111111111111111111111111111111111111` (registration, manifest `trust.identity`, AgentFacts `payments.payee`) | x402 `accepts[0].payTo` = `0x2222222222222222222222222222222222222222` | compare `pay/quote.json` `accepts[].payTo` with the registration's `agentWallet` |
| 2 | AgentFacts claims "Bookings return a confirmation code" | `GET /api/book.json` answers `200` with an empty body (`Content-Length: 0`) | fetch the booking action and check the body is not empty and has `status: confirmed` |
| 3 | MCP reviews server `https://mcp.glossy-stay.invalid/mcp`, claimed "online" | never answers: `.invalid` never resolves (RFC 2606) | try to reach the declared MCP URL |

The self-signed AgentFacts `proof` is a placeholder. It shows that a publisher's own
signature proves who wrote the claims, not that they are true.

## Verified Stay

| Check | Result |
| --- | --- |
| `payTo` vs `agentWallet` | both `0xf98f6b4d8f1a5a03271bbf2bee23236737d9ec31`, which is agent 10798's on-chain owner and agentWallet (read with `eth_call` on Base Sepolia, 2026-11-22) |
| Booking action | `200` with a receipt, `"status": "confirmed"`; the page adds a `VS-0001`-style code |
| MCP | none declared, so none to fail |

## On-chain records the sites point to (Base Sepolia, read 2026-11-22)

| | Glossy Stay | Verified Stay |
| --- | --- | --- |
| Declared registration | agentId `10799` at `eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e` (official IdentityRegistry) | agentId `10798`, same registry |
| On-chain owner = agentWallet | `0x8dba1a8aed6ab7f1e2037bfc295f3a0a00be072f` | `0xf98f6b4d8f1a5a03271bbf2bee23236737d9ec31` |
| Quote `payTo` | `0x2222…` (matches neither the site's own `0x1111…` nor the chain) | `0xf98f…` (matches) |
| ERC-8004 ValidationRegistry `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | 8 requests; the answered scores include a 3 (empty seller) | 80 requests; 79 answered 99 or 100, one request never answered |

The validator is the Delivery Court judge `0x5eC4599A438fA0559aDe8b8551b369D5c5aDF0bC`.

## Expected verdicts

| Site | Live (declared vs served) | Identity (payTo vs on-chain registration) | Delivery (ERC-8004 validation scores; vet402 has no record of a loopback site) | Verdict |
| --- | --- | --- | --- | --- |
| Glossy Stay | payTo is not its own declared wallet; booking 200 with an empty body; declared MCP unreachable | mismatch with agent 10799 | scores below 70 | **BLOCK** |
| Verified Stay | as declared | match with agent 10798 | scores 70 or more, none below 70 (the unanswered request is not counted) | **ALLOW** |

## Stay Steward

A booking agent (`stay-steward/`). Its page keeps the trip (dates, guest name) and the chosen
stay as private context; its network allows only `target_url` to pass to a partner
(`stay_steward.hocon`, `allow.to_downstream.sly_data`).

- **Partner tools.** FactGate, Verified Stay and Glossy Stay are the full published network URLs
  in `stay_steward.hocon` (`tools` and `link_labels`), with their origins in `allowed_peers` and
  empty `linking.imports` (agentify-website SKILL). Glossy's origin is not allowed page-wide; the
  page gate blocks loading Glossy until FactGate passes in this visit (`js/factgate-gate.mjs`).
- **The gate before linking** (`js/factgate-gate.mjs`, page code): a byte-identical copy of FactGate's
  shared `site/factgate-gate.mjs` (a test checks they match). It reads FactGate's verdict from the
  runtime's action receipt for FactGate's `gate_check`, and before any partner card it declines a
  stay that FactGate did not check in this visit or whose verdict does not pass Stay Steward's
  policy (`js/trip.mjs` `GATE_POLICY`: ALLOW, or a CAUTION only of kind `identity_unknown`; never
  BLOCK). FactGate and the page's own origin go to the card as usual. Every stop is a line in the
  page's gate log: the gate, over budget, origin not allowed, invalid network, cycle, a declined
  card, and the private context each partner got.
- **Check with FactGate, no key.** The button under "Your trip" (`js/check-button.mjs`) runs the
  same gate from page code, with no model: the card for FactGate, FactGate's network loaded by
  name, `gate_check` in FactGate's window (where FactGate's own card lists each origin it reads),
  then, if the gate passes, Verified Stay's card, its network loaded by name and its booking window;
  if not (Glossy Stay: BLOCK), a stop with the reasons. Partners receive only `target_url`:
  FactGate, to check the stay, and the stay itself (its own URL).
- **Booking.** Verified Stay's bridge (`verified-stay/bridge/`) shares `get_stay_state` and
  `book_stay` with Stay Steward's origin only. `book_stay` opens Verified Stay's window, where the
  visitor checks the room, nights and total and types the guest name; the chat gets the booking
  code, never the name. Glossy Stay shares nothing (it never gets that far).

## Tests

```shell
node --test "*/tests/*.test.mjs" "tests/*.test.mjs"     # 55 tests, all pass (re-run after changes)
FACTGATE_E2E_LIVE=1 node --test tests/three_sites.e2e.test.mjs   # the same, reading the real Base Sepolia RPC
```

`tests/three_sites.e2e.test.mjs` runs the skill's runtime (`stay-steward/runtime/`, with `settingsDefaultClosed` in `ui.js` so AI model settings start closed)
with Stay Steward as the visitor's page, a scripted model behind a fake router
(`tests/support/script_router.mjs`) and the fake key `sk-test-not-a-real-key`. The web is a
stub (`tests/support/peer_web.mjs`, adapted from the reference linking tests): site folders
served from disk, the partners' bridge frames and windows, and a stand-in for the Base Sepolia
RPC with the demo agents' facts (`tests/support/fake_chain.mjs`). No port, no model, nothing
leaves the process. It needs a FactGate checkout (`../factgate/site`, `FACTGATE_DIR`, or
`FACTGATE_SITE`).

| Test | Spec section 6 |
| --- | --- |
| 6-4 ALLOW: Stay Steward asks FactGate, then loads Verified Stay by name… | 4, and 5 and 6 in every run (`checkKeyStaysHome`, `checkPrivateContext`) |
| BLOCK: FactGate blocks Glossy Stay, and the gate never loads Glossy Stay's network… | the gate |
| 6-7 over budget / denied origin (policy) / denied origin (visitor) / invalid network / cycle | 7; also on the live Stay Steward page: **Spec 6-7 self-test (no key)** (fixtures, no new origins) |
| gate policy: Stay Steward's policy stops a stay FactGate could not reach (CAUTION: unreachable) | the gate's policy |
| button, no key: Verified Stay → ALLOW → card → network by name → booking window | 4, with no model call |
| button, no key: Glossy Stay → BLOCK → stop with reasons, never loaded | the gate, with no model call |

The "denied origin (policy)" test runs with a looser gate policy that accepts the rogue stay's
CAUTION kinds, so the runtime's own `allowed_peers` check is what stops it; the next test shows
Stay Steward's real policy stopping the same stay at the gate.

The policy, invalid-network and cycle tests serve a changed copy of one file to the runtime
only (as the reference linking tests L7 and L9 do): a steward network that names an origin
outside `allowed_peers`; a Verified Stay network file that changed after FactGate read it; a
Verified Stay network that calls Stay Steward back.

## Checks

```shell
R=../agentic-web/skills/agentify-website
# Build each network and its discovery files from the .hocon
node $R/scripts/build_network.mjs glossy-stay/glossy_stay.hocon --manifest glossy-stay/agent-manifest.json
node $R/scripts/build_network.mjs verified-stay/verified_stay.hocon --manifest verified-stay/agent-manifest.json
node $R/scripts/build_network.mjs stay-steward/stay_steward.hocon --manifest stay-steward/agent-manifest.json
# The skill's template tests (filled in for these sites), with a scripted model and no LLM
node --test "glossy-stay/tests/*.test.mjs"
node --test "verified-stay/tests/*.test.mjs"
# With both servers running
node $R/scripts/check_partner.mjs http://127.0.0.1:8791/glossy_stay --origin http://localhost:8790
node $R/scripts/check_partner.mjs http://127.0.0.1:8792/verified_stay --origin http://localhost:8790
```

`check_partner.mjs` passes both sites: it checks format, headers and validation, not
whether the declarations are true. That gap is what FactGate checks.

## Layout

Each site folder is self-contained for static hosting. Both use the same `js/app.js`,
`site-actions.js` and `site.js`; they differ in `js/stay-data.js`, the `.hocon`, the
manifest, the four evidence files, `index.html` text and colors. `runtime/` is a copy of
the skill's runtime. `bridge/`, `agent-mcp.json`, `.well-known/nsdeploy*.json` and
`*.network.json` are generated by `build_network.mjs`; do not edit them by hand.

Limits: Glossy Stay's bridge shares no actions; Verified Stay's shares two, with Stay
Steward's origin only. Bookings live in page (or window) memory and reset on reload; ports
and loopback URLs are for local runs and must be changed before hosting.
