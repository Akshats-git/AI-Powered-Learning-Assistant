# RAG evals

Scores the retrieval and citation pipeline over a 100-question gold set, and
fails CI if it regresses. Prompts and retrieval code are code — a change that
quietly makes the right chunk stop being retrieved or cited should break a
build, not get noticed by a user.

```
npm run eval             # score, write evals/results/<provider>.{md,json}
npm run eval:check       # ...and exit 1 if a gated metric fell below the baseline
npm run eval:baseline    # accept the current scores as the new baseline
EVAL_PROVIDER=openai OPENAI_API_KEY=sk-... npm run eval:check   # against the real API
```

It drives the real backend through the real API (upload, then `POST /api/ai/chat`
for each question), so it exercises chunking, BM25 + vector search + RRF, rerank,
citations and page attribution together — not each in isolation.

## What is measured

| Metric | Meaning |
|---|---|
| Retrieval hit | some cited source covers the page that holds the answer |
| Exact page | the top source's `snippetPage` is that page |
| Citation precision | share of cited sources that cover the answer's page |
| Answer contains | the reply includes the expected fact |
| Refuses unanswerable | for a question the document doesn't answer, the reply says so |

Latest scores: [results/fake.md](results/fake.md).

## What this does and does not show

**Provider `fake` (default, offline, deterministic).** A regression test of the
*retrieval pipeline*. The fake embeds with hashed bag-of-words and "answers" with
the best-matching excerpt sentence, so a change to chunking, retrieval, ranking,
citation logic or prompt formatting moves the number and a change to the model
can't. It says **nothing** about answer quality with a real model or about real
embeddings handling paraphrase, and refusal is reported but not gated (the fake
never refuses).

**Provider `openai`.** The measurement that answers "how good is the product":
real embeddings, real rerank, real answers, refusal gated. Keep it as a separate
baseline (`baseline.openai.json`, created by `EVAL_PROVIDER=openai npm run eval:baseline`)
and run it before a release or when changing prompts/models; it costs a few cents.

**The gold set is synthetic.** Facts are invented (rare entity names and numbers)
so a right answer can only come from retrieval, never from model knowledge — that
is what makes the score attributable to the pipeline. The cost is that it
over-represents questions that share rare words with their answer (which BM25
finds trivially) and has no real paraphrase, tables or diagrams. A high score
here means "the plumbing works", not "94% accurate on your users' PDFs". Add
questions over real PDFs before quoting an accuracy number.
