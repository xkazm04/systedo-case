# ADR-0005 — Node 24 Alpine base, and standalone output only under a build flag

## Status

Accepted (2026-08, with the self-host packaging)

## Context

Packaging the app as a container introduces two decisions that look like
boilerplate and are not.

**The base image.** The habit is "pin the current LTS". That is wrong here: the
local store is Node's built-in `node:sqlite` (ADR-0008), which needs Node
≥ 22.5, and `package-lock.json` is a v3 lockfile written by npm 11. An image on
an older LTS either loses the store or resolves a different dependency tree than
the one CI proved.

**The Next.js output mode.** `output: "standalone"` is what makes a small
runtime image possible. It is also a change to how the app is *packaged*, and
the hosted deployment is on Vercel, which does its own tracing. Setting it
unconditionally in `next.config.ts` would change cloud deploys to satisfy a
container concern.

## Decision

- Base is `node:24-alpine` in all three `Dockerfile` stages, and bumping it is
  treated as a real decision: change it and re-verify `npm ci` against the
  lockfile.
- `ADAMANT_DOCKER_BUILD=1` is the **only** thing that flips `next.config.ts` to
  `output: "standalone"`. The build stage sets it; nothing else does.
- Three stages (deps → build → runtime) so the runtime image carries neither the
  toolchain nor the dev dependencies. `npm ci --ignore-scripts`, because the only
  lifecycle script is `prepare: husky`, which fails without a `.git` directory
  and has no business inside an image.
- The runtime stage runs as the `node` user with exactly one writable path,
  `/app/.data`, and `SYSTEDO_DB_FILE` is set to an **absolute** path on it — the
  cwd-relative default is the classic self-host footgun, where a different
  working directory silently opens a different, empty database.
- The healthcheck probes `/`, not `/api/health`: the health endpoint is
  `CRON_SECRET`-gated and fails closed, so it would report an unconfigured
  install as unhealthy forever.

## Consequences

- The image builds with **no secrets**. With nothing configured every AI
  operation degrades to its deterministic demo result, which is a product
  property (ADR-0003) rather than a build convenience.
- Vercel packaging is untouched by anything in `Dockerfile` or
  `docker-compose.yml`.
- The standalone bundle carries its own minimal `node_modules` but *not*
  `.next/static` or `public`, so both are copied explicitly. A missing copy here
  fails as a styleless page, not as a build error.
- `scripts/cron-runner.mjs` and `vercel.json` ride along in the image so the
  cron sidecar runs from the same image and reads the same schedule source the
  cloud deploy uses — one schedule, two hosts.
