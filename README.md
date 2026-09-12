# AI-Powered Learning Assistant

Upload a PDF and read it in the app. Turn it into AI chat, summaries, concept
explanations, flashcards and quizzes. Track your progress as you go. This is
a MERN stack app (MongoDB, Express, React, Node) with an LLM layer for the AI
features.

![Dashboard](docs/screenshots/dashboard.png)

## Features

- **Auth**: JWT based register and login, protected routes, password change, email-based password reset and email verification with single-use expiring tokens, CSRF-protected token refresh with rotation and reuse detection, an active-sessions list on the Profile page for signing out other devices
- **Bring-your-own OpenAI key**: a user can save their own key on the Profile page (verified against OpenAI and encrypted at rest) so their AI usage is billed to them, not the deployer; the deployer's own key, if set, is just a capped fallback for users without one — see [Deployment](#deployment) below
- **Documents**: drag and drop PDF upload (10MB limit), text extraction with an OCR fallback for scanned/image-only PDFs, in-app viewer
- **AI Chat**: ask questions about a document and get markdown replies with code highlighting
- **AI Actions**: one-click summaries and on-demand concept explanations
- **Flashcards**: AI-generated sets with a flip-card viewer, keyboard navigation, per-card review tracking and progress bars
- **Quizzes**: AI-generated multiple-choice quizzes with server-side grading and detailed results
- **Dashboard**: document, flashcard and quiz counts plus recent activity

## Tech stack

**Frontend:** React 19, Vite, React Router v7, Tailwind CSS v4, axios,
lucide-react, react-hot-toast, moment, react-markdown + remark-gfm +
react-syntax-highlighter.

**Backend:** Node.js, Express 5, MongoDB + Mongoose, JWT auth, argon2id
password hashing (bcryptjs kept only to verify pre-migration hashes),
multer (uploads), pdf-parse (text extraction), tesseract.js (OCR fallback
for scanned PDFs), the OpenAI API for AI generation, helmet + compression +
express-rate-limit for hardening.

> The original plan targeted Google Gemini. This build uses the OpenAI API
> instead. The AI layer (`backend/utils/aiClient.js`) is a single thin
> wrapper. Swapping providers again only means changing that one file.

## Screenshots

| | |
|---|---|
| ![Login](docs/screenshots/login.png) | ![Documents](docs/screenshots/documents.png) |
| ![Document chat/content](docs/screenshots/document-content-tab.png) | ![AI Actions](docs/screenshots/document-ai-actions-tab.png) |
| ![Flashcard viewer](docs/screenshots/flashcard-viewer-flipped.png) | ![Quiz](docs/screenshots/quiz-take.png) |

## Project structure

```
backend/
├── config/           db.js
├── controllers/      auth, document, ai, flashcard, quiz, dashboard, admin
├── middlewares/      auth, upload, error, rate limiter
├── models/           User, Document, Flashcard, Quiz, ChatHistory
├── routes/           one router per resource, mounted under /api/*
├── utils/            generateToken, aiClient, prompts, getOwnedDocument
├── uploads/           (gitignored) stored PDFs
└── server.js

frontend/ai-learning-assistant/src/
├── components/       layout/, documents/, flashcards/, ui/, auth/
├── context/          AuthContext.jsx
├── hooks/            useAuth.js
├── pages/            Auth/, Dashboard/, Documents/, Flashcards/, Quizzes/, Profile/
├── services/         one module per API resource
├── utils/            axiosInstance, apiPaths, constants, helpers
└── App.jsx
```

## Setup

### Prerequisites

