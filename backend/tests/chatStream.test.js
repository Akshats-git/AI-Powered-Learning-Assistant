import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import app from "../app.js";
import Document from "../models/Document.js";
import Chunk from "../models/Chunk.js";
import ChatHistory from "../models/ChatHistory.js";
import { createUserWithToken } from "./helpers.js";

const WORDS = ["Mitochondria", " produce", " ATP", " through", " oxidative", " phosphorylation", " (p. 4)."];
let provider;
let appServer;
let base;
const state = { tokenDelayMs: 120, sawClose: false, streamRequests: 0 };

const startProvider = () =>
  new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        if (!req.url.includes("/chat/completions")) {
          res.writeHead(404, { "content-type": "application/json" });
          return res.end(JSON.stringify({ error: { message: "not found" } }));
        }
        if (!body.stream) {
          // groundedness verification (JSON mode)
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify({ id: "x", object: "chat.completion", model: body.model, choices: [{ index: 0, message: { role: "assistant", content: '{"grounded":true,"unsupportedClaims":[]}' }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }));
        }
        state.streamRequests += 1;
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.on("close", () => { if (!res.writableEnded) state.sawClose = true; });
        for (const w of WORDS) {
          if (res.destroyed) return;
          res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta: { content: w } }] })}\n\n`);
          await new Promise((r) => setTimeout(r, state.tokenDelayMs));
        }
        res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: body.model, choices: [], usage: { prompt_tokens: 50, completion_tokens: 7, total_tokens: 57 } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

beforeAll(async () => {
  provider = await startProvider();
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${provider.address().port}/v1`;
  process.env.OPENAI_API_KEY = "sk-stream-test";
  appServer = app.listen(0, "127.0.0.1");
  await new Promise((r) => appServer.once("listening", r));
  base = `http://127.0.0.1:${appServer.address().port}`;
});

afterAll(async () => {
  delete process.env.OPENAI_BASE_URL;
  appServer.closeAllConnections?.();
  await new Promise((r) => appServer.close(r));
  provider.closeAllConnections?.();
  await new Promise((r) => provider.close(r));
});

beforeEach(() => {
  state.tokenDelayMs = 120;
  state.sawClose = false;
  state.streamRequests = 0;
});

const seed = async () => {
  const { user, token } = await createUserWithToken();
  const document = await Document.create({ user: user._id, title: "Cells", fileName: "c.pdf", filePath: "/tmp/c.pdf", fileSize: 1, mimeType: "application/pdf", extractedText: "Mitochondria produce ATP.", hasExtractedText: true });
  await Chunk.create({ user: user._id, document: document._id, index: 0, text: "Mitochondria produce ATP through oxidative phosphorylation.", page: 4, endPage: 4, sectionPath: [], charStart: 0, charEnd: 58, tokens: 9, contentHash: `s-${document._id}` });
  return { user, token, document };
};

// Minimal SSE reader: yields {event, data, at} as each frame arrives.
async function* readSse(res) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const part of res.body) {
    buffer += decoder.decode(part, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (event) yield { event, data: JSON.parse(data), at: Date.now() };
    }
  }
}

const post = (token, body, signal) =>
  fetch(`${base}/api/ai/chat/stream`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal });

describe("POST /api/ai/chat/stream", () => {
  it("streams sources first, then tokens as they arrive, then a done event with the saved messages", async () => {
    const { token, document } = await seed();
    const res = await post(token, { documentId: document._id.toString(), message: "How do mitochondria make ATP?" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("content-encoding")).toBeNull(); // not gzip-buffered

    const frames = [];
    for await (const f of readSse(res)) frames.push(f);

    expect(frames[0].event).toBe("sources");
    expect(frames[0].data.sources[0]).toMatchObject({ page: 4 });
    const tokens = frames.filter((f) => f.event === "token");
    expect(tokens.map((t) => t.data.text)).toEqual(WORDS);
    const done = frames.at(-1);
    expect(done.event).toBe("done");
    expect(done.data.reply).toBe(WORDS.join(""));
    expect(done.data.messages.at(-1)).toMatchObject({ role: "assistant", content: WORDS.join("") });

    // Genuinely incremental: the first token arrived well before the last one.
    expect(tokens.at(-1).at - tokens[0].at).toBeGreaterThan(state.tokenDelayMs * 3);

    const saved = await ChatHistory.findOne({ document: document._id }).lean();
    expect(saved.messages).toHaveLength(2);
  });

  it("answers a failure before streaming starts as ordinary JSON (404), not an event stream", async () => {
    const { token } = await seed();
    const res = await post(token, { documentId: "a".repeat(24), message: "hi" });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("requires authentication", async () => {
    const res = await fetch(`${base}/api/ai/chat/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentId: "a".repeat(24), message: "hi" }) });
    expect(res.status).toBe(401);
  });

  it("aborts the upstream request and saves nothing when the client disconnects mid-answer", async () => {
    const { token, document } = await seed();
    const controller = new AbortController();
    const res = await post(token, { documentId: document._id.toString(), message: "How do mitochondria make ATP?" }, controller.signal);

    let seenTokens = 0;
    try {
      for await (const f of readSse(res)) {
        if (f.event === "token") seenTokens += 1;
        if (seenTokens === 2) controller.abort();
      }
    } catch {
      // expected: the read is torn down by the abort
    }

    // Give the server a moment to notice the closed socket and cancel upstream.
    for (let i = 0; i < 30 && !state.sawClose; i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(state.sawClose).toBe(true);
    expect(await ChatHistory.countDocuments({ document: document._id })).toBe(0);
  });
});
