// Full-stack API journey: real backend + in-memory Mongo + a fake OpenAI (fake-openai.mjs).
// Exits non-zero if any check fails. Run: `npm run test:api` from e2e/.
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { makeDoc } from "./make-pdf.mjs";
import { startFake } from "./fake-openai.mjs";
import { Client, startBackend, lastToken, sleep, BACKEND, OUT, FAKE_PORT, CLIENT_URL, makeUploadDir } from "./lib.mjs";

const require = createRequire(`${BACKEND}/package.json`);
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

// ---------- result tracking ----------
const results = [];
let section = "";
const S = (name) => { section = name; console.log(`\n=== ${name} ===`); };
const check = (name, ok, detail = "") => {
  results.push({ section, name, ok: Boolean(ok), detail: String(detail ?? "") });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${ok || !detail ? "" : `  -> ${String(detail).slice(0, 300)}`}`);
};
const note = (name, detail) => {
  results.push({ section, name, ok: null, detail: String(detail) });
  console.log(`  NOTE  ${name}: ${detail}`);
};

// =====================================================================
const UPLOAD = makeUploadDir();
const mongod = await MongoMemoryServer.create();
globalThis.__mongoUri = mongod.getUri("live");
await mongoose.connect(globalThis.__mongoUri);
const db = mongoose.connection.db;
const fake = await startFake(FAKE_PORT);

const needles = {
  5: "The Krebs cycle takes place inside the mitochondrial matrix and produces NADH and FADH2 for the electron transport chain.",
  22: "Theorem 4.2 (Vandermonde bound) states that every bounded monotone sequence of real numbers converges to its supremum.",
  38: "The Treaty of Zanzibar was signed in 1890 and transferred Heligoland to Germany in exchange for colonial concessions.",
};
const pdf40 = makeDoc(40, needles);
const covers = (src, page) => src && src.page != null && src.page <= page && page <= (src.endPage ?? src.page);
const PW = "Str0ng-Passw0rd!";

let main = await startBackend("main", 8711);
const A = new Client(main.base), B = new Client(main.base), C = new Client(main.base), ADMIN = new Client(main.base), E = new Client(main.base);

try {
  // ------------------------------------------------------------ Phase 2/3
  S("Phase 2-3: server skeleton, DB connection, health/ready");
  {
    const anon = new Client(main.base);
    let r = await anon.req("GET", "/health");
    check("GET /health -> 200 {status:'ok'}", r.status === 200 && r.body.status === "ok");
    r = await anon.req("GET", "/ready");
    check("GET /ready -> 200 with mongo:ok", r.status === 200 && r.body.checks?.mongo === "ok", JSON.stringify(r.body));
    r = await anon.req("GET", "/nope");
    check("unknown route -> 404 typed error envelope", r.status === 404 && r.body?.error?.code && r.body.error.requestId, JSON.stringify(r.body));
    check("X-Request-Id header echoed", !!r.headers.get("x-request-id"));
    check("helmet: X-Content-Type-Options nosniff", r.headers.get("x-content-type-options") === "nosniff");
    check("helmet: HSTS header present", !!r.headers.get("strict-transport-security"));
    const csp = r.headers.get("content-security-policy");
    check("API sends a deny-all Content-Security-Policy", /default-src 'none'/.test(csp || "") && /frame-ancestors 'none'/.test(csp || ""), csp);
    const okCors = await fetch(`${main.base}/health`, { headers: { origin: CLIENT_URL } });
    check("CORS allows CLIENT_URL with credentials", okCors.headers.get("access-control-allow-origin") === CLIENT_URL && okCors.headers.get("access-control-allow-credentials") === "true");
    const badCors = await fetch(`${main.base}/health`, { headers: { origin: "https://evil.example" } });
    check("CORS does not reflect a foreign origin", badCors.headers.get("access-control-allow-origin") !== "https://evil.example");
  }

  // ------------------------------------------------------------ Phase 5
  S("Phase 5: auth API (main instance)");
  {
    let r = await A.register("alice", "alice@example.com", PW);
    check("register -> 201 with token + csrfToken + user", r.status === 201 && r.body.token && r.body.csrfToken && r.body.user?.email === "alice@example.com", r.text.slice(0, 200));
    const u = r.body.user || {};
    check("register response hides password / api-key ciphertext / lock fields", !("password" in u) && !("openaiApiKeyEncrypted" in u), Object.keys(u).join(","));
    const rc = r.setCookie.find((c) => c.startsWith("refreshToken="));
    check("refresh token cookie is HttpOnly, Path=/api/auth, SameSite=Lax", rc && /HttpOnly/i.test(rc) && /Path=\/api\/auth/.test(rc) && /SameSite=Lax/i.test(rc), rc);
    check("refresh token is NOT in the JSON body", !/refreshToken/i.test(JSON.stringify(r.body)));
    await B.register("bob", "bob@example.com", PW);
    await C.register("carol", "carol@example.com", PW);
    await ADMIN.register("admin", "admin@example.com", PW);
    await E.register("erin", "erin@example.com", PW);

    r = await new Client(main.base).register("dup", "ALICE@example.com", PW);
    check("duplicate email (case-insensitive) rejected 4xx", r.status === 400 || r.status === 409, `${r.status} ${r.text.slice(0, 120)}`);
    r = await new Client(main.base).req("POST", "/api/auth/register", { json: { username: "x", email: "not-an-email", password: "short" }, auth: false });
    check("invalid email/short password -> 400 VALIDATION_ERROR with details", r.status === 400 && r.body?.error?.code === "VALIDATION_ERROR", r.text.slice(0, 200));

    const pr = await A.req("GET", "/api/auth/profile");
    check("GET /profile with token -> 200", pr.status === 200 && pr.body.user?.email === "alice@example.com");
    check("profile has isAdmin=false for normal user, true for allowlisted", pr.body.user?.isAdmin === false && (await ADMIN.req("GET", "/api/auth/profile")).body.user?.isAdmin === true);
    check("GET /profile without token -> 401", (await new Client(main.base).req("GET", "/api/auth/profile")).status === 401);
    check("GET /profile with garbage token -> 401", (await new Client(main.base).req("GET", "/api/auth/profile", { headers: { authorization: "Bearer abc.def.ghi" } })).status === 401);
    const refreshCookie = A.cookies.refreshToken;
    check("refresh token presented as Bearer access token -> 401", (await new Client(main.base).req("GET", "/api/auth/profile", { headers: { authorization: `Bearer ${refreshCookie}` } })).status === 401);

    const hashDoc = await db.collection("users").findOne({ email: "alice@example.com" });
    check("password stored as argon2id hash (never plaintext)", /^\$argon2id\$/.test(hashDoc.password), hashDoc.password?.slice(0, 20));

    const l1 = await new Client(main.base).login("alice@example.com", "wrong-password-1");
    const l2 = await new Client(main.base).login("ghost@example.com", "wrong-password-1");
    check("wrong password vs unknown email: identical 401 + message (no enumeration)", l1.status === 401 && l2.status === 401 && l1.body?.error?.message === l2.body?.error?.message, `${l1.body?.error?.message} | ${l2.body?.error?.message}`);

    const up = await A.req("PUT", "/api/auth/update-password", { json: { currentPassword: "nope-nope-nope", newPassword: "N3w-Passw0rd!!" } });
    check("update-password with wrong current -> 400 (not 401, so UI doesn't force logout)", up.status === 400, `${up.status}`);
    const up2 = await A.req("PUT", "/api/auth/update-password", { json: { currentPassword: PW, newPassword: "N3w-Passw0rd!!" } });
    check("update-password with correct current -> 200", up2.status === 200);
    check("login works with the new password", (await new Client(main.base).login("alice@example.com", "N3w-Passw0rd!!")).status === 200);
    check("old password no longer works", (await new Client(main.base).login("alice@example.com", PW)).status === 401);
  }

  // ------------------------------------------------------------ Phase 6 + 25 ingest
  S("Phase 6 + 25: documents API and ingest pipeline");
  let docA;
  {
    let r = await A.upload("no file", null);
    check("upload without a file -> 400", r.status === 400, `${r.status}`);
    r = await A.upload(null, pdf40);
    check("upload without a title -> 400", r.status === 400, `${r.status} ${r.text.slice(0, 100)}`);
    r = await A.upload("spoof", Buffer.from("hello, definitely not a pdf"), { type: "application/pdf" });
    check("non-PDF bytes with spoofed application/pdf mimetype -> 400", r.status === 400 && /valid PDF/i.test(r.text), `${r.status} ${r.text.slice(0, 100)}`);
    r = await A.upload("wrongtype", pdf40, { filename: "a.txt", type: "text/plain" });
    check("wrong mimetype -> rejected 4xx", r.status >= 400 && r.status < 500, `${r.status}`);
    const before = fs.readdirSync(UPLOAD).length;
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 32)]);
    r = await A.upload("toobig", big);
    check("file > 10 MB rejected (4xx)", r.status >= 400 && r.status < 500, `${r.status} ${r.text.slice(0, 100)}`);
    check("rejected uploads leave no orphan files on disk", fs.readdirSync(UPLOAD).length === before, `${before} -> ${fs.readdirSync(UPLOAD).length}`);

    fake.reset();
    const t0 = Date.now();
    r = await A.upload("Biology & Math Reader", pdf40);
    const uploadMs = Date.now() - t0;
    docA = r.body;
    check("valid PDF upload -> 201", r.status === 201, `${r.status} ${r.text.slice(0, 200)}`);
    check("response: fileUrl, fileMissing=false, pageCount=40, hasExtractedText, textSource=native",
      docA.fileUrl && docA.fileMissing === false && docA.pageCount === 40 && docA.hasExtractedText === true && docA.textSource === "native", JSON.stringify({ ...docA, extractedText: undefined }).slice(0, 300));
    check("response never contains extractedText / pageMap", !("extractedText" in docA) && !("pageMap" in docA));
    note("upload+ingest latency (40 pages, fake embeddings)", `${uploadMs} ms`);

    const chunks = await db.collection("chunks").find({ document: new mongoose.Types.ObjectId(docA._id) }).toArray();
    check("chunks persisted for the document", chunks.length > 5, `${chunks.length}`);
    check("every chunk has a 1536-d embedding + page + endPage", chunks.every((c) => c.embedding?.length === 1536 && c.page >= 1 && c.endPage >= c.page), "");
    check("embedding API was called (batched)", fake.count((c) => c.kind === "embeddings") >= 1 && fake.state.embeddedInputs === chunks.length, `inputs=${fake.state.embeddedInputs} chunks=${chunks.length}`);
    check("embedding spend recorded in the LlmCall ledger", (await db.collection("llmcalls").countDocuments({ feature: "embedding" })) >= 1);

    const file = await fetch(main.base + docA.fileUrl);
    check("served PDF at fileUrl: 200 application/pdf", file.status === 200 && /pdf/.test(file.headers.get("content-type") || ""), `${file.status} ${file.headers.get("content-type")}`);
    check("served PDF is iframe-embeddable ONLY by the frontend origin (CSP frame-ancestors)", file.headers.get("x-frame-options") == null && file.headers.get("content-security-policy") === `frame-ancestors ${CLIENT_URL}`, `${file.headers.get("x-frame-options")} | ${file.headers.get("content-security-policy")}`);

    r = await A.req("GET", "/api/documents?limit=1000");
    check("list: paginated envelope {items,page,limit,total,totalPages}, limit clamped to 50", r.body.items && r.body.limit === 50 && r.body.total >= 1 && r.body.totalPages >= 1, JSON.stringify({ ...r.body, items: undefined }));
    check("list: no extractedText/pageMap in items; has flashcardCount+quizCount", r.body.items.every((d) => !("extractedText" in d) && !("pageMap" in d) && "flashcardCount" in d && "quizCount" in d));
    const t1 = (await A.req("GET", `/api/documents/${docA._id}`)).body;
    check("GET /documents/:id bumps lastAccessedAt", new Date(t1.lastAccessedAt) >= new Date(docA.lastAccessedAt), "");
    check("GET /documents/notanid -> 400 VALIDATION_ERROR (not 500)", (await A.req("GET", "/api/documents/abc")).status === 400);

    fake.reset();
    r = await A.upload("Same PDF again", pdf40);
    check("re-upload of identical PDF costs 0 embedding calls (content-hash cache)", r.status === 201 && fake.count((c) => c.kind === "embeddings") === 0, `embedCalls=${fake.count((c) => c.kind === "embeddings")}`);
    const dup = r.body;
    const dchunks = await db.collection("chunks").countDocuments({ document: new mongoose.Types.ObjectId(dup._id), embedding: { $exists: true } });
    check("...and the duplicate's chunks still carry embeddings", dchunks > 5, `${dchunks}`);
    const del = await A.req("DELETE", `/api/documents/${dup._id}`);
    check("DELETE document -> 200; DB row and file removed", del.status === 200 && !fs.existsSync(path.join(UPLOAD, dup.fileName)) && !(await db.collection("documents").findOne({ _id: new mongoose.Types.ObjectId(dup._id) })));
    check("DELETE document also removes its chunks (no orphan vectors)", (await db.collection("chunks").countDocuments({ document: new mongoose.Types.ObjectId(dup._id) })) === 0, `${await db.collection("chunks").countDocuments({ document: new mongoose.Types.ObjectId(dup._id) })} chunks left`);
    {
      const K = new Client(main.base);
      await K.register("casc", "casc@example.com", PW);
      const kd = (await K.upload("cascade doc", pdf40)).body;
      await K.req("POST", "/api/ai/chat", { json: { documentId: kd._id, message: "Where does the Krebs cycle occur?" } });
      await K.req("POST", "/api/ai/generate-flashcards", { json: { documentId: kd._id, count: 2 } });
      await K.req("POST", "/api/ai/summary", { json: { documentId: kd._id } });
      await K.req("DELETE", `/api/documents/${kd._id}`);
      const kid = new mongoose.Types.ObjectId(kd._id);
      const left = {};
      for (const c of ["chunks", "flashcards", "chathistories", "generationcaches"]) left[c] = await db.collection(c).countDocuments({ document: kid });
      check("DELETE document cascades to chat history, cached generations, chunks and flashcards (no orphans / no retained text)", Object.values(left).every((n) => n === 0), JSON.stringify(left));
      const d = (await K.req("GET", "/api/dashboard/overview")).body;
      check("dashboard counts drop to 0 after deleting the only document", d.totalDocuments === 0 && d.totalFlashcards === 0, JSON.stringify(d));
    }
  }

  // ------------------------------------------------------------ Phase 8 + 25
  S("Phase 8 + 25: RAG chat, citations, rerank, groundedness, rewrite, semantic cache");
  const chat = (client, documentId, message) => client.req("POST", "/api/ai/chat", { json: { documentId, message } });
  {
    fake.reset();
    let r = await chat(A, docA._id, "What does Theorem 4.2 Vandermonde bound state?");
    check("chat -> 200 with reply + sources + groundedness + messages", r.status === 200 && r.body.reply && Array.isArray(r.body.sources) && r.body.groundedness && r.body.messages?.length === 2, r.text.slice(0, 250));
    check("citations: top source's page range covers p.22 (the true page)", covers(r.body.sources?.[0], 22), JSON.stringify(r.body.sources?.map((s) => [s.page, s.endPage])));
    check("citation snippet is the matching passage (not the chunk's unrelated opening)", /Vandermonde/.test(r.body.sources?.[0]?.snippet || ""), (r.body.sources?.[0]?.snippet || "").slice(0, 120));
    check("citation carries the EXACT page of that passage (snippetPage = 22)", r.body.sources?.[0]?.snippetPage === 22, JSON.stringify(r.body.sources?.map((x) => x.snippetPage)));
    check("only relevant chunks are cited (rerank-filtered), not all 6 retrieved", r.body.sources?.length >= 1 && r.body.sources.length < 6, `${r.body.sources?.length} sources`);
    check("sources carry chunkId + sectionPath fields", r.body.sources?.every((s) => "chunkId" in s && "sectionPath" in s));
    check("pipeline ran: embedding + rerank + chat + groundedness calls", fake.count((c) => c.kind === "embeddings") >= 1 && fake.count((c) => c.feature === "rerank") === 1 && fake.count((c) => c.feature === "chat") === 1 && fake.count((c) => c.feature === "groundedness") === 1,
      JSON.stringify(fake.state.calls.map((c) => c.feature || c.kind)));
    check("groundedness verdict = grounded for a faithful answer", r.body.groundedness?.grounded === true);
    check("first message: no query-rewrite call (nothing to resolve)", fake.count((c) => c.feature === "rewrite") === 0);

    r = await chat(A, docA._id, "When was the Treaty of Zanzibar signed?");
    check("Zanzibar question -> source covers p.38", covers(r.body.sources?.[0], 38), JSON.stringify(r.body.sources?.map((s) => [s.page, s.endPage])));
    r = await chat(A, docA._id, "Where does the Krebs cycle occur?");
    check("Krebs question -> source covers p.5", covers(r.body.sources?.[0], 5), JSON.stringify(r.body.sources?.map((s) => [s.page, s.endPage])));

    fake.reset();
    r = await chat(A, docA._id, "Why does that theorem matter?");
    check("follow-up ('that theorem') is rewritten into a standalone query", fake.count((c) => c.feature === "rewrite") === 1);
    check("...and the rewritten query retrieves p.22", covers(r.body.sources?.[0], 22), JSON.stringify(r.body.sources?.map((s) => [s.page, s.endPage])));

    fake.reset();
    r = await chat(A, docA._id, "What does Theorem 4.2 Vandermonde bound state?");
    check("semantic cache: repeating a question makes ZERO chat/rerank/groundedness LLM calls", fake.count((c) => c.kind === "chat" && ["chat", "rerank", "groundedness"].includes(c.feature)) === 0, JSON.stringify(fake.state.calls.map((c) => c.feature || c.kind)));
    check("...cached reply still returns sources", r.status === 200 && r.body.sources?.length > 0);
    const cacheRow = await db.collection("generationcaches").findOne({ feature: "chat", hitCount: { $gte: 1 } });
    check("cache hit counter incremented in GenerationCache", !!cacheRow, "");

    r = await chat(A, docA._id, "Tell me about the Zanzibar moon");
    check("hallucinated answer is flagged: groundedness.grounded=false + unsupportedClaims", r.body.groundedness?.grounded === false && r.body.groundedness.unsupportedClaims?.length > 0, JSON.stringify(r.body.groundedness));

    fake.state.fail.rerank = { status: 500 };
    r = await chat(A, docA._id, "What is the Krebs cycle mitochondrial matrix NADH?");
    check("rerank provider failure degrades gracefully (chat still 200)", r.status === 200 && r.body.sources?.length > 0, `${r.status} ${r.text.slice(0, 150)}`);
    fake.state.fail.groundedness = { badJson: true };
    r = await chat(A, docA._id, "Explain the Treaty Heligoland concessions Germany");
    check("groundedness failure degrades gracefully (chat 200, verdict null)", r.status === 200 && (r.body.groundedness == null), `${r.status} ${JSON.stringify(r.body.groundedness)}`);

    // ---- SSE streaming
    {
      const res = await fetch(`${main.base}/api/ai/chat/stream`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${A.token}` }, body: JSON.stringify({ documentId: docA._id, message: "Where does the Krebs cycle occur inside the cell?" }) });
      const text = await res.text();
      const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
      check("chat/stream answers as text/event-stream", res.status === 200 && /text\/event-stream/.test(res.headers.get("content-type") || ""), `${res.status} ${res.headers.get("content-type")}`);
      check("stream order: sources -> tokens -> done", events[0] === "sources" && events.at(-1) === "done" && events.filter((e) => e === "token").length > 3, events.join(",").slice(0, 120));
      const done = JSON.parse(/event: done\ndata: (.*)/.exec(text)?.[1] || "{}");
      check("stream 'done' carries the full reply, sources and saved messages", done.reply?.includes("Krebs") && done.sources?.length >= 1 && done.messages?.length > 0, JSON.stringify(done).slice(0, 160));
      const bad = await fetch(`${main.base}/api/ai/chat/stream`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${A.token}` }, body: JSON.stringify({ documentId: "a".repeat(24), message: "x" }) });
      check("stream: a failure before the first event is plain JSON (404)", bad.status === 404 && /json/.test(bad.headers.get("content-type") || ""), `${bad.status} ${bad.headers.get("content-type")}`);
    }

    const h = await A.req("GET", `/api/ai/chat-history/${docA._id}`);
    check("GET chat-history returns persisted messages (user+assistant pairs)", h.status === 200 && Array.isArray(h.body) && h.body.length >= 14 && h.body.length % 2 === 0, `${h.body.length}`);
    check("persisted assistant messages keep their sources", h.body.some((m) => m.role === "assistant" && m.sources?.length > 0));
    check("...including the exact snippetPage (the UI renders the persisted copy, not the raw response)", h.body.some((m) => m.sources?.some((x) => x.snippetPage === 22)), JSON.stringify(h.body.filter((m) => m.sources).slice(0, 1).map((m) => m.sources.map((x) => x.snippetPage))));
    check("empty message -> 400", (await chat(A, docA._id, "   ")).status === 400);
    check("chat on someone else's document -> 404", (await chat(B, docA._id, "hi")).status === 404);
    check("chat with malformed documentId -> 400", (await chat(A, "zzz", "hi")).status === 400);
    const feats = await db.collection("llmcalls").aggregate([{ $group: { _id: "$feature", n: { $sum: 1 } } }]).toArray();
    note("LlmCall ledger rows by feature", feats.map((f) => `${f._id}:${f.n}`).join(", "));
    check("ledger has rows for chat, rerank, groundedness, embedding, query-rewrite", ["chat", "rerank", "groundedness", "embedding", "query-rewrite"].every((f) => feats.some((x) => x._id === f)), feats.map((f) => f._id).join(","));
    const one = await db.collection("llmcalls").findOne({ feature: "chat" });
    check("ledger row has model/tokens/cost/latency/requestId", one && one.model && one.promptTokens >= 0 && one.costUsd != null && one.latencyMs != null && one.requestId, JSON.stringify(one));
    check("ledger rows carry a cacheHit flag (false on a real call)", one && one.cacheHit === false, `fields: ${Object.keys(one || {}).join(",")}`);
    const hitRow = await db.collection("llmcalls").findOne({ cacheHit: true, feature: "chat" });
    check("a semantic-cache hit is recorded in the ledger (cacheHit=true, cost 0, model 'cache')", hitRow && hitRow.costUsd === 0 && hitRow.model === "cache", JSON.stringify(hitRow));
  }

  // ------------------------------------------------------------ generation (user C)
  S("Phase 8: generation, model routing, idempotency, summary cache");
  let docC, setC, quizC;
  {
    docC = (await C.upload("Carol's reader", pdf40)).body;
    fake.reset();
    let r = await C.req("POST", "/api/ai/generate-flashcards", { json: { documentId: docC._id, count: 4 } });
    setC = r.body;
    check("generate-flashcards -> 201, saves a set with 4 cards", r.status === 201 && setC.cards?.length === 4, `${r.status} ${r.text.slice(0, 200)}`);
    check("invalid difficulty from model is normalized to 'medium'", setC.cards?.every((c) => ["easy", "medium", "hard"].includes(c.difficulty)) && setC.cards?.[3]?.difficulty === "medium");
    const fcCall = fake.state.calls.find((c) => c.feature === "flashcards");
    check("flashcards use the cheap default model", fcCall?.model === "gpt-4o-mini", fcCall?.model);
    check("flashcards prompted for JSON mode", fcCall?.json === true);
    r = await C.req("POST", "/api/ai/generate-flashcards", { json: { documentId: docC._id, count: 999 } });
    check("count is clamped (999 -> 30 cards)", r.status === 201 && r.body.cards?.length === 30, `${r.body.cards?.length}`);
    await C.req("DELETE", `/api/flashcards/${r.body._id}`);

    r = await C.req("POST", "/api/ai/generate-quiz", { json: { documentId: docC._id, numQuestions: 4 } });
    quizC = r.body;
    check("generate-quiz -> 201 with 4 questions x 4 options", r.status === 201 && quizC.questions?.length === 4 && quizC.questions.every((q) => q.options.length === 4), `${r.status} ${r.text.slice(0, 200)}`);
    const qCall = fake.state.calls.find((c) => c.feature === "quiz");
    check("ROUTING: quiz still uses gpt-4o even though OPENAI_MODEL=gpt-4o-mini (the documented deploy config)", qCall?.model === "gpt-4o", qCall?.model);
    check("questions carry a concept tag", quizC.questions?.every((q) => q.concept));

    fake.reset();
    r = await C.req("POST", "/api/ai/summary", { json: { documentId: docC._id } });
    check("summary -> 200 markdown", r.status === 200 && /Summary/.test(r.body.summary), r.text.slice(0, 120));
    r = await C.req("POST", "/api/ai/summary", { json: { documentId: docC._id } });
    check("summary: 2nd identical request served from exact-hash cache (1 LLM call total)", r.status === 200 && fake.count((c) => c.feature === "summary") === 1, `${fake.count((c) => c.feature === "summary")}`);
    r = await C.req("POST", "/api/ai/explain", { json: { documentId: docC._id, concept: "Krebs cycle" } });
    check("explain -> 200 markdown", r.status === 200 && r.body.explanation, r.text.slice(0, 100));
    check("explain without concept -> 400", (await C.req("POST", "/api/ai/explain", { json: { documentId: docC._id } })).status === 400);

    fake.state.fail.flashcards = { badJson: true };
    const before = (await db.collection("flashcards").countDocuments({}));
    r = await C.req("POST", "/api/ai/generate-flashcards", { json: { documentId: docC._id, count: 3 } });
    check("model returns non-JSON -> 502 with clear message, nothing persisted", r.status === 502 && (await db.collection("flashcards").countDocuments({})) === before, `${r.status} ${r.text.slice(0, 150)}`);
    fake.state.fail.quiz = { status: 500, times: 3 }; // the OpenAI SDK retries 5xx twice by itself
    r = await C.req("POST", "/api/ai/generate-quiz", { json: { documentId: docC._id, numQuestions: 2 } });
    check("provider 500 -> 502 (not a crash), nothing persisted", r.status === 502, `${r.status} ${r.text.slice(0, 150)}`);

    fake.state.delayMs.flashcards = 900;
    const [x, y] = await Promise.all([1, 2].map(() => C.req("POST", "/api/ai/generate-flashcards", { json: { documentId: docC._id, count: 3 } })));
    fake.state.delayMs.flashcards = 0;
    const sts = [x.status, y.status].sort();
    check("double-click generation: one 201 + one 409 (in-flight guard)", sts[0] === 201 && sts[1] === 409, sts.join(","));
    const created = [x, y].find((q) => q.status === 201);
    if (created) await C.req("DELETE", `/api/flashcards/${created.body._id}`);
    const lst = await C.req("GET", "/api/documents");
    const d = lst.body.items.find((i) => i._id === docC._id);
    check("document list shows flashcardCount=1 and quizCount=1", d?.flashcardCount === 1 && d?.quizCount === 1, JSON.stringify({ f: d?.flashcardCount, q: d?.quizCount }));
    r = await C.req("POST", "/api/ai/generate-flashcards", { json: { documentId: docC._id, count: 3, concept: "Krebs cycle" } });
    check("concept-targeted flashcards: 201, titled after the concept", r.status === 201 && / — Krebs cycle$/.test(r.body.title || ""), `${r.status} ${r.body?.title}`);
    if (r.status === 201) await C.req("DELETE", `/api/flashcards/${r.body._id}`);
    r = await C.req("POST", "/api/ai/generate-quiz", { json: { documentId: docC._id, numQuestions: 2, concept: "Krebs cycle" } });
    check("concept-targeted quiz: 201, every question pinned to the concept", r.status === 201 && r.body.questions?.every((q) => q.concept === "Krebs cycle"), JSON.stringify(r.body.questions?.map((q) => q.concept)));
    if (r.status === 201) await C.req("DELETE", `/api/quizzes/${r.body._id}`);
  }

  // ------------------------------------------------------------ flashcards / review
  S("Phase 9 + 27: flashcard API, FSRS grading, ReviewLog, due queue, streak, forecast");
  {
    let r = await C.req("GET", "/api/flashcards");
    check("GET /flashcards -> paginated list with progress fields", r.status === 200 && r.body.items?.[0] && "reviewedCount" in r.body.items[0] && "totalCards" in r.body.items[0] && "progressPercent" in r.body.items[0], r.text.slice(0, 200));
    r = await C.req("GET", `/api/flashcards/document/${docC._id}`);
    check("GET /flashcards/document/:id -> array", Array.isArray(r.body) && r.body.length === 1);
    r = await C.req("GET", `/api/flashcards/${setC._id}`);
    check("GET /flashcards/:setId -> set with cards, 0% progress", r.body.totalCards === 4 && r.body.progressPercent === 0);

    r = await C.req("GET", "/api/review/due");
    check("due queue includes all 4 never-reviewed cards, each flagged isNew", r.status === 200 && r.body.total >= 4 && r.body.items.filter((i) => i.flashcardSetId === setC._id).every((i) => i.isNew), `${r.body.total}`);
    check("due queue items carry document title + set id (cross-document)", r.body.items[0]?.documentTitle && r.body.items[0]?.flashcardSetId);

    const cards = setC.cards;
    const dues = {};
    for (const [i, grade] of ["again", "hard", "good", "easy"].entries()) {
      r = await C.req("PUT", `/api/flashcards/${setC._id}/cards/${cards[i]._id}/review`, { json: { grade } });
      const c = r.body.cards?.find((x) => x._id === cards[i]._id);
      dues[grade] = c?.schedule?.dueDate ? new Date(c.schedule.dueDate).getTime() : null;
      check(`review grade '${grade}' -> 200, schedule written (stability/difficulty/dueDate)`, r.status === 200 && c?.schedule?.stability > 0 && c?.schedule?.dueDate, `${r.status} ${JSON.stringify(c?.schedule)}`);
    }
    check("FSRS intervals are ordered: again < hard < good < easy", dues.again < dues.hard && dues.hard < dues.good && dues.good < dues.easy, JSON.stringify(Object.fromEntries(Object.entries(dues).map(([k, v]) => [k, Math.round((v - Date.now()) / 3600000) + "h"]))));
    r = await C.req("GET", `/api/flashcards/${setC._id}`);
    check("progress now 4/4 = 100%", r.body.reviewedCount === 4 && r.body.progressPercent === 100, `${r.body.reviewedCount} ${r.body.progressPercent}`);
    check("invalid grade -> 400", (await C.req("PUT", `/api/flashcards/${setC._id}/cards/${cards[0]._id}/review`, { json: { grade: "perfect" } })).status === 400);
    check("legacy body-less review (old plan contract) -> 400", (await C.req("PUT", `/api/flashcards/${setC._id}/cards/${cards[0]._id}/review`, { json: {} })).status === 400);
    const logs = await db.collection("reviewlogs").find({ flashcardSet: new mongoose.Types.ObjectId(setC._id) }).toArray();
    check("ReviewLog: 4 immutable rows, algorithm=fsrs, with stateBefore/After", logs.length === 4 && logs.every((l) => l.algorithm === "fsrs" && l.stateBefore && l.stateAfter), `${logs.length}`);

    r = await C.req("GET", "/api/review/due");
    const mine = r.body.items.filter((i) => i.flashcardSetId === setC._id).map((i) => i.cardId);
    check("due queue no longer contains the 'easy'/'good' cards", !mine.includes(cards[3]._id) && !mine.includes(cards[2]._id), JSON.stringify(mine));
    r = await C.req("GET", "/api/review/streak");
    check("streak endpoint: current >= 1 after reviewing today", r.status === 200 && r.body.currentStreak >= 1 && r.body.activeToday === true, r.text.slice(0, 150));
    r = await C.req("GET", `/api/review/forecast/${setC._id}`);
    const pts = r.body.points || [];
    check("retention forecast: 90-day series", r.status === 200 && pts.length >= 90, `${pts.length}`);
    const ret = pts.map((p) => p.avgRetention);
    check("forecast is non-increasing over time and within [0,1]", ret.every((v, i) => v >= 0 && v <= 1 && (i === 0 || v <= ret[i - 1] + 1e-9)), JSON.stringify(pts.slice(0, 3)));

    r = await C.req("PUT", `/api/flashcards/${setC._id}/cards/${cards[0]._id}/favorite`);
    check("toggle favorite on", r.status === 200 && r.body.cards.find((c) => c._id === cards[0]._id).isFavorite === true);
    r = await C.req("PUT", `/api/flashcards/${setC._id}/cards/${cards[0]._id}/favorite`);
    check("toggle favorite off", r.body.cards.find((c) => c._id === cards[0]._id).isFavorite === false);
    check("review of unknown cardId -> 404", (await C.req("PUT", `/api/flashcards/${setC._id}/cards/${"a".repeat(24)}/review`, { json: { grade: "good" } })).status === 404);
  }

  // ------------------------------------------------------------ quizzes
  S("Phase 10 + 27: quiz API, server-side grading, answer-key secrecy, BKT mastery");
  {
    let r = await C.req("GET", `/api/quizzes/document/${docC._id}`);
    check("SECURITY: per-document quiz list never contains 'correctAnswer'", r.status === 200 && !/correctAnswer/.test(r.text), "");
    check("SECURITY: ...nor the explanations", !/Because B/.test(r.text));
    r = await C.req("GET", "/api/quizzes");
    check("global quiz list: paginated, questionCount + document title, no questions[]", r.body.items?.[0]?.questionCount === 4 && r.body.items[0].document?.title && !("questions" in r.body.items[0]) && !/correctAnswer/.test(r.text), r.text.slice(0, 200));
    r = await C.req("GET", `/api/quizzes/${quizC._id}`);
    check("SECURITY: take-page quiz omits correctAnswer + explanation", r.status === 200 && !/correctAnswer/.test(r.text) && !/Because B/.test(r.text) && r.body.questions.length === 4);
    const qs = r.body.questions;
    check("results before submission -> 400", (await C.req("GET", `/api/quizzes/${quizC._id}/results`)).status === 400);
    check("submit with unknown questionId -> 400", (await C.req("POST", `/api/quizzes/${quizC._id}/submit`, { json: { answers: [{ questionId: "b".repeat(24), answer: "A0" }] } })).status === 400);
    check("submit with an answer that isn't one of the options -> 400", (await C.req("POST", `/api/quizzes/${quizC._id}/submit`, { json: { answers: [{ questionId: qs[0]._id, answer: "ZZZ" }] } })).status === 400);
    const answers = qs.map((q, i) => ({ questionId: q._id, answer: i % 2 === 0 ? `B${i}` : `A${i}` })).reverse(); // deliberately out of order
    r = await C.req("POST", `/api/quizzes/${quizC._id}/submit`, { json: { answers } });
    check("submit (answers sent out of order) -> graded by questionId: 2/4 = 50%", r.status === 200 && r.body.total === 4 && r.body.correct === 2 && r.body.incorrect === 2 && r.body.percentage === 50, r.text);
    check("resubmit a completed quiz -> 409 (score can't be overwritten)", (await C.req("POST", `/api/quizzes/${quizC._id}/submit`, { json: { answers } })).status === 409);
    r = await C.req("GET", `/api/quizzes/${quizC._id}/results`);
    check("results: per-question userAnswer/correctAnswer/explanation/isCorrect, totals match submit", r.status === 200 && r.body.percentage === 50 && r.body.questions.filter((q) => q.isCorrect).length === 2 && r.body.questions.every((q) => q.explanation && q.correctAnswer), r.text.slice(0, 200));
    check("QuizAttempt history row written", (await db.collection("quizattempts").countDocuments({ quiz: new mongoose.Types.ObjectId(quizC._id) })) === 1);

    r = await C.req("GET", "/api/mastery");
    const byC = Object.fromEntries((r.body.items || []).map((i) => [i.concept, i]));
    check("BKT mastery rows created for both concepts", byC["Krebs cycle"] && byC["Vandermonde bound"], JSON.stringify(Object.keys(byC)));
    check("BKT: concept answered right rose, concept answered wrong fell (vs. each other)", byC["Krebs cycle"]?.pKnown > byC["Vandermonde bound"]?.pKnown, `${byC["Krebs cycle"]?.pKnown} vs ${byC["Vandermonde bound"]?.pKnown}`);
    check("weak-areas list leads with the missed concept", r.body.weakest?.[0]?.concept === "Vandermonde bound", JSON.stringify(r.body.weakest?.map((w) => w.concept)));
    r = await C.req("GET", `/api/mastery?documentId=${docC._id}`);
    check("mastery scoped by documentId", r.status === 200 && r.body.items.length === 2);
  }

  // ------------------------------------------------------------ dashboard
  S("Phase 11: dashboard overview");
  {
    const r = await C.req("GET", "/api/dashboard/overview");
    const sets = await db.collection("flashcards").find({ user: new mongoose.Types.ObjectId((await C.req("GET", "/api/auth/profile")).body.user._id) }).toArray();
    const cardTotal = sets.reduce((a, s) => a + s.cards.length, 0);
    check("counts match the database (docs=1, quizzes=1, flashcards=sum of cards)", r.body.totalDocuments === 1 && r.body.totalQuizzes === 1 && r.body.totalFlashcards === cardTotal, JSON.stringify(r.body));
    check("recentActivity has label/timestamp/link (<=5)", r.body.recentActivity?.length >= 1 && r.body.recentActivity.length <= 5 && r.body.recentActivity[0].link?.startsWith("/documents/"));
  }

  // ------------------------------------------------------------ admin
  S("Arc D: admin cost dashboard");
  {
    let r = await C.req("GET", "/api/admin/costs");
    check("non-admin -> 403/404", r.status === 403 || r.status === 404, `${r.status}`);
    check("no token -> 401", (await new Client(main.base).req("GET", "/api/admin/costs")).status === 401);
    r = await ADMIN.req("GET", "/api/admin/costs?days=30");
    check("ADMIN_EMAILS user -> 200", r.status === 200, `${r.status} ${r.text.slice(0, 200)}`);
    check("admin costs reports the cache hit rate (hits > 0, 0 < rate <= 1)", r.body.cache?.hits >= 1 && r.body.cache.hitRate > 0 && r.body.cache.hitRate <= 1, JSON.stringify(r.body.cache));
    check("payload attributes spend to users and days", /alice|carol/.test(r.text) || (r.body.byUser?.length ?? r.body.users?.length) > 0, r.text.slice(0, 300));
  }

  // ------------------------------------------------------------ authorization matrix
  S("Authorization matrix: user B attacking user A / C resources");
  {
    const oid = (s) => s;
    const reqs = [
      ["GET", `/api/documents/${docA._id}`], ["DELETE", `/api/documents/${docA._id}`],
      ["POST", "/api/ai/chat", { documentId: docA._id, message: "hi" }],
      ["GET", `/api/ai/chat-history/${docA._id}`],
      ["POST", "/api/ai/generate-flashcards", { documentId: docA._id }], ["POST", "/api/ai/generate-quiz", { documentId: docA._id }],
      ["POST", "/api/ai/summary", { documentId: docA._id }], ["POST", "/api/ai/explain", { documentId: docA._id, concept: "x" }],
      ["GET", `/api/flashcards/${setC._id}`], ["PUT", `/api/flashcards/${setC._id}/cards/${setC.cards[0]._id}/review`, { grade: "good" }],
      ["PUT", `/api/flashcards/${setC._id}/cards/${setC.cards[0]._id}/favorite`], ["DELETE", `/api/flashcards/${setC._id}`],
      ["GET", `/api/review/forecast/${setC._id}`],
      ["GET", `/api/quizzes/${quizC._id}`], ["POST", `/api/quizzes/${quizC._id}/submit`, { answers: [] }],
      ["GET", `/api/quizzes/${quizC._id}/results`], ["DELETE", `/api/quizzes/${quizC._id}`],
    ];
    const bad = [];
    for (const [m, u, body] of reqs) {
      const r = await B.req(m, u, body ? { json: body } : {});
      if (r.status !== 404) bad.push(`${m} ${u.replace(/[a-f0-9]{24}/g, ":id")} -> ${r.status}`);
    }
    check(`B gets 404 (not 403/200) on all ${reqs.length} of another user's resources`, bad.length === 0, bad.join(" | "));
    const anon = new Client(main.base);
    const bad2 = [];
    for (const [m, u, body] of reqs) { const r = await anon.req(m, u, body ? { json: body } : {}); if (r.status !== 401) bad2.push(`${m} ${u} -> ${r.status}`); }
    check("no token -> 401 on every protected route", bad2.length === 0, bad2.join(" | "));
    check("B's lists never contain A's or C's data", (await B.req("GET", "/api/documents")).body.total === 0 && (await B.req("GET", "/api/flashcards")).body.total === 0 && (await B.req("GET", "/api/quizzes")).body.total === 0);
    check("B's mastery/due queue are empty", (await B.req("GET", "/api/mastery")).body.items.length === 0 && (await B.req("GET", "/api/review/due")).body.total === 0);
    check("A's data was NOT mutated by B's attempts (doc + set + quiz still exist)", !!(await C.req("GET", `/api/flashcards/${setC._id}`)).body._id && (await C.req("GET", `/api/quizzes/${quizC._id}/results`)).status === 200 && (await A.req("GET", `/api/documents/${docA._id}`)).status === 200);
  }

  // ------------------------------------------------------------ BYOK
  S("BYOK: bring-your-own OpenAI key");
  {
    let r = await E.req("PUT", "/api/auth/api-key", { json: { apiKey: "sk-bad" } });
    check("bad key rejected at save time (400, verified live against provider)", r.status === 400, `${r.status} ${r.text.slice(0, 150)}`);
    r = await E.req("PUT", "/api/auth/api-key", { json: { apiKey: "sk-erins-own-key-WXYZ" } });
    check("good key saved -> 200 + last4 only", r.status === 200 && r.body.openaiApiKeyLast4 === "WXYZ" && !/sk-erins/.test(r.text), r.text);
    const row = await db.collection("users").findOne({ email: "erin@example.com" });
    check("key encrypted at rest (ciphertext in DB, plaintext nowhere)", row.openaiApiKeyEncrypted && !JSON.stringify(row).includes("sk-erins-own-key"), (row.openaiApiKeyEncrypted || "").slice(0, 24));
    const prof = await E.req("GET", "/api/auth/profile");
    check("profile exposes only the last4, never the ciphertext/plaintext", prof.body.user.openaiApiKeyLast4 === "WXYZ" && !/openaiApiKeyEncrypted|sk-erins/.test(prof.text));
    const docE = (await E.upload("Erin doc", pdf40)).body;
    fake.reset();
    await E.req("POST", "/api/ai/generate-flashcards", { json: { documentId: docE._id, count: 2 } });
    await chat(E, docE._id, "Where does the Krebs cycle occur?");
    const keys = new Set(fake.state.calls.map((c) => c.key));
    check("all of Erin's AI traffic (chat/embed/rerank/gen) used HER key, never the shared one", keys.size === 1 && keys.has("sk-erins-own-key-WXYZ"), [...keys].join(","));
    fake.reset();
    await C.req("POST", "/api/ai/summary", { json: { documentId: docC._id } }).catch(() => {});
    await C.req("POST", "/api/ai/explain", { json: { documentId: docC._id, concept: "fallback key" } });
    check("a user with no key falls back to the shared key", fake.state.calls.length > 0 && fake.state.calls.every((c) => c.key === "sk-shared-fake"), [...new Set(fake.state.calls.map((c) => c.key))].join(","));
    const erinRows = await db.collection("llmcalls").find({ user: row._id }).toArray();
    check("BYOK calls are logged with keySource='own' (so they never count toward the deployer's budget)", erinRows.length > 0 && erinRows.every((x) => x.keySource === "own"), JSON.stringify(erinRows.map((x) => x.keySource)));
    const adminAfter = await ADMIN.req("GET", "/api/admin/costs?days=30");
    check("...and are excluded from the admin cost dashboard", !adminAfter.body.byUser?.some((u) => u.email === "erin@example.com"), JSON.stringify(adminAfter.body.byUser?.map((u) => u.email)));
    r = await E.req("DELETE", "/api/auth/api-key");
    check("DELETE api-key -> 200, last4 cleared", r.status === 200 && (await E.req("GET", "/api/auth/profile")).body.user.openaiApiKeyLast4 == null);
  }

  // ------------------------------------------------------------ scale
  S("Phase 25 'done when': 800-page PDF answers with a citation to the right page");
  {
    const big = makeDoc(800, { 611: "Lemma 9.9 (Quillfeather inequality) asserts that the sextic resonance coefficient never exceeds forty-one." }, 99);
    note("800-page PDF size", `${(big.length / 1048576).toFixed(2)} MB`);
    const t0 = Date.now();
    const r = await E.upload("800 pages", big);
    const up = Date.now() - t0;
    check("800-page upload accepted (under 10 MB)", r.status === 201, `${r.status} ${r.text.slice(0, 120)}`);
    note("upload+ingest latency, 800 pages", `${up} ms (synchronous in the request - roadmap Phase 26 will queue this)`);
    if (r.status === 201) {
      const nchunks = await db.collection("chunks").countDocuments({ document: new mongoose.Types.ObjectId(r.body._id) });
      note("chunks for 800 pages", nchunks);
      await E.req("DELETE", "/api/auth/api-key").catch(() => {});
      const q = await chat(E, r.body._id, "What does the Quillfeather inequality assert about the sextic resonance coefficient?");
      check("citation covers p.611", covers(q.body.sources?.[0], 611), JSON.stringify(q.body.sources?.map((s) => [s.page, s.endPage])));
      note("chat latency on 800-page doc (fake LLM, so this is retrieval cost only)", `${q.ms} ms`);
    }
  }

  // ------------------------------------------------------------ OCR
  S("Phase 26 item: OCR fallback for scanned PDFs");
  {
    const scanned = fs.readFileSync(`${BACKEND}/tests/fixtures/scanned.pdf`);
    const t0 = Date.now();
    const r = await B.upload("scanned", scanned);
    note("scanned.pdf upload", `${r.status} in ${Date.now() - t0} ms textSource=${r.body?.textSource} hasExtractedText=${r.body?.hasExtractedText}`);
    check("scanned PDF upload succeeds (201) instead of hard-failing", r.status === 201, `${r.status} ${r.text.slice(0, 150)}`);
    if (r.status === 201 && !r.body.hasExtractedText) {
      const g = await B.req("POST", "/api/ai/summary", { json: { documentId: r.body._id } });
      check("if OCR found nothing, AI routes return a clear 400 for the empty-text doc", g.status === 400 && /no extracted text/i.test(g.text), `${g.status} ${g.text.slice(0, 150)}`);
    } else if (r.status === 201) {
      check("OCR produced text (textSource=ocr)", r.body.textSource === "ocr", r.body.textSource);
    }
  }

  // ------------------------------------------------------------ AI rate limit
  S("Phase 21: AI rate limiting (30 / 15 min / user)");
  {
    const R = new Client(main.base);
    await R.register("rate", "rate@example.com", PW);
    const doc = (await R.upload("rl", pdf40)).body;
    let first429 = null;
    for (let i = 1; i <= 34; i += 1) {
      const r = await R.req("GET", `/api/ai/chat-history/${doc._id}`);
      if (r.status === 429) { first429 = i; break; }
    }
    check("31st AI-router request in the window is 429", first429 !== null && first429 >= 30 && first429 <= 31, `first429 at request #${first429}`);
    check("other users are not throttled by R's usage (per-user key)", (await C.req("GET", `/api/ai/chat-history/${docC._id}`)).status === 200);
  }
} catch (err) {
  console.error("HARNESS CRASH:", err);
  check("harness completed without crashing", false, err.stack?.split("\n").slice(0, 3).join(" | "));
}

