# Multi-stage: a "deps" stage installs only production dependencies (no
# devDependencies — vitest, nodemon, supertest never ship), then the final
# image copies those plus the source straight in. No build step: this is
# plain ESM Node, nothing to compile (that changes once Phase 24's
# TypeScript migration lands).

FROM node:22-alpine AS deps
WORKDIR /app
# argon2 has no prebuilt musl binary for this version, so node-gyp compiles
# it from source on install — python3/make/g++ are build-time only and never
# reach the runner stage.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Non-root: a compromised process inside the container still can't write
# outside its own upload directory or modify the app's own source.
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads && chown -R app:app /app

USER app
EXPOSE 8000

# GET /health is liveness-only (no DB check) — see app.js and the README's
# note on /health vs /ready. wget's --spider does a HEAD-only request, no
# body downloaded, so this stays cheap on every interval.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-8000}/health" || exit 1

CMD ["node", "server.js"]
