// RAG evals: does the pipeline retrieve, cite and answer correctly over a gold set?
//
//   node evals/run.mjs                     score against the fake provider (offline, deterministic)
//   node evals/run.mjs --check             ...and fail if any gated metric regressed vs the baseline
//   node evals/run.mjs --update-baseline   accept the current scores as the new baseline
//   EVAL_PROVIDER=openai OPENAI_API_KEY=sk-... node evals/run.mjs --check
//
// The fake provider makes this a deterministic regression test of the RETRIEVAL
// pipeline (chunking, BM25, RRF, rerank wiring, citation/page logic, prompt
// formatting): a change that makes the right chunk stop being retrieved or cited
// moves the number. It says nothing about how well a real model answers or how
// well real embeddings handle paraphrase — for that, run with EVAL_PROVIDER=openai
// and keep a separate baseline (baseline.openai.json).
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { buildGoldSet } from "./gold.mjs";
import { startFake } from "../live/fake-openai.mjs";
import { Client, startBackend, BACKEND, makeUploadDir, FAKE_PORT } from "../live/lib.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const provider = process.env.EVAL_PROVIDER || "fake";
const args = new Set(process.argv.slice(2));
const TOLERANCE = Number(process.env.EVAL_TOLERANCE ?? 0.02);
const baselinePath = path.join(HERE, `baseline.${provider}.json`);

const require = createRequire(`${BACKEND}/package.json`);
const { MongoMemoryServer } = require("mongodb-memory-server");

// Which metrics fail the check. Refusal is only meaningful for a real model — the
// fake always answers from the best excerpt — so it is reported but not gated there.
const GATED = provider === "fake" ? ["hitRate", "exactPageRate", "citationPrecision", "answerRate"] : ["hitRate", "exactPageRate", "citationPrecision", "answerRate", "refusalRate"];

const covers = (s, page) => (s.snippetPage != null ? s.snippetPage === page : s.page != null && s.page <= page && page <= (s.endPage ?? s.page));
const pct = (n, d) => (d ? n / d : null);
const percentile = (xs, p) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null;
};
const REFUSAL = /(don't|do not|does not|doesn't|not (covered|mentioned|contain|provide|include|specified|stated)|no (information|mention)|cannot find|can't find|isn't (covered|mentioned|stated)|unable to)/i;

makeUploadDir();
const mongod = await MongoMemoryServer.create();
globalThis.__mongoUri = mongod.getUri("evals");
const fake = provider === "fake" ? await startFake(FAKE_PORT) : null;
const backend = await startBackend(
  "evals",
  8721,
  provider === "fake" ? {} : { OPENAI_BASE_URL: "https://api.openai.com/v1", OPENAI_API_KEY: process.env.OPENAI_API_KEY || "" }
);

const rows = [];
try {
  const docs = buildGoldSet().slice(0, Number(process.env.EVAL_DOCS) || undefined);
  for (const [i, doc] of docs.entries()) {
    // One user per document: the AI endpoints are rate-limited per user (30 / 15 min).
    const client = new Client(backend.base);
    await client.register(`eval${i}`, `eval${i}@example.com`, "Str0ng-Passw0rd!");
    const up = await client.upload(doc.title, doc.pdf);
    if (up.status !== 201) throw new Error(`upload failed for ${doc.id}: ${up.status} ${up.text.slice(0, 200)}`);
    process.stdout.write(`\n${doc.title}: `);

    for (const q of doc.questions) {
      const res = await client.req("POST", "/api/ai/chat", { json: { documentId: up.body._id, message: q.question } });
      const sources = res.body.sources || [];
      const reply = res.body.reply || "";
      const answerable = q.answerPage != null;
      rows.push({
        id: q.id,
        category: q.category,
        answerable,
        ok: res.status === 200,
        ms: res.ms,
        sources: sources.length,
        hit: answerable ? sources.some((s) => covers(s, q.answerPage)) : null,
        exactPage: answerable ? sources[0]?.snippetPage === q.answerPage : null,
        precision: answerable && sources.length ? sources.filter((s) => covers(s, q.answerPage)).length / sources.length : answerable ? 0 : null,
        answered: answerable ? reply.toLowerCase().includes(String(q.mustContain).toLowerCase()) : null,
        refused: !answerable ? REFUSAL.test(reply) : null,
        ungroundedFlag: res.body.groundedness?.grounded === false,
      });
      process.stdout.write(rows.at(-1).ok ? "." : "x");
    }
  }
} finally {
  await backend.stop();
  await fake?.stop();
  await mongod.stop();
  fs.rmSync(globalThis.__uploadDir, { recursive: true, force: true });
}