// ------------------------------------------------------------ separate instances
const runInstance = async (label, port, env, fn) => {
  const be = await startBackend(label, port, env);
  try { await fn(be); } catch (err) { console.error(`${label} CRASH`, err); check(`${label} instance completed without crashing`, false, err.stack?.split("\n").slice(0, 3).join(" | ")); }
  await be.stop();
};

await runInstance("auth-tokens", 8712, {}, async (be) => {
  S("Phase 5/31: email verification, refresh rotation, CSRF, reuse detection");
  const u = new Client(be.base);
  let r = await u.register("lock", "lock@example.com", PW);
  check("register triggers a verification email (logged, RESEND unset)", r.status === 201 && !!lastToken(be, "verify-email"), "");
  const vtok = lastToken(be, "verify-email");
  r = await u.req("POST", "/api/auth/verify-email", { json: { token: vtok }, auth: false });
  check("verify-email with valid single-use token -> 200", r.status === 200, r.text);
  check("...profile now has emailVerifiedAt", !!(await u.req("GET", "/api/auth/profile")).body.user.emailVerifiedAt);
  check("verify-email token cannot be reused -> 400", (await u.req("POST", "/api/auth/verify-email", { json: { token: vtok }, auth: false })).status === 400);
  check("resend-verification when already verified -> 400", (await u.req("POST", "/api/auth/resend-verification")).status === 400);
  const vdb = await mongoose.connection.db.collection("emailverificationtokens").findOne({});
  check("verification token stored hashed (raw token not in DB)", vdb && !JSON.stringify(vdb).includes(vtok), Object.keys(vdb || {}).join(","));

  // refresh + CSRF + rotation + reuse
  const c = new Client(be.base);
  await c.login("lock@example.com", PW);
  const oldRefresh = c.cookies.refreshToken, oldCsrf = c.cookies.csrfToken;
  check("refresh without cookie -> 401", (await new Client(be.base).req("POST", "/api/auth/refresh")).status === 401);
  r = await c.req("POST", "/api/auth/refresh");
  check("refresh with cookie but NO csrf header -> 403", r.status === 403, `${r.status}`);
  r = await c.req("POST", "/api/auth/refresh", { headers: { "x-csrf-token": "wrong" } });
  check("refresh with WRONG csrf header -> 403", r.status === 403, `${r.status}`);
  r = await c.req("POST", "/api/auth/refresh", { headers: { "x-csrf-token": c.csrf } });
  check("refresh with correct double-submit csrf -> 200 + new access token + new csrf", r.status === 200 && r.body.token && r.body.csrfToken && r.body.csrfToken !== oldCsrf, r.text.slice(0, 150));
  check("refresh token was rotated (cookie value changed)", c.cookies.refreshToken && c.cookies.refreshToken !== oldRefresh);
  const newRefresh = c.cookies.refreshToken;
  c.token = r.body.token; c.csrf = r.body.csrfToken;
  check("new access token works", (await c.req("GET", "/api/auth/profile")).status === 200);
  // replay the OLD refresh token (attacker)
  const attacker = new Client(be.base);
  attacker.cookies = { refreshToken: oldRefresh, csrfToken: oldCsrf };
  r = await attacker.req("POST", "/api/auth/refresh", { headers: { "x-csrf-token": oldCsrf } });
  check("REUSE DETECTION: replaying a rotated-away refresh token -> 401", r.status === 401 && /reuse/i.test(r.text), `${r.status} ${r.text.slice(0, 150)}`);
  const victim = new Client(be.base);
  victim.cookies = { refreshToken: newRefresh, csrfToken: c.cookies.csrfToken };
  r = await victim.req("POST", "/api/auth/refresh", { headers: { "x-csrf-token": c.csrf } });
  check("REUSE DETECTION: legit descendant token is also revoked (whole family)", r.status === 401, `${r.status}`);

});

