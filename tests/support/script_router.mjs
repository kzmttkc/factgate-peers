// A scripted model router for the end-to-end tests: the "reference model that follows a
// script" the brief asks for, in the shape of the reference linking tests' MockRouter
// (agentic-web tests/linking/chrome/mock_router.mjs, Apache-2.0). It makes no model call.
//
// Each request is matched to the site whose agent sent it, from the first line of its system
// prompt ("You are the assistant on the <site> website"). Each site has a script: a list of
// steps, and the step used is the number of tool results already in that agent's messages. A
// step is { tool, args }, { text }, or a function (record) => one of those, which can read the
// tool results so far. It records each request with flags only, never the key.

export class ScriptRouter {
  static SITES = {
    "Stay Steward": "steward",
    FactGate: "factgate",
    "Verified Stay": "verified",
    "Glossy Stay": "glossy",
  };

  /**
   * :param key: The fake key the visitor's site should send.
   * :param scripts: { steward: [steps], factgate: [steps], verified: [steps], glossy: [steps] }.
   */
  constructor(key, scripts) {
    this.key = key;
    this.scripts = scripts;
    this.records = [];
    this.toolCalls = 0;
    this.watched = [];
  }

  /**
   * Flag every chat request that holds one of these texts.
   */
  watch(texts) {
    this.watched = texts;
  }

  respond(method, path, headers, body) {
    const authorization = typeof headers.authorization === "string" ? headers.authorization : null;
    const record = { method, path, authorization: authorization !== null, keyOk: authorization === `Bearer ${this.key}` };
    this.records.push(record);
    if (method === "OPTIONS") {
      return { status: 204, type: "text/plain", body: "" };
    }
    if (method === "POST" && path === "/v1/chat/completions") {
      record.kind = "chat";
      return this.chat(record, body);
    }
    record.kind = "other";
    return { status: 404, type: "text/plain", body: "Not found" };
  }

  static siteOf(system) {
    const m = /You are the assistant on the (.+?) website/.exec(system);
    return m ? ScriptRouter.SITES[m[1]] || m[1] : "unknown";
  }

  chat(record, body) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { status: 400, type: "text/plain", body: "The body is not JSON." };
    }
    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
    const system = messages.length && typeof messages[0].content === "string" ? messages[0].content : "";
    record.site = ScriptRouter.siteOf(system);
    record.model = parsed.model;
    record.tools = tools.map((t) => String((t.function || {}).name));
    record.toolResults = messages.filter((m) => m.role === "tool").map((m) => String(m.content));
    record.userText = (messages.filter((m) => m.role === "user").pop() || {}).content;
    record.watchedSeen = this.watched.filter((t) => body.includes(t));
    const script = this.scripts[record.site] || [];
    let step = script[record.toolResults.length];
    if (typeof step === "function") {
      step = step(record);
    }
    if (!step) {
      step = { text: `${record.site}: end of script after ${record.toolResults.length} tool result(s).` };
    }
    if (step.tool && !record.tools.includes(step.tool)) {
      step = { text: `${record.site}: the scripted tool ${step.tool} was not offered (offered: ${record.tools.join(", ")}).` };
    }
    record.reply = step;
    return { status: 200, type: "text/event-stream", body: this.stream(parsed.model, step) };
  }

  stream(model, reply) {
    let delta;
    if (reply.tool) {
      this.toolCalls += 1;
      delta = { role: "assistant", tool_calls: [{ index: 0, id: `call_script_${this.toolCalls}`, type: "function", function: { name: reply.tool, arguments: JSON.stringify(reply.args || {}) } }] };
    } else {
      delta = { role: "assistant", content: reply.text };
    }
    const chunk = { id: "chatcmpl-script", object: "chat.completion.chunk", model, choices: [{ index: 0, delta, finish_reason: reply.tool ? "tool_calls" : "stop" }] };
    const usage = { id: "chatcmpl-script", object: "chat.completion.chunk", model, choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
    return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(usage)}\n\ndata: [DONE]\n\n`;
  }

  chats(site = null) {
    return this.records.filter((r) => r.kind === "chat" && (site === null || r.site === site));
  }

  /**
   * Parse a tool result: a website receipt or a partner's {"cruse":1,"text":...} answer.
   */
  static parse(content) {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  /**
   * The text of a tool result, for a partner answer or a plain message.
   */
  static text(content) {
    const p = ScriptRouter.parse(content);
    return p && typeof p === "object" && typeof p.text === "string" ? p.text : String(content);
  }
}
