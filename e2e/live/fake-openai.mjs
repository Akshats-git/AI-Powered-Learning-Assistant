// A deterministic stand-in for the OpenAI API: /v1/embeddings, /v1/chat/completions, /v1/models.
// Records every call so the harness can assert caching, routing, and which key was used.
import http from "http";

const STOP = new Set("the a an of and or to in is are was were be it that this for on as with by at from which its".split(" "));
const tokenize = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w));
const DIMS = 1536;

const hash = (w) => {
  let h = 2166136261;
  for (let i = 0; i < w.length; i += 1) h = Math.imul(h ^ w.charCodeAt(i), 16777619) >>> 0;
  return h;
};

export const embed = (text) => {
  const v = new Array(DIMS).fill(0);
  for (const w of tokenize(text)) v[hash(w) % DIMS] += 1;
  // Real embeddings are dense (every pair of texts has some positive cosine); pure hashed
  // bag-of-words is sparse, which would make retrieval return only lexical matches and skip
  // rerank. Add a small shared component so cosine>0 for all pairs while ranking stays BoW-driven.
  for (let i = 0; i < DIMS; i += 1) v[i] += 0.02 * (1 + (i % 7) / 7);
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
};

const overlap = (a, b) => {
  const B = new Set(tokenize(b));
  return tokenize(a).filter((w) => B.has(w)).length;
};