await runInstance("auth-sessions", 8716, {}, async (be) => {
  S("Phase 5/31: sessions list/revoke, logout, password reset");
  let r;
  const u = new Client(be.base);
  await u.register("lock", "lock@example.com", PW);
  // sessions
  const d1 = new Client(be.base), d2 = new Client(be.base);
  await d1.login("lock@example.com", PW); await d2.login("lock@example.com", PW);
  r = await d1.req("GET", "/api/auth/sessions");
  check("sessions list shows multiple devices, one flagged isCurrent", r.status === 200 && r.body.sessions.length >= 2 && r.body.sessions.filter((s) => s.isCurrent).length === 1, JSON.stringify(r.body.sessions?.map((s) => s.isCurrent)));
  const other = r.body.sessions.find((s) => !s.isCurrent);
  check("revoke another session -> 200", (await d1.req("DELETE", `/api/auth/sessions/${other.familyId}`)).status === 200);
  check("revoking a nonexistent/foreign session -> 404", (await d1.req("DELETE", `/api/auth/sessions/${crypto.randomUUID()}`)).status === 404);
  r = await d2.req("POST", "/api/auth/refresh", { headers: { "x-csrf-token": d2.csrf } });
  const d1Refresh = await d1.req("POST", "/api/auth/refresh", { headers: { "x-csrf-token": d1.csrf } });
  check("exactly one of the two devices was signed out by the revoke", [r.status, d1Refresh.status].sort().join() === "200,401", `${r.status},${d1Refresh.status}`);
  // logout
  const lo = await d1.req("POST", "/api/auth/logout");
  check("logout -> 200 and clears refresh cookie", lo.status === 200 && !d1.cookies.refreshToken);
  const ghost = new Client(be.base); ghost.cookies = { refreshToken: d1Refresh.status === 200 ? d1.cookies.refreshToken || "x" : "x" };
  // password reset
  r = await u.req("POST", "/api/auth/forgot-password", { json: { email: "nobody@example.com" }, auth: false });
  const r2 = await u.req("POST", "/api/auth/forgot-password", { json: { email: "lock@example.com" }, auth: false });
  check("forgot-password: identical response for unknown and known email", r.status === 200 && r2.status === 200 && r.body.message === r2.body.message);
  await sleep(300);
  const rtok = lastToken(be, "reset-password");
  check("reset link emailed (logged) only for the real account", !!rtok);
  const live = new Client(be.base); await live.login("lock@example.com", PW);
  r = await u.req("POST", "/api/auth/reset-password", { json: { token: "deadbeef".repeat(8), newPassword: "Brand-N3w-Pass!" }, auth: false });
  check("reset with a bogus token -> 400", r.status === 400);
  r = await u.req("POST", "/api/auth/reset-password", { json: { token: rtok, newPassword: "Brand-N3w-Pass!" }, auth: false });
  check("reset with valid token -> 200", r.status === 200, r.text);
  check("reset token is single-use (2nd use -> 400)", (await u.req("POST", "/api/auth/reset-password", { json: { token: rtok, newPassword: "Another-Pass-1!" }, auth: false })).status === 400);
  const rdb = await mongoose.connection.db.collection("passwordresettokens").findOne({});
  check("reset token stored hashed", rdb && !JSON.stringify(rdb).includes(rtok));
  r = await live.req("POST", "/api/auth/refresh", { headers: { "x-csrf-token": live.csrf } });
  check("password reset revokes pre-existing sessions", r.status === 401, `${r.status}`);
  check("login with the reset password works", (await new Client(be.base).login("lock@example.com", "Brand-N3w-Pass!")).status === 200);
});

