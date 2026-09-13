# AI-Powered Learning Assistant

Upload a PDF and read it in the app. Turn it into AI chat, summaries, concept
explanations, flashcards and quizzes. Track your progress as you go. This is
a MERN stack app (MongoDB, Express, React, Node) with an LLM layer for the AI
features.

**[Live demo](https://ai-learning-assistant-alpha-wine.vercel.app)**. The
frontend runs on Vercel. The API runs on Render's free tier, which spins
down after a while with no traffic. The first request can take 30 to 50
seconds to wake it back up. After that it's fast.

![Dashboard](docs/screenshots/dashboard.png)

## Features

- **Auth**: Register and log in with JWT. Routes are protected, and you can
  change your password. Password reset and email verification use
  single-use tokens that expire. Token refresh is protected with CSRF and
  rotates on every use, with reuse detection. The Profile page lists your
  active sessions so you can sign other devices out.
- **Bring your own OpenAI key**: Save your own key on the Profile page. It
  gets verified against OpenAI and encrypted at rest, and your AI usage then
  bills to you instead of the deployer. The deployer's own key, if they set
  one, only acts as a capped fallback for users without a key of their own.
  See [Deployment](#deployment) below.
- **Documents**: Drag and drop a PDF to upload it (10MB limit). Text gets
  extracted automatically, with OCR as a fallback for scanned or
  image-only PDFs. View the PDF right in the app.
- **AI Chat**: Ask questions about a document and get markdown replies with
  code highlighting.
- **AI Actions**: Generate a summary in one click, or ask for a concept
  explanation on demand.
- **Flashcards**: AI generates flashcard sets. Flip through them with a card
  viewer and the keyboard. Each card tracks its own review progress.
- **Quizzes**: AI generates multiple-choice quizzes. Grading happens on the
  server, and you get a detailed results page.
- **Dashboard**: See your document, flashcard and quiz counts, plus recent
  activity.

## Tech stack

**Frontend:** React 19, Vite, React Router v7, Tailwind CSS v4, axios,
lucide-react, react-hot-toast, moment, react-markdown + remark-gfm +
react-syntax-highlighter.

**Backend:** Node.js, Express 5, MongoDB with Mongoose, JWT auth, argon2id
password hashing (bcryptjs is only kept to verify pre-migration hashes).
Also multer for uploads, pdf-parse for text extraction, tesseract.js for OCR
on scanned PDFs, the OpenAI API for AI generation, and helmet, compression
and express-rate-limit for hardening.

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
├── controllers/      auth, document, ai, flashcard, quiz, dashboard, admin, review, mastery
├── middlewares/      auth, upload, error, rate limiter, CSRF, AI key context
├── models/           User, Document, Flashcard, Quiz, QuizAttempt, ChatHistory,
│                     ReviewLog, Mastery, LlmCall, RefreshToken, and the token/cache models
├── routes/           one router per resource, mounted under /api/*
├── utils/            generateToken, aiClient, prompts, getOwnedDocument, fsrs, sm2, bkt
├── uploads/           (gitignored) stored PDFs
└── server.js

frontend/ai-learning-assistant/src/
├── components/       layout/, documents/, flashcards/, quizzes/, dashboard/, profile/, ui/, auth/
├── context/          AuthContext.jsx
├── hooks/            useAuth.js
├── pages/            Auth/, Dashboard/, Documents/, Flashcards/, Quizzes/, Review/, Profile/, Admin/
├── services/         one module per API resource
├── utils/            axiosInstance, apiPaths, constants, helpers
└── App.jsx
```

## Setup

### Prerequisites

- Node.js 22.12+
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

Check `backend/.env.example` for the optional variables and their defaults.
That covers access and refresh token lifetimes, account lockout thresholds,
the AI budget cap, `ENCRYPTION_KEY` for saved user API keys, and
`COOKIE_SAME_SITE` for cross-domain deploys.

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

Then open `http://localhost:5173`. Register an account and upload a PDF.

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

Flashcard review used to be a simple "reviewed" flag. Now it uses real
scheduling. Grade a card Again, Hard, Good or Easy (keys `1` to `4`) and
[`backend/utils/fsrs.js`](backend/utils/fsrs.js) works out its next due date
from a stability and difficulty model, not a fixed multiplier. Every grade
also gets written to an immutable `ReviewLog`
([`backend/models/ReviewLog.js`](backend/models/ReviewLog.js)).
[`backend/utils/sm2.js`](backend/utils/sm2.js) implements the older SM-2
algorithm too. It's the documented baseline that the comparison below
measures FSRS against. `GET /api/review/due` is the unified due queue. It
pulls everything due today across every document into one interleaved
session at `/review`.

**[docs/scheduler-comparison.md](docs/scheduler-comparison.md)** has the
numbers from a synthetic-learner simulation. The app has no real review
history to replay yet, so read the file for what the simulation does and
doesn't prove. Regenerate it with `npm run compare-schedulers`.

## Deployment

### Paying for AI usage without exposing your own key to strangers

If you deploy this with your own `OPENAI_API_KEY` set, every request against
it gets billed to you. This app's answer is **bring-your-own-key**. Each
user can save their own OpenAI key on the Profile page. It gets verified
live against OpenAI and encrypted at rest (AES-256-GCM, see
[`backend/utils/encryption.js`](backend/utils/encryption.js)). That key is
then used for every AI call the user makes: chat, summaries, flashcards,
quizzes, and the embeddings generated when they upload a document. The key
is never shown again after saving. The Profile page only shows it masked,
as "ending in ...ABCD".

The deployer's own `OPENAI_API_KEY`, if set, is only ever a **fallback** for
a user who hasn't saved their own key. Only that fallback path is subject
to `MONTHLY_AI_BUDGET_USD` and shows up on the `/admin/costs` dashboard. A
user's own key is their own money. It's uncapped and never logged. This
gives you three deployment shapes, depending on what you set:

| `OPENAI_API_KEY` set? | `MONTHLY_AI_BUDGET_USD` set? | Result |
|---|---|---|
| No | - | BYOK-only. Nobody's usage ever costs you anything; AI features stay off for a user until they add their own key. |
| Yes | No | Anyone can use AI features funded by your key, **uncapped**. Only reasonable for a private/invite-only deploy. |
| Yes | Yes | Free tier funded by your key up to the per-user monthly cap, then AI features 429 until the user adds their own key (or the month resets). |

Whichever shape you pick, also set a **hard spend limit in your OpenAI
dashboard** (platform.openai.com, under Settings then Limits) as a backstop.
`MONTHLY_AI_BUDGET_USD` only throttles calls this app makes. It can't
protect you against a bug, or a key that leaks some other way.

### The cross-domain cookie gotcha

The refresh token and CSRF token live in httpOnly cookies scoped to
`/api/auth`. Problems show up if your frontend and backend end up on
genuinely different registrable domains. That's the common free-tier setup:
a Vercel frontend plus a Render, Railway or Fly backend on its own
`*.vercel.app` or `*.onrender.com` domain. The default `SameSite=Lax` means
browsers silently drop those cookies on cross-site requests. Users then get
logged out the moment their 15-minute access token expires. Fix it with one
env var:

```
COOKIE_SAME_SITE=none
```

This needs HTTPS, which every mainstream host gives you by default. If you
instead put the frontend and backend on subdomains of the same registrable
domain, like `app.example.com` and `api.example.com`, the default `lax` is
fine as is. That still counts as "same-site" as far as cookies are
concerned.

### One-click API deploy on Render

[`render.yaml`](render.yaml) is a [Render Blueprint](https://render.com/docs/blueprint-spec).
Connect this repo from the Render dashboard through **New +** then
**Blueprint**, and it provisions the API as a Docker web service built from
[`backend/Dockerfile`](backend/Dockerfile). It comes with
`NODE_ENV=production`, `COOKIE_SAME_SITE=none` and `OPENAI_MODEL=gpt-4o-mini`
preset, and `GET /health` wired up as the health check. Anything secret or
deployment-specific is marked `sync: false`: `MONGO_URI`, `JWT_SECRET`,
`ENCRYPTION_KEY`, `CLIENT_URL`, `OPENAI_API_KEY`, `MONTHLY_AI_BUDGET_USD` and
`ADMIN_EMAILS`. Render prompts you for each one once in its dashboard
instead of storing it in the file or in git history. The blueprint only
provisions the API. Build and host the frontend separately, on Vercel or
Netlify for example, or with `docker-compose.yml` below, and point
`CLIENT_URL` and `VITE_API_BASE_URL` at each other.

### Everything else

- Set `NODE_ENV=production`. It turns on `trust proxy` (needed for accurate
  rate limiting and lockout behind any platform's reverse proxy), `Secure`
  cookies, and CORS restricted to `CLIENT_URL`.
- Set `ENCRYPTION_KEY` explicitly (see `backend/.env.example`) rather than
  relying on the `JWT_SECRET`-derived dev fallback.
- Uploaded PDFs are still stored on local disk (`backend/uploads/`). Most
  PaaS hosts wipe that on every redeploy. The app handles this gracefully: a
  document whose file was wiped shows a clear banner instead of a broken
  viewer, and chat, flashcards and quizzes keep working since the extracted
  text lives in MongoDB, not on disk. The PDF itself is gone until you
  re-upload it. Swap in S3 or R2 for real persistence if that matters for
  your deploy.
- `docker-compose.yml` runs the whole stack (Mongo, the API, and the built
  frontend behind nginx) in one command for a self-hosted deploy. See the
  file for which env vars it forwards.

## Notes

- AI routes are rate limited to 30 requests per 15 minutes per user. They
  also block documents with no extractable text at all. A scanned or
  image-only PDF falls back to OCR at upload time (`OCR_MAX_PAGES`, default
  25 pages, since OCR is synchronous and runs during the upload request). So
  AI features only get blocked if OCR itself finds nothing to read.
- Every AI call is logged with its token usage and an estimated cost. Spend
  against the deployer's own shared `OPENAI_API_KEY` can be capped per user
  per month with `MONTHLY_AI_BUDGET_USD` (leave it unset for no cap). This
  never applies to a user's own saved key. See Deployment.
- Quiz answer keys are never sent to the client until a quiz is submitted.
  Grading happens on the server.
- Login, register and refresh are rate limited to 20 requests per 15 minutes
  per IP. An account locks itself out for 15 minutes after 5 consecutive
  wrong passwords. Together these blunt both email enumeration and
  credential stuffing. A locked-out login and a login for an email that
  doesn't exist return the identical "Invalid email or password" response,
  so neither one leaks which emails are registered.
- Auth uses a short-lived access token (15 minutes), returned in the
  response body, plus a 7-day refresh token in an httpOnly cookie. `POST
  /api/auth/refresh` rotates both and checks a server-side record
  ([`models/RefreshToken.js`](backend/models/RefreshToken.js)) for reuse.
  Replaying a token that already got rotated away revokes every token
  descended from that login, not just the one that got reused. Logout
  revokes it too, not just the browser cookie. A stolen access token is only
  useful for a few minutes. The refresh token never touches
  JavaScript-readable storage.
- Uploaded files are stored on local disk under `backend/uploads/`. For a
  production deploy with an ephemeral filesystem, swap in S3 or Cloudinary.
  Until then, a document whose file was wiped by a redeploy shows a "file no
  longer available" banner instead of a broken viewer. Chat, flashcards and
  quizzes still work since the extracted text is stored in MongoDB, not on
  disk.
- `GET /health` is a liveness check. `GET /ready` also verifies MongoDB is
  connected. Point an orchestrator's readiness probe at `/ready`.
- Set `ADMIN_EMAILS` (comma-separated) to unlock a read-only cost dashboard
  at `/admin/costs`. It shows spend and token usage per user per day, from
  the `LlmCall` ledger. Access is an allowlist check on every request, not a
  stored role, so granting or revoking it is just an env var change.
- CI runs backend and frontend tests, `npm audit --audit-level=high` on
  both, CodeQL static analysis, and the Playwright E2E suite against a real
  backend with an ephemeral in-memory MongoDB. See
  [.github/workflows/ci.yml](.github/workflows/ci.yml).
