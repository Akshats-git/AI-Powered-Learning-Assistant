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

Not wired into the main CI workflow yet — it needs Playwright's browser
binary downloaded first, which is a heavier step than the rest of CI. Run it
locally before a release, or add a dedicated CI job for it later.
