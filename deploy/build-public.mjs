// Write the public build of each site to dist/<vercel project>/, with the local origins
// (127.0.0.1, localhost, [::1]) rewritten to the public ones in deploy/public-origins.json,
// and a vercel.json that sends the same headers serve.mjs sends locally.
//
// Usage:
//   node deploy/build-public.mjs                 # all sites in this repo
//   node deploy/build-public.mjs stay-steward    # only these
// Then: vercel deploy --prod dist/<project>
//
// The source folders are not changed, so `node serve.mjs ...` and `node --test` keep using
// the local URLs. dist/<project>/.vercel (the Vercel project link) is kept across builds.
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ORIGINS = JSON.parse(await readFile(path.join(ROOT, "deploy", "public-origins.json"), "utf8")).sites;

// Site folder in this repo -> Vercel project name (and dist folder).
const SITES = {
  "stay-steward": "stay-steward-demo",
  "verified-stay": "verified-stay-demo",
  "glossy-stay": "glossy-stay-demo",
};

const TEXT = new Set([".html", ".js", ".mjs", ".json", ".css", ".hocon", ".md", ".svg", ".txt"]);
const SKIP = new Set(["tests", ".vercel"]);

/**
 * The vercel.json for one site. CORS on the same paths serve.mjs opens (serve_site.mjs's public
 * files plus the four extra files), and on bridge/; the worker's CSP; no caching, as locally.
 *
 * :param networkFiles: The network file names from the manifest, such as "verified_stay.network.json".
 */
export function vercelConfig(networkFiles) {
  const cors = [{ key: "Access-Control-Allow-Origin", value: "*" }];
  const open = [
    "/agent-manifest.json",
    "/links.json",
    "/agent-mcp.json",
    ...networkFiles.map((f) => `/${f}`),
    "/bridge/(.*)",
    "/.well-known/(.*)",
    "/pay/(.*)",
    "/api/(.*)",
  ];
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    cleanUrls: false,
    headers: [
      { source: "/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
      ...open.map((source) => ({ source, headers: cors })),
      { source: "/runtime/sandbox-worker.js", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'" }] },
    ],
  };
}

/**
 * Replace each local origin with its public origin.
 */
export function rewrite(text) {
  let out = text;
  for (const { local, public: pub } of Object.values(ORIGINS)) {
    out = out.split(local).join(pub);
  }
  return out;
}

async function copyRewritten(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyRewritten(src, dst);
    } else if (TEXT.has(path.extname(entry.name).toLowerCase())) {
      await writeFile(dst, rewrite(await readFile(src, "utf8")));
    } else {
      await cp(src, dst);
    }
  }
}

export async function build(folder, project, root = ROOT) {
  const out = path.join(root, "dist", project);
  await mkdir(out, { recursive: true });
  for (const entry of await readdir(out)) {
    if (entry !== ".vercel") await rm(path.join(out, entry), { recursive: true, force: true });
  }
  await copyRewritten(path.join(root, folder), out);
  const manifest = JSON.parse(await readFile(path.join(out, "agent-manifest.json"), "utf8"));
  const networkFiles = (manifest.networks || []).map((n) => String(n.hocon || "").replace(/^(\.\/|\/)+/, "")).filter(Boolean);
  await writeFile(path.join(out, "vercel.json"), `${JSON.stringify(vercelConfig(networkFiles), null, 2)}\n`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wanted = process.argv.slice(2);
  for (const [folder, project] of Object.entries(SITES)) {
    if (wanted.length && !wanted.includes(folder)) continue;
    console.log(`${folder} -> ${path.relative(ROOT, await build(folder, project))}`);
  }
}
