# E2E tests

Playwright smoke tests for the journeys that don't need a real LLM: register
→ logout → login, and upload → see it in the document list.

`run.mjs` orchestrates the whole thing so `npm test` is the only command you
need:

1. starts an ephemeral in-memory MongoDB (`mongodb-memory-server`)
2. starts the backend (`node server.js`) against it on port 8491, with no
   `OPENAI_API_KEY` — AI features aren't exercised here
3. starts the frontend dev server on port 5491, pointed at that backend
4. runs the Playwright specs in `tests/`
5. tears everything down (including the Mongo instance) when done

## Setup (one-time)

```
npm install
npx playwright install chromium
```

## Run

```
npm test
```

`npm test` runs in CI as its own job (see `.github/workflows/ci.yml`).

## Full-product journeys (`live/`)

The Playwright smoke tests above run with no LLM. `live/` covers everything
that needs one, by pointing the backend at a **fake OpenAI server**
(`live/fake-openai.mjs`) through `OPENAI_BASE_URL`: deterministic embeddings,
rerank, groundedness, generation, and per-call recording so the tests can
assert cache hits, which model each feature used, and which key each request
used. No real key, no cost, no network.

| Command | What it drives |
|---|---|
| `npm run test:api` | The whole API against a real backend and in-memory Mongo: auth (lockout, CSRF, refresh rotation and reuse detection, sessions, reset, verify), upload and ingest, RAG chat with exact-page citations, rerank, groundedness, semantic and summary caches, generation, model routing, FSRS grading, due queue, quizzes, BKT mastery, dashboard, admin costs, an authorization matrix, BYOK, budget caps, an 800-page PDF and OCR |
| `npm run test:ui` | A real Chromium through the UI: register, upload, chat with citations, flashcards, quiz, review, dashboard, profile, mobile drawer, modal accessibility, admin |
| `npm run test:full` | All three |

Both exit non-zero on any failed check. Artifacts (screenshots, JSON results)
go to `live/out/` (gitignored). Uploads use a throwaway `UPLOAD_DIR`, and the
runners start and stop their own backend, Vite server and Mongo.

What this does *not* prove: answer quality. The fake model proves the plumbing
(the right chunks retrieved, cited, cached, billed), not that a real model
answers well. That needs a gold-question eval against a real provider.
