// A fake web for the three-site end-to-end tests. Adapted from the reference linking tests
// (agentic-web tests/linking/example_web.mjs, Apache-2.0): site folders served from disk under
// their local URLs through a stub fetch, the scripted router, and stand-ins for the browser
// parts the runtime uses to reach a partner's bridge. Nothing leaves the process and no port is
// opened.
//
// What it adds to the reference:
// - A partner's window. The runtime opens one for a partner's write (runtime/action-transport.js,
//   openActionWindow): it shows a dialog with "Open action site"; this web presses it (as the
//   visitor would) and returns a window stand-in that acts as the partner's bridge in a
//   top-level window, so a write, or an action with confirmsInWindow, runs there.
// - Who asked. Each request is tagged with "runtime" or with the window or frame origin whose
//   code sent it, so a test can tell FactGate's own reads of a stay (in FactGate's window) from
//   the runtime loading that stay's network.
// - Outside answers. Requests to origins that no site serves go to a handler (a fake chain RPC,
//   a fake vet402) or fail like an unreachable host.
// - Per-asker replacements: a file can be served differently to the runtime than to a window,
//   to show what happens when a site changes a file after FactGate checked it.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export class PeerWeb {
  static PROTOCOL = "nsdeploy-actions-v1";

  static TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
  };

  /**
   * :param router: The ScriptRouter that answers model requests.
   * :param routerOrigin: The router's origin.
   * :param key: The fake key, so requests that carry it can be flagged.
   */
  constructor(router, routerOrigin, key) {
    this.router = router;
    this.routerOrigin = routerOrigin;
    this.key = key;
    this.sites = new Map();
    this.replaced = [];
    this.requests = [];
    this.frames = [];
    this.windows = [];
    this.dialogs = [];
    this.listeners = [];
    this.pageOrigin = null;
    this.actor = null;
    this.outside = null;
    this.saved = null;
    // What the visitor does when a partner asks to open its window: "open" or "cancel".
    this.windowDecision = "open";
  }

  setPage(origin) {
    this.pageOrigin = origin;
  }

  serve(origin, folder) {
    this.sites.set(origin, path.resolve(folder));
  }

  /**
   * Serve a JSON value at a URL instead of the file there.
   *
   * :param url: The full URL.
   * :param value: The value.
   * :param onlyFor: "runtime" to serve it only to the runtime, or null for everyone.
   */
  replace(url, value, onlyFor = null) {
    this.replaced.push({ url: new URL(url).href, value, onlyFor });
  }

  /**
   * Answer requests to origins no site serves.
   *
   * :param handler: async (url, init) => Response | null. Null means unreachable.
   */
  setOutside(handler) {
    this.outside = handler;
  }

  install() {
    this.saved = { fetch: globalThis.fetch, document: globalThis.document, window: globalThis.window, location: globalThis.location };
    globalThis.fetch = this.fetch.bind(this);
    // A page with none of a site's own markup: lookups find nothing, as on an empty page.
    globalThis.document = {
      createElement: this.createElement.bind(this),
      body: { append: this.appendToBody.bind(this) },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    globalThis.window = {
      addEventListener: this.addListener.bind(this),
      removeEventListener: this.removeListener.bind(this),
      open: this.openWindow.bind(this),
    };
    Object.defineProperty(globalThis, "location", { value: new URL(`${this.pageOrigin}/`), configurable: true, writable: true });
  }

  restore() {
    for (const name of ["fetch", "document", "window", "location"]) {
      if (this.saved[name] === undefined) {
        delete globalThis[name];
      } else {
        Object.defineProperty(globalThis, name, { value: this.saved[name], configurable: true, writable: true });
      }
    }
  }

  fetch(input, init) {
    return this.load(new URL(String(input)), this.actor || "runtime", init || {});
  }

  static lowerHeaders(headers) {
    const lower = {};
    for (const [name, value] of new Headers(headers || {})) {
      lower[name] = value;
    }
    return lower;
  }

  holdsKey(text) {
    return typeof text === "string" && (text.includes(this.key) || text.includes(encodeURIComponent(this.key)));
  }

  async load(url, from, init) {
    const headers = PeerWeb.lowerHeaders(init.headers);
    const body = typeof init.body === "string" ? init.body : "";
    const record = {
      seq: this.requests.length,
      from,
      method: String(init.method || "GET").toUpperCase(),
      url: url.href,
      origin: url.origin,
      path: url.pathname,
      authorization: headers.authorization !== undefined,
      keySent: Object.values(headers).some((v) => this.holdsKey(v)) || this.holdsKey(url.href) || this.holdsKey(body),
      body: body.slice(0, 4000),
      status: 0,
    };
    this.requests.push(record);
    if (url.origin === this.routerOrigin) {
      const answer = this.router.respond(record.method, url.pathname, headers, body);
      record.status = answer.status;
      return new Response(answer.status === 204 ? null : answer.body, { status: answer.status, headers: { "Content-Type": answer.type } });
    }
    const swap = [...this.replaced].reverse().find((r) => r.url === url.href && (r.onlyFor === null || r.onlyFor === from));
    if (swap) {
      record.status = 200;
      record.replaced = true;
      return PeerWeb.respond(200, PeerWeb.TYPES[".json"], JSON.stringify(swap.value));
    }
    const folder = this.sites.get(url.origin);
    if (folder === undefined) {
      const answer = this.outside ? await this.outside(url, init) : null;
      if (!answer) {
        record.status = "unreachable";
        throw new TypeError(`fetch failed: ${url.host} does not answer`);
      }
      record.status = answer.status;
      return answer;
    }
    const file = path.resolve(folder, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${folder}${path.sep}`)) {
      record.status = 403;
      return PeerWeb.respond(403, "text/plain", "Forbidden");
    }
    try {
      const bytes = await readFile(file);
      record.status = 200;
      return PeerWeb.respond(200, PeerWeb.TYPES[path.extname(file)] || "application/octet-stream", bytes);
    } catch {
      record.status = 404;
      return PeerWeb.respond(404, "text/plain", "Not found");
    }
  }

  static respond(status, type, body) {
    return new Response(body, { status, headers: { "Content-Type": type } });
  }

  createElement(tag) {
    const node = { tag, style: {}, children: [], textContent: "", record: null, onclick: null };
    node.append = (...children) => node.children.push(...children);
    node.remove = () => {
      if (node.record) {
        node.record.removed = true;
      }
    };
    node.showModal = () => this.showDialog(node);
    node.close = () => {};
    node.addEventListener = () => {};
    node.removeEventListener = () => {};
    if (tag === "iframe") {
      node.contentWindow = { postMessage: (message, targetOrigin, transfer) => this.bridgeMessage(node, message, transfer) };
    }
    return node;
  }

  appendToBody(node) {
    if (node.tag !== "iframe") {
      return;
    }
    node.record = { kind: "frame", src: node.src, sandbox: node.sandbox, hidden: node.hidden, seq: this.requests.length, ready: false, error: null, removed: false };
    this.frames.push(node.record);
    this.loadBridge(node, node.contentWindow, false).catch((error) => {
      node.record.error = String(error.message || error);
    });
  }

  /**
   * Stand in for window.open: a partner's own window, acting as its bridge in a top-level window.
   */
  openWindow(url) {
    const win = { closed: false, record: null };
    win.postMessage = (message, targetOrigin, transfer) => this.bridgeMessage(win, message, transfer);
    win.close = () => {
      win.closed = true;
    };
    win.src = url;
    win.record = { kind: "window", src: url, seq: this.requests.length, ready: false, error: null, removed: false };
    this.windows.push(win.record);
    this.loadBridge(win, win, true).catch((error) => {
      win.record.error = String(error.message || error);
    });
    return win;
  }

  /**
   * Record a dialog and answer it as a visitor would: open a partner's window when asked,
   * otherwise cancel.
   */
  showDialog(node) {
    const texts = node.children.map((c) => String(c.textContent || ""));
    this.dialogs.push(texts.join(" | "));
    const open = node.children.find((c) => c.textContent === "Open action site");
    const cancel = node.children.find((c) => c.textContent === "Cancel");
    const press = this.windowDecision === "open" && open ? open : cancel;
    if (press && typeof press.onclick === "function") {
      setTimeout(() => press.onclick(), 0);
    }
  }

  async loadBridge(holder, source, topLevel) {
    const src = holder.src;
    const tag = new URL(src).origin;
    const page = await this.load(new URL(src), `${topLevel ? "window" : "frame"}:${tag}`, {});
    if (!page.ok) {
      throw new Error(`The bridge page answered ${page.status}.`);
    }
    const response = await this.load(new URL("agent-manifest.json", src), `${topLevel ? "window" : "frame"}:${tag}`, {});
    if (!response.ok) {
      throw new Error(`The bridge's agent-manifest.json answered ${response.status}.`);
    }
    const manifest = await response.json();
    const { ActionRegistry } = await import(pathToFileURL(path.join(this.sites.get(this.pageOrigin), "runtime/actions.js")).href);
    holder.registry = new ActionRegistry();
    holder.topLevel = topLevel;
    if (manifest.actions && manifest.actions.module) {
      const moduleUrl = new URL(manifest.actions.module, src);
      const folder = this.sites.get(moduleUrl.origin);
      const loaded = await import(pathToFileURL(path.join(folder, decodeURIComponent(moduleUrl.pathname))).href);
      const scope = { base: new URL("./", src).href.replace(/\/$/, ""), network: manifest.networks[0].name };
      await loaded.registerActions({ register: holder.registry.register.bind(holder.registry, scope) });
    }
    holder.record.ready = true;
    const event = { source, origin: tag, data: { protocol: PeerWeb.PROTOCOL, type: "ready" }, ports: [] };
    for (const listener of this.listeners.slice()) {
      listener(event);
    }
  }

  bridgeMessage(holder, message, transfer) {
    if (!message || message.protocol !== PeerWeb.PROTOCOL || message.type !== "connect" || !Array.isArray(transfer) || transfer.length !== 1) {
      return;
    }
    // As in runtime/action-transport.js: only what is shared with the page's own origin.
    const allowed = [...holder.registry.entries.values()].filter((e) => e.availability !== "local-only" && (e.callerOrigins.includes(this.pageOrigin) || e.callerOrigins.includes("*")));
    holder.record.shared = allowed.map((e) => e.name);
    holder.record.executed = [];
    const port = transfer[0];
    port.onmessage = (event) => this.answerBridge(holder, port, allowed, event);
  }

  async answerBridge(holder, port, allowed, event) {
    const data = event.data || {};
    if (data.type === "catalog") {
      port.postMessage({ id: data.id, ok: true, value: allowed.map(({ name, description, inputSchema, outputSchema, effect, availability }) => ({ name, description, inputSchema, outputSchema, effect, availability })) });
      return;
    }
    const found = data.type === "execute" ? allowed.find((e) => e.name === data.name) : null;
    if (!found) {
      port.postMessage({ id: data.id, ok: false, error: "Action is not exposed to this caller." });
      return;
    }
    // A hidden frame is not a top-level window: only reads run there.
    if ((found.effect !== "read" || found.availability === "top-level") && !holder.topLevel) {
      port.postMessage({ id: data.id, ok: false, error: "This action requires its own confirmation window." });
      return;
    }
    if (found.effect !== "read" && !found.confirmsInWindow) {
      port.postMessage({ id: data.id, ok: false, error: "This test web has no generic review dialog; the action must confirm in its window." });
      return;
    }
    holder.record.executed.push(found.name);
    const previous = this.actor;
    this.actor = `window:${new URL(holder.src).origin}`;
    try {
      const value = await found.execute(data.args, { requestId: data.requestId, callerOrigin: this.pageOrigin });
      port.postMessage({ id: data.id, ok: true, value: JSON.parse(JSON.stringify(value)) });
    } catch (error) {
      port.postMessage({ id: data.id, ok: false, error: String(error.message || error) });
    } finally {
      this.actor = previous;
    }
  }

  addListener(type, handler) {
    if (type === "message") {
      this.listeners.push(handler);
    }
  }

  removeListener(type, handler) {
    const i = this.listeners.indexOf(handler);
    if (type === "message" && i >= 0) {
      this.listeners.splice(i, 1);
    }
  }

  /**
   * The requests to one origin, optionally only those one asker sent.
   */
  requestsTo(origin, from = null) {
    return this.requests.filter((r) => r.origin === origin && (from === null || r.from === from));
  }
}