export const startFake = (port) => {
  const state = {
    calls: [], // {kind, feature, model, key, at}
    delayMs: { flashcards: 0 },
    fail: {}, // feature -> {status} | {badJson:true}  (consumed once)
    embeddedInputs: 0,
  };

  const classify = (prompt) => {
    if (prompt.includes("Rate how relevant each excerpt")) return "rerank";
    if (prompt.includes("fact-checking an AI-generated answer")) return "groundedness";
    if (prompt.includes("rewrite the follow-up into a standalone")) return "rewrite";
    if (prompt.includes('{"flashcards"')) return "flashcards";
    if (prompt.includes('{"questions"')) return "quiz";
    if (prompt.startsWith("Summarize")) return "summary";
    if (prompt.includes("explain the concept")) return "explain";
    if (prompt.includes("study assistant answering")) return "chat";
    return "unknown";
  };

  const respond = (kind, prompt) => {
    if (kind === "rerank") {
      const q = /Question: "([^"]*)"/.exec(prompt)?.[1] || "";
      const items = [...prompt.matchAll(/^\[(\d+)\] (.*)$/gm)];
      return JSON.stringify({ scores: items.map((m) => ({ index: Number(m[1]), score: Math.min(10, overlap(q, m[2])) })) });
    }
    if (kind === "groundedness") {
      const answer = /Answer to check:\n"""\n([\s\S]*?)\n"""/.exec(prompt)?.[1] || "";
      return answer.includes("cheese")
        ? JSON.stringify({ grounded: false, unsupportedClaims: ["The moon is made of cheese"] })
        : JSON.stringify({ grounded: true, unsupportedClaims: [] });
    }
    if (kind === "rewrite") {
      const q = /Follow-up question: "([^"]*)"/.exec(prompt)?.[1] || "";
      return /that theorem/i.test(q) ? "Why does Theorem 4.2 Vandermonde bound matter?" : q;
    }
    if (kind === "flashcards") {
      const n = Number(/generate (\d+) flashcards/.exec(prompt)?.[1] || 3);
      return JSON.stringify({
        flashcards: Array.from({ length: n }, (_, i) => ({
          question: `Question ${i + 1}?`,
          answer: `Answer ${i + 1}`,
          difficulty: ["easy", "medium", "hard", "bogus"][i % 4],
        })),
      });
    }
    if (kind === "quiz") {
      const n = Number(/generate (\d+) multiple-choice/.exec(prompt)?.[1] || 3);
      return JSON.stringify({
        questions: Array.from({ length: n }, (_, i) => ({
          question: `Quiz question ${i + 1}?`,
          options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`],
          correctAnswer: `B${i}`,
          explanation: `Because B${i} is right.`,
          concept: i % 2 === 0 ? "Krebs cycle" : "Vandermonde bound",
        })),
      });
    }
    if (kind === "summary") return "## Summary\n\n- Point one\n- Point two\n\n_Based on a sampled excerpt._";
    if (kind === "explain") return `## Explanation\n\nThe concept is explained here.`;
    if (kind === "chat") {
      const q = /User question: ([\s\S]*)$/.exec(prompt)?.[1]?.trim() || "";
      if (/moon/i.test(q)) return "The moon is made of cheese.";
      const blocks = [...prompt.matchAll(/\[Excerpt \d+ — p\. (\d+)(?:–(\d+))?[^\]]*\]\n([\s\S]*?)(?=\n\n\[Excerpt|\n"""\n)/g)];
      if (blocks.length === 0) return "The excerpts do not contain the answer.";
      const best = blocks.map((m) => ({ page: m[1], text: m[3], score: overlap(q, m[3]) })).sort((a, b) => b.score - a.score)[0];
      const sentence = best.text.split(/(?<=\.)\s/).sort((a, b) => overlap(q, b) - overlap(q, a))[0];
      return `${sentence} (p. ${best.page})`;
    }
    return "ok";
  };

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    const key = (req.headers.authorization || "").replace("Bearer ", "");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (key.startsWith("sk-bad")) return send(401, { error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } });

    if (req.url.startsWith("/v1/models")) {
      state.calls.push({ kind: "models", key });
      return send(200, { object: "list", data: [{ id: "gpt-4o-mini", object: "model" }] });
    }

    const body = raw ? JSON.parse(raw) : {};

    if (req.url.startsWith("/v1/embeddings")) {
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      state.embeddedInputs += inputs.length;
      state.calls.push({ kind: "embeddings", count: inputs.length, model: body.model, key });
      const tokens = inputs.reduce((a, s) => a + Math.ceil(String(s).length / 4), 0);
      return send(200, {
        object: "list",
        model: body.model,
        data: inputs.map((s, i) => {
          const vec = embed(String(s));
          const embedding = body.encoding_format === "base64" ? Buffer.from(new Float32Array(vec).buffer).toString("base64") : vec;
          return { object: "embedding", index: i, embedding };
        }),
        usage: { prompt_tokens: tokens, total_tokens: tokens },
      });
    }

    if (req.url.startsWith("/v1/chat/completions")) {
      const prompt = body.messages?.map((m) => m.content).join("\n") || "";
      const kind = classify(prompt);
      state.calls.push({ kind: "chat", feature: kind, model: body.model, key, json: body.response_format?.type === "json_object" });
      const wait = state.delayMs[kind] || 0;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const fail = state.fail[kind];
      if (fail) {
        fail.times = (fail.times ?? 1) - 1;
        if (fail.times <= 0) delete state.fail[kind];
        if (fail.status) return send(fail.status, { error: { message: "injected failure", type: "server_error" } });
        if (fail.badJson) {
          return send(200, {
            id: "x", object: "chat.completion", model: body.model,
            choices: [{ index: 0, message: { role: "assistant", content: "this is not json {" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        }
      }
      const content = respond(kind, prompt);
      if (body.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const words = content.split(/(?<= )/);
        for (const w of words) {
          res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta: { content: w } }] })}\n\n`);
          await new Promise((r) => setTimeout(r, 15));
        }
        const usage = { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: Math.ceil(content.length / 4), total_tokens: Math.ceil((prompt.length + content.length) / 4) };
        res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", model: body.model, choices: [], usage })}\n\ndata: [DONE]\n\n`);
        return res.end();
      }
      return send(200, {
        id: "chatcmpl-fake", object: "chat.completion", model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: Math.ceil(content.length / 4), total_tokens: Math.ceil((prompt.length + content.length) / 4) },
      });
    }

    send(404, { error: { message: `fake: no route ${req.url}` } });
  });

  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({
        state,
        count: (pred) => state.calls.filter(pred).length,
        reset: () => { state.calls.length = 0; state.embeddedInputs = 0; },
        stop: () => new Promise((r) => server.close(r)),
      })
    )
  );
};
