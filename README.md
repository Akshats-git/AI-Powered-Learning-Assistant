# AI-Powered Learning Assistant

Upload a PDF and read it in the app. Turn it into AI chat, summaries, concept
explanations, flashcards and quizzes. Track your progress as you go. This is
a MERN stack app (MongoDB, Express, React, Node) with an LLM layer for the AI
features.

![Dashboard](docs/screenshots/dashboard.png)

## Features

- **Auth**: JWT based register and login, protected routes, password change, email-based password reset and email verification with single-use expiring tokens
- **Documents**: drag and drop PDF upload (10MB limit), text extraction, in-app viewer
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
multer (uploads), pdf-parse (text extraction), the OpenAI API for AI
generation, helmet + compression + express-rate-limit for hardening.

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
OPENAI_API_KEY=<your OpenAI API key>
OPENAI_MODEL=gpt-4o-mini
CLIENT_URL=http://localhost:5173
```

See `backend/.env.example` for the optional variables (access/refresh token
lifetimes, account lockout thresholds, AI budget cap) and their defaults.

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

## Notes

- AI routes are rate limited to 30 requests per 15 minutes per user. They
  also block documents with no extractable text, such as scanned PDFs.
- Every AI call is logged with its token usage and an estimated cost, and can
  be capped per user per month with `MONTHLY_AI_BUDGET_USD` (unset = no cap).
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
