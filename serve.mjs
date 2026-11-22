// Serve one demo site with the reference serve_site.mjs, unchanged, plus a CORS header
// on the extra files FactGate reads.
//
// Usage (same arguments as serve_site.mjs):
//   node serve.mjs glossy-stay --port 8791
//   node serve.mjs verified-stay --port 8792
//
// Why: serve_site.mjs sends Access-Control-Allow-Origin: * only on the agent-site public
// files (agent-manifest.json, the network file, links.json, agent-mcp.json and the two
// .well-known/nsdeploy files). A browser page on another origin, such as FactGate, also
// needs to read the payment quote, the booking action and the identity files. This file
// adds the same header to exactly those paths and leaves everything else to serve_site.mjs.
// Set SERVE_SITE to use another copy of serve_site.mjs.
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXTRA_PUBLIC = [
  "/pay/quote.json",
  "/api/book.json",
  "/.well-known/agent-registration.json",
  "/.well-known/agentfacts.json",
];

const SERVE_SITE = process.env.SERVE_SITE
  || path.join(os.homedir(), "factgate-ref/agentic-web/skills/agentify-website/scripts/serve_site.mjs");

const createServer = http.createServer;
http.createServer = function createServerWithExtraCors(handler) {
  return createServer(function addCors(request, response) {
    let urlPath = "";
    try {
      urlPath = new URL(request.url, "http://localhost").pathname;
    } catch (error) {
      urlPath = "";
    }
    if (EXTRA_PUBLIC.includes(urlPath)) {
      response.setHeader("Access-Control-Allow-Origin", "*");
    }
    return handler(request, response);
  });
};

// serve_site.mjs reads process.argv itself, so the arguments pass through unchanged.
await import(pathToFileURL(SERVE_SITE).href);
