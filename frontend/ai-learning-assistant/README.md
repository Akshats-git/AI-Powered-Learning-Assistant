# StudyAI frontend

React 19 + Vite + Tailwind CSS v4. Setup, scripts and deployment live in the
[root README](../../README.md).

```bash
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:8000
npm run dev            # http://localhost:5173
npm test               # Vitest + Testing Library
npm run lint
npm run build          # production bundle in dist/ (injects a strict CSP <meta>)
```

Deploying: `vercel.json` (SPA rewrite + security headers) for Vercel, or the
`Dockerfile` + `nginx.conf` for self-hosting.
