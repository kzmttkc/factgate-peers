// Where to find the factgate and agentify-website checkouts for tests and serve.mjs.
// Order: env var, sibling of this repo, then the author's home-directory defaults.
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PEERS_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export { PEERS_ROOT };

const FACTGATE_MISSING_MSG = [
  "FactGate checkout not found (needed for tests/three_sites.e2e.test.mjs, spec 6-4..6-7).",
  "Clone the three repos side by side, for example:",
  "  git clone https://github.com/kzmttkc/factgate",
  "  git clone https://github.com/kzmttkc/factgate-peers",
  "  git clone https://github.com/cognizant-ai-labs/agentic-web",
  "so factgate-peers/../factgate/site exists, or set FACTGATE_DIR to your factgate checkout.",
].join("\n");

function factgateSiteLooksValid(siteDir) {
  return existsSync(path.join(siteDir, "bridge", "bridge-actions.js"));
}

export function resolveFactgateDir() {
  if (process.env.FACTGATE_DIR) {
    return path.resolve(process.env.FACTGATE_DIR);
  }
  const sibling = path.join(PEERS_ROOT, "..", "factgate");
  if (existsSync(path.join(sibling, "site", "bridge", "bridge-actions.js"))) {
    return sibling;
  }
  return path.join(os.homedir(), "factgate");
}

export function resolveFactgateSite() {
  if (process.env.FACTGATE_SITE) {
    return path.resolve(process.env.FACTGATE_SITE);
  }
  return path.join(resolveFactgateDir(), "site");
}

export function factgateSiteForE2E() {
  const site = resolveFactgateSite();
  if (factgateSiteLooksValid(site)) {
    return { site, error: null };
  }
  return { site: null, error: FACTGATE_MISSING_MSG };
}

export function resolveAgentifySkill() {
  if (process.env.AGENTIFY_SKILL) {
    return path.resolve(process.env.AGENTIFY_SKILL);
  }
  const sibling = path.join(PEERS_ROOT, "..", "agentic-web", "skills", "agentify-website");
  if (existsSync(path.join(sibling, "scripts", "build_network.mjs"))) {
    return sibling;
  }
  return path.join(os.homedir(), "factgate-ref", "agentic-web", "skills", "agentify-website");
}

export function resolveServeSiteScript() {
  if (process.env.SERVE_SITE) {
    return path.resolve(process.env.SERVE_SITE);
  }
  const skill = resolveAgentifySkill();
  return path.join(skill, "scripts", "serve_site.mjs");
}