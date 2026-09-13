# Multi-stage: build the static bundle with Node, then serve it from a
# separate, much smaller nginx image — the final image never contains
# Node, npm, or node_modules at all.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# VITE_API_BASE_URL is compiled into the JS bundle at build time (it's read
# via import.meta.env, not process.env at runtime) — it has to be supplied
# as a build arg, not a docker-compose `environment:` entry, or the built
# bundle will silently point nowhere.
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# nginx-unprivileged: the same nginx image, pre-configured to run as a
# non-root user and listen on 8080 instead of 80 — no extra setup needed for
# the "non-root" half of a production container image.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
