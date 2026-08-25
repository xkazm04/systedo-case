# Adamant — self-hosting image (docs/open-source/self-hosting.md §5).
#
#   docker compose up -d --build          # app (+ optional cron sidecar), http://localhost:3000
#   docker build -t adamant . && docker run -p 3000:3000 -e AUTH_SECRET=... adamant
#
# Three stages so the runtime image carries neither the toolchain nor the dev
# dependencies. The build sets ADAMANT_DOCKER_BUILD=1, which is the ONLY thing
# that flips next.config.ts to `output: "standalone"` — Vercel does its own
# tracing, so that mode is a container concern and must not change how cloud
# deploys are packaged.
#
# The image needs no secrets to build: with nothing configured every AI
# operation degrades to its deterministic demo result (a product property, not
# a dev convenience). The operator supplies configuration at run time via env.
#
# NODE 24, not the older LTS: node:sqlite needs >= 22.5 and package-lock.json is
# a v3 lockfile written by npm 11 — the image must match the toolchain the
# lockfile was generated with, so bumping this base is a real decision: change
# it and re-verify `npm ci`.

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the only lifecycle script is `prepare: husky`, which fails
# without a .git directory and has no business inside an image.
RUN npm ci --ignore-scripts

# ── build ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV ADAMANT_DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# This image IS a self-hosted deployment (docs/open-source/self-hosting.md §1):
# explicit SELF_HOSTED mode with the node:sqlite store as the production data
# layer. SELF_HOSTED never implies DEV_AUTH — sign-in is the operator-password
# Credentials flow, and production refuses to boot without
# ADAMANT_OPERATOR_PASSWORD unless ALLOW_OPEN=1 is set deliberately.
ENV SELF_HOSTED=true
ENV LOCAL_DB=true
# ABSOLUTE path on the mounted volume — the cwd-relative default is the classic
# self-host footgun (a different working directory silently opens a different,
# empty database).
ENV SYSTEDO_DB_FILE=/app/.data/systedo.db

# /app/.data is the one writable path (the sqlite file + WAL sidecar); mount a
# volume here. Created before dropping root so the `node` user owns it.
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node

# The standalone bundle carries its own minimal node_modules; `static` and
# `public` are served from disk and are NOT included in it, so both are copied
# explicitly.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

EXPOSE 3000
VOLUME ["/app/.data"]

# `/` is the public marketing page and serves credential-less; /api/health is
# CRON_SECRET-gated (fails closed), so it cannot be the container health probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