await runInstance("auth-lockout", 8717, {}, async (be) => {
  S("Phase 5: account lockout (5 wrong -> 15 min)");
  const u = new Client(be.base);
  await u.register("lock", "lock@example.com", PW);
  // lockout
  const results5 = [];
  for (let i = 0; i < 5; i += 1) results5.push((await new Client(be.base).login("lock@example.com", "bad-bad-bad-1")).status);
  const lockedGood = await new Client(be.base).login("lock@example.com", PW);
  const lockedBad = await new Client(be.base).login("lock@example.com", "bad-bad-bad-1");
  const unknown = await new Client(be.base).login("who@example.com", "bad-bad-bad-1");
  check("account locks after 5 wrong passwords: even the CORRECT password now fails", results5.every((s) => s === 401) && lockedGood.status === 401, `${results5} then ${lockedGood.status}`);
  check("locked response is byte-identical to unknown-user response (no oracle)", lockedGood.body?.error?.message === unknown.body?.error?.message && lockedBad.body?.error?.message === unknown.body?.error?.message);
  const urow = await mongoose.connection.db.collection("users").findOne({ email: "lock@example.com" });
  check("lockUntil is ~15 minutes out", urow.lockUntil && Math.abs(new Date(urow.lockUntil) - Date.now() - 15 * 60000) < 60000, String(urow.lockUntil));
});