const summarize = (subset) => {
  const ans = subset.filter((r) => r.answerable);
  const unans = subset.filter((r) => !r.answerable);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    questions: subset.length,
    failedRequests: subset.filter((r) => !r.ok).length,
    hitRate: pct(ans.filter((r) => r.hit).length, ans.length),
    exactPageRate: pct(ans.filter((r) => r.exactPage).length, ans.length),
    citationPrecision: mean(ans.map((r) => r.precision)),
    avgSources: mean(subset.map((r) => r.sources)),
    answerRate: pct(ans.filter((r) => r.answered).length, ans.length),
    refusalRate: pct(unans.filter((r) => r.refused).length, unans.length),
    ungroundedFlagRate: pct(subset.filter((r) => r.ungroundedFlag).length, subset.length),
    latencyP50Ms: percentile(subset.map((r) => r.ms), 50),
    latencyP95Ms: percentile(subset.map((r) => r.ms), 95),
  };
};

const overall = summarize(rows);
const byCategory = Object.fromEntries([...new Set(rows.map((r) => r.category))].map((c) => [c, summarize(rows.filter((r) => r.category === c))]));

const fmt = (v, isPct = true) => (v == null ? "n/a" : isPct ? `${(v * 100).toFixed(1)}%` : typeof v === "number" ? v.toFixed(1) : v);
const table = (name, m) =>
  `| ${name} | ${m.questions} | ${fmt(m.hitRate)} | ${fmt(m.exactPageRate)} | ${fmt(m.citationPrecision)} | ${fmt(m.answerRate)} | ${fmt(m.refusalRate)} | ${fmt(m.avgSources, false)} | ${fmt(m.latencyP95Ms, false)} |`;

const report = `# RAG eval — provider: ${provider}

${rows.length} questions over ${new Set(rows.map((r) => r.id.split("-")[0])).size} documents (synthetic gold set — see e2e/evals/README.md for what it does and does not show).

| Slice | Qs | Retrieval hit | Exact page | Citation precision | Answer contains | Refuses unanswerable | Avg sources | p95 ms |
|---|---|---|---|---|---|---|---|---|
${table("**overall**", overall)}
${Object.entries(byCategory).map(([c, m]) => table(c, m)).join("\n")}

- **Retrieval hit** — some cited source covers the page holding the answer.
- **Exact page** — the top source's \`snippetPage\` is that page.
- **Citation precision** — share of cited sources that cover the answer's page.
- **Answer contains** — the reply includes the expected fact.
- **Refuses unanswerable** — for questions the document does not answer, the reply says so.${provider === "fake" ? " (Not gated with the fake provider, which always answers from the best excerpt.)" : ""}
`;

fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
fs.writeFileSync(path.join(HERE, "results", `${provider}.md`), report);
// Every answerable question that missed on any axis, so a drop is diagnosable, not just a number.
const misses = rows.filter((r) => r.answerable && (!r.hit || !r.exactPage || !r.answered)).map((r) => ({ id: r.id, category: r.category, hit: r.hit, exactPage: r.exactPage, answered: r.answered, sources: r.sources }));
fs.writeFileSync(path.join(HERE, "results", `${provider}.json`), JSON.stringify({ overall, byCategory, misses }, null, 2) + "\n");
console.log(`\n\n${report}`);

if (args.has("--update-baseline")) {
  fs.writeFileSync(baselinePath, JSON.stringify({ provider, tolerance: TOLERANCE, gated: GATED, overall: Object.fromEntries(GATED.map((k) => [k, overall[k]])) }, null, 2) + "\n");
  console.log(`Baseline written: ${path.relative(process.cwd(), baselinePath)}`);
}

if (args.has("--check")) {
  if (!fs.existsSync(baselinePath)) {
    console.error(`No baseline at ${baselinePath} — run with --update-baseline first.`);
    process.exit(2);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const regressions = [];
  if (overall.failedRequests > 0) regressions.push(`${overall.failedRequests} chat request(s) failed`);
  for (const k of GATED) {
    const was = baseline.overall[k];
    const now = overall[k];
    if (was != null && (now == null || now < was - TOLERANCE)) regressions.push(`${k}: ${fmt(now)} < baseline ${fmt(was)} (tolerance ${TOLERANCE * 100}pp)`);
  }
  if (regressions.length) {
    console.error(`EVAL REGRESSION:\n  - ${regressions.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("Eval check passed: no gated metric regressed beyond tolerance.");
}
process.exit(0);