- Node.js 20+
- A MongoDB instance (local or [Atlas](https://www.mongodb.com/atlas))
- An [OpenAI API key](https://platform.openai.com/api-keys) (for the AI features)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in the values below
npm run dev             # http://localhost:8000
```

`backend/.env`:

```
PORT=8000
MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<long random string>
CLIENT_URL=http://localhost:5173

# Optional in dev: without it, AI features only work for a user who's saved
# their own key on the Profile page. With it, it's used as a fallback for
# everyone else (see "Deployment" below for why that matters in production).
OPENAI_API_KEY=<your OpenAI API key>
OPENAI_MODEL=gpt-4o-mini
```

See `backend/.env.example` for the optional variables (access/refresh token
lifetimes, account lockout thresholds, AI budget cap, `ENCRYPTION_KEY` for
saved user API keys, `COOKIE_SAME_SITE` for cross-domain deploys) and their
defaults.

### Frontend

```bash
cd frontend/ai-learning-assistant
npm install
cp .env.example .env   # fill in the value below
npm run dev             # http://localhost:5173
```

`frontend/ai-learning-assistant/.env`:

```
VITE_API_BASE_URL=http://localhost:8000
```

Then open `http://localhost:5173`, register an account, and upload a PDF.

## Scripts

| Location | Script | Purpose |
|---|---|---|
| `backend/` | `npm run dev` | Start the API with nodemon (auto-restart) |
| `backend/` | `npm start` | Start the API with plain node |
| `frontend/ai-learning-assistant/` | `npm run dev` | Start the Vite dev server |
| `frontend/ai-learning-assistant/` | `npm run build` | Production build to `dist/` |
| `frontend/ai-learning-assistant/` | `npm run lint` | Run ESLint |
| `backend/` | `npm run compare-schedulers` | Regenerate `docs/scheduler-comparison.md` (SM-2 vs. FSRS) |

## Spaced repetition: SM-2 vs. FSRS

Flashcard review replaced a binary "reviewed" flag with real scheduling:
grade a card Again/Hard/Good/Easy (`1`-`4` on the keyboard) and
[`backend/utils/fsrs.js`](backend/utils/fsrs.js) computes its next due date
from an explicit stability/difficulty model, not a fixed multiplier. Every
grade is also written to an immutable `ReviewLog`
([`backend/models/ReviewLog.js`](backend/models/ReviewLog.js)).
[`backend/utils/sm2.js`](backend/utils/sm2.js) implements the older SM-2
algorithm alongside it as the documented baseline the comparison below
measures FSRS against. `GET /api/review/due` is the unified due queue —
everything due today across every document, interleaved — with a session UI
at `/review`.

**[docs/scheduler-comparison.md](docs/scheduler-comparison.md)** has the
actual numbers from a synthetic-learner simulation (this app has no real
review history yet to replay — see the file for exactly what the simulation
does and doesn't prove). Regenerate it with `npm run compare-schedulers`.

## Deployment

### Paying for AI usage without exposing your own key to strangers

Deploying this with your own `OPENAI_API_KEY` set means every request against
it is billed to you. This app's answer is **bring-your-own-key**: each user
can save their own OpenAI key on the Profile page — it's verified live
against OpenAI, encrypted at rest (AES-256-GCM, see
[`backend/utils/encryption.js`](backend/utils/encryption.js)), and used for
every AI call that user makes (chat, summaries, flashcards, quizzes, and the
embeddings generated when they upload a document). It's never displayed
again after saving, only shown masked as "ending in ...ABCD".

The deployer's own `OPENAI_API_KEY` (if set) is only ever a **fallback** for
a user who hasn't saved their own — and only that fallback path is subject to
`MONTHLY_AI_BUDGET_USD` and shows up on the `/admin/costs` dashboard; a
user's own key is their own money, uncapped and unlogged. This gives you
three deployment shapes, chosen by what you set:

| `OPENAI_API_KEY` set? | `MONTHLY_AI_BUDGET_USD` set? | Result |
|---|---|---|
| No | — | BYOK-only. Nobody's usage ever costs you anything; AI features stay off for a user until they add their own key. |
| Yes | No | Anyone can use AI features funded by your key, **uncapped**. Only reasonable for a private/invite-only deploy. |
| Yes | Yes | Free tier funded by your key up to the per-user monthly cap, then AI features 429 until the user adds their own key (or the month resets). |

Whichever shape you pick, also set a **hard spend limit in your OpenAI
dashboard** (platform.openai.com → Settings → Limits) as a backstop —
`MONTHLY_AI_BUDGET_USD` only throttles calls this app makes; it can't protect
against a bug or a key leaked some other way.

### The cross-domain cookie gotcha

The refresh token and CSRF token live in httpOnly cookies scoped to
`/api/auth`. If your frontend and backend end up on genuinely different
registrable domains — the common free-tier shape of a Vercel frontend plus a
Render/Railway/Fly backend on their own `*.vercel.app` / `*.onrender.com`
domains — the default `SameSite=Lax` means browsers silently drop those
cookies on cross-site requests, and users get logged out the moment their
15-minute access token expires. Fix it with one env var:

```
COOKIE_SAME_SITE=none
```

(requires HTTPS, which every mainstream host gives you by default). If
instead you put the frontend and backend on subdomains of the same
registrable domain (e.g. `app.example.com` + `api.example.com`), the default
`lax` is fine as-is — that's still "same-site" as far as cookies are
concerned.

### Everything else

- Set `NODE_ENV=production` — it turns on `trust proxy` (needed for accurate
  rate limiting/lockout behind any platform's reverse proxy), `Secure`
  cookies, and CORS restricted to `CLIENT_URL`.
- Set `ENCRYPTION_KEY` explicitly (see `backend/.env.example`) rather than
  relying on the `JWT_SECRET`-derived dev fallback.
- Uploaded PDFs are still stored on local disk
  (`backend/uploads/`) — most PaaS hosts wipe that on every redeploy. The app
  degrades gracefully (a document whose file was wiped shows a clear banner
  instead of a broken viewer; chat/flashcards/quiz keep working since the
  extracted text lives in MongoDB, not on disk) but the PDF itself is gone
  until re-uploaded. Swap in S3/R2 for real persistence if that matters for
  your deploy.
- `docker-compose.yml` runs the whole stack (Mongo, API, and the built
  frontend behind nginx) in one command for a self-hosted deploy — see the
  file for which env vars it forwards.

## Notes

- AI routes are rate limited to 30 requests per 15 minutes per user. They
  also block documents with no extractable text at all — a scanned/image-only
  PDF now falls back to OCR at upload time (`OCR_MAX_PAGES`, default 25 pages,
  since OCR is synchronous and runs during the upload request), so it only
  blocks AI features if OCR itself finds nothing to read.
- Every AI call is logged with its token usage and an estimated cost. Spend
  against the deployer's own shared `OPENAI_API_KEY` (never a user's own saved
  key — see Deployment) can be capped per user per month with
  `MONTHLY_AI_BUDGET_USD` (unset = no cap).
- Quiz answer keys are never sent to the client until a quiz is submitted.
  Grading happens on the server.
- Login/register/refresh are rate limited to 20 requests per 15 minutes per
  IP, and an account locks itself out for 15 minutes after 5 consecutive
  wrong passwords — both blunt email enumeration and credential stuffing.
  Locked-out and nonexistent-user logins return the identical "Invalid email
  or password" response so neither leaks which emails are registered.
- Auth uses a short-lived (15 min) access token returned in the response body
  plus a 7-day refresh token in an httpOnly cookie; `POST /api/auth/refresh`
  rotates both and checks a server-side record
  ([`models/RefreshToken.js`](backend/models/RefreshToken.js)) for reuse —
  replaying an already-rotated-away token revokes every token descended from
  that login, not just the one that got reused. Logout revokes it too, not
  just the browser cookie. A stolen access token is only useful for minutes;
  the refresh token never touches JavaScript-readable storage.
- Uploaded files are stored on local disk under `backend/uploads/`. For a
  production deploy with an ephemeral filesystem, swap in S3 or Cloudinary —
  until then, a document whose file was wiped by a redeploy shows a "file no
  longer available" banner instead of a broken viewer (chat/flashcards/quiz
  still work since the extracted text is stored in MongoDB, not on disk).
- `GET /health` is a liveness check; `GET /ready` also verifies MongoDB is
  connected — point an orchestrator's readiness probe at the latter.
- Set `ADMIN_EMAILS` (comma-separated) to unlock a read-only cost dashboard at
  `/admin/costs` — spend and token usage per user per day, from the `LlmCall`
  ledger. It's an allowlist check on every request, not a stored role, so
  granting/revoking access is just an env var change.
- CI runs backend/frontend tests, `npm audit --audit-level=high` on both,
  CodeQL static analysis, and the Playwright E2E suite against a real
  backend + ephemeral in-memory MongoDB — see
  [.github/workflows/ci.yml](.github/workflows/ci.yml).