await runInstance("auth-ratelimit", 8713, {}, async (be) => {
  S("Phase 21: auth IP rate limiting (20 / 15 min)");
  const c = new Client(be.base);
  let first = null;
  for (let i = 1; i <= 24; i += 1) { const r = await c.login(`x${i}@example.com`, "whatever-1"); if (r.status === 429) { first = i; break; } }
  check("21st login attempt from one IP is 429", first === 21, `first429=${first}`);
});

await runInstance("budget", 8714, { MONTHLY_AI_BUDGET_USD: "0.0000001" }, async (be) => {
  S("Arc D: per-user monthly AI budget on the shared key");
  const D = new Client(be.base);
  await D.register("dee", "dee@example.com", PW);
  const doc = (await D.upload("budget doc", pdf40)).body;
  const g = () => D.req("POST", "/api/ai/generate-flashcards", { json: { documentId: doc._id, count: 2 } });
  let r = await g();
  check("first generation under budget -> 201", r.status === 201, `${r.status} ${r.text.slice(0, 150)}`);
  r = await g();
  check("second generation after cap reached -> 429 with a clear message", r.status === 429 && /budget/i.test(r.text), `${r.status} ${r.text.slice(0, 200)}`);
  const u = await mongoose.connection.db.collection("users").findOne({ email: "dee@example.com" });
  check("spend recorded on the user (aiUsage.spendUsd > 0)", u.aiUsage?.spendUsd > 0, JSON.stringify(u.aiUsage));
  await D.req("PUT", "/api/auth/api-key", { json: { apiKey: "sk-dee-own-key-1234567890" } });
  r = await g();
  check("after saving their OWN key, the cap no longer applies -> 201", r.status === 201, `${r.status} ${r.text.slice(0, 150)}`);
});

await runInstance("no-key", 8715, { OPENAI_API_KEY: "" }, async (be) => {
  S("Degradation with no API key configured (BYOK-only deploy)");
  const N = new Client(be.base);
  await N.register("nokey", "nokey@example.com", PW);
  fake.reset();
  const up = await N.upload("no key doc", pdf40);
  check("upload still works with no key (text extracted, chunks stored)", up.status === 201 && up.body.hasExtractedText, `${up.status}`);
  const n = await mongoose.connection.db.collection("chunks").countDocuments({ document: new mongoose.Types.ObjectId(up.body._id) });
  check("chunks stored WITHOUT embeddings, no provider calls made", n > 5 && fake.state.calls.length === 0, `${n} chunks, ${fake.state.calls.length} calls`);
  let r = await N.req("POST", "/api/ai/generate-flashcards", { json: { documentId: up.body._id } });
  check("AI action -> 400 with an actionable 'add your key' message", r.status === 400 && /API key/i.test(r.text), `${r.status} ${r.text.slice(0, 200)}`);
  r = await N.req("GET", "/api/auth/profile");
  check("profile flags aiSharedKeyConfigured=false so the UI can prompt for a key", r.body.user.aiSharedKeyConfigured === false);
});

// ------------------------------------------------------------ report
S("Summary");
const pass = results.filter((r) => r.ok === true).length;
const fail = results.filter((r) => r.ok === false);
console.log(`\nTOTAL: ${pass} passed, ${fail.length} failed, ${results.filter((r) => r.ok === null).length} notes`);
for (const f of fail) console.log(`  FAIL [${f.section}] ${f.name}\n        ${f.detail.slice(0, 400)}`);
fs.writeFileSync(path.join(OUT, "api-results.json"), JSON.stringify(results, null, 2));

await main.stop();
await fake.stop();
await mongoose.disconnect();
await mongod.stop();
fs.rmSync(UPLOAD, { recursive: true, force: true });
process.exit(fail.length ? 1 : 0);
