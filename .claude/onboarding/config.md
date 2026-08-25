---
app: "Adamant"
env_file: .env.local
env_example: .env.example
boot: "npm run dev:local"
boot_success: "GET /app -> 2xx (DEV_AUTH signs in the synthetic dev user; no redirect to a login page)"
docs: "CONTRIBUTING.md (Development setup) and docs/open-source/self-hosting.md"
---

# Adamant — onboarding overlay

Adamant's defining install property: **almost nothing is required**. The public
site runs with an empty env file, and every AI operation falls back to a
deterministic demo result when no provider is configured — degrading without
keys is a product property, not an oversight (`.env.example` header,
CONTRIBUTING.md). The default developer path is the fully-offline
`npm run dev:local`; treat cloud credentials as opt-in upgrades, never as
prerequisites.

`npm run doctor` is this repo's own preflight and prints the same
surface × status table this overlay's groups are built from
(`scripts/doctor.mjs` + `scripts/doctor-rules.mjs`). Offer it early, read its
table, and never contradict it — where this overlay and doctor disagree, doctor
(the code) wins.

## Install modes

| mode | consequences |
| --- | --- |
| Developer laptop (just me) — **default** | `npm run seed:local` once, then boot with `npm run dev:local` (= `DEV_AUTH=true LOCAL_DB=true next dev`). Fully offline authed `/app`: no Google OAuth, no Firestore, no API key. No variables required at all. Docs: CONTRIBUTING.md §Development setup. |
| Cloud-connected dev (real auth + Firestore) | Boot with `npm run dev`. Requires `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CLOUD_PROJECT` plus a Firebase service-account credential (`.data/firebase-sa.json` locally, or `FIREBASE_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`). The walkthrough is `SETUP.md` — warn that it is **stale and cloud-only**: it narrates the maintainer's own GCP project (`imshr`) and predates the offline path. CONTRIBUTING.md: "you almost certainly do not want it". |
| Just evaluating | Same as developer laptop: `npm run seed:local && npm run dev:local`, skip every key group. The seeded sample projects (`/app/demo-eshop`) plus demo-mode AI make the zero-key app worth looking at. Print the matrix so they know what keys would unlock. |

**Not offerable yet: self-host production.** `DEV_AUTH` and `LOCAL_DB` are
ignored when `NODE_ENV=production`, so a production deployment today
hard-requires Firestore + Google sign-in (section 1 of `.env.example`). Say so
honestly if asked; `docs/open-source/self-hosting.md` tracks the gap. Do not
present a "self-host for a team" option as if the offline store covered it.

## Runtime prerequisites

| tool | min version | probe command | required or optional | fix hint |
| --- | --- | --- | --- | --- |
| Node.js | >= 22.5 | `node --version` | required | `package.json` engines; the local store and rate limiter use built-in `node:sqlite` (src/lib/db.ts) — below 22.5 the offline path cannot work at all |
| git | any | `git --version` | required | standard install |
| npm dependencies | — | `node_modules` present | required | `npm install` |
| Claude Code CLI | any | `claude --version` | conditional: llm-engine | the dev-default LLM provider (subscription, no key). Absent is NOT a failure: dev AI tools run in demo mode instead — exactly what doctor reports |

## Capability groups

### llm-engine

- **unlocks**: real model output from every AI tool (all text calls go through
  the one chokepoint `generateStructured()` in `src/lib/llm/index.ts`).
  Provider order is environment-switched (`src/lib/llm/provider-order.ts`):
  dev tries claude → gemini, prod tries gemini → claude; a resolved BYOM user
  key goes first.
- **keys**:
  - dev default: none — the Claude Code CLI on subscription (just installed
    and logged in; `CLAUDE_CLI_PIN` optionally pins its model, e.g. while
    benchmarking).
  - prod path: `GEMINI_API_KEY` (free tier at https://aistudio.google.com/apikey);
    `GEMINI_MODEL` optional (default in `src/lib/llm/models.ts`; an unknown
    name reports zero cost in `src/lib/llm/cost.ts`).
  - BYOM (6 vendors in `src/lib/llm/byom/adapters.ts`: openai, anthropic,
    gemini, openrouter, qwen, ollama): users normally paste keys **in the app**
    (encrypted at rest); process-level `OPENROUTER_API_KEY` / `QWEN_API_KEY`
    exist for benchmarks and operator defaults. Base-URL overrides:
    `OLLAMA_BASE_URL` (default `http://localhost:11434/v1`),
    `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, `GEMINI_BASE_URL`,
    `QWEN_BASE_URL`, `OPENROUTER_BASE_URL`. `BYOM_MATRIX=true` enables the
    per-operation provider matrix outside production.
- **options**:
  - Claude CLI (dev) — GET: real models on subscription, zero keys; LIMITED:
    dev only, prod still needs Gemini.
  - `GEMINI_API_KEY` — GET: the production provider, also shared with Creative
    Studio vision/embeddings; COSTS: a Google AI Studio account (free tier).
  - Local server via `OLLAMA_BASE_URL` / `OPENAI_BASE_URL` — GET: free, keyless,
    fully local models; COSTS: running Ollama / LM Studio / llama.cpp / vLLM /
    LiteLLM yourself.
  - none / later — GET: everything still works in demo mode.
- **verify**: `npm run doctor` rows "AI nástroje — dev (Claude CLI)" and
  "AI nástroje — produkce (Gemini)"; for a local server,
  `curl <OLLAMA_BASE_URL>/models` (read-only).
- **without**: `fallback: deterministic demo result for every AI operation — a
  product property, not a dev convenience. Every generator carries a mandatory
  demo() fallback (GenerateArgs), and CONTRIBUTING.md rejects patches that make
  a provider mandatory. Doctor state: demo.`

### auth-datastore

- **unlocks**: the authed `/app` workspace — sign-in (Auth.js v5, Google) and
  the per-project data store. Dual-store seam: prod = Firestore, local dev =
  `node:sqlite` under `.data/` behind the same store interfaces.
- **keys**: dev — `DEV_AUTH=true` + `LOCAL_DB=true` (set by `npm run dev:local`
  itself; optional `DEV_AUTH_USER_ID/NAME/EMAIL`, `SYSTEDO_DB_FILE`). Cloud —
  `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_CLOUD_PROJECT`, and one Firebase credential
  (`.data/firebase-sa.json` file, `FIREBASE_SERVICE_ACCOUNT` JSON,
  `GOOGLE_APPLICATION_CREDENTIALS` path, or `FIREBASE_ALLOW_ADC=true` on ADC
  platforms).
- **options**:
  - offline (default) — GET: fully offline authed `/app` with zero
    credentials; LIMITED: a synthetic dev user, local data only, dev-mode only.
  - Google OAuth + Firestore — GET: real multi-user sign-in and cloud data;
    COSTS: an OAuth client + GCP project + service-account key (stale
    walkthrough in SETUP.md). Partial configuration is worse than none:
    doctor flags "some of AUTH_SECRET / GOOGLE_CLIENT_ID / SECRET missing" as
    an error (✗), not demo.
- **verify**: `GET /app` returns 2xx without a login redirect (offline mode);
  doctor rows "/app — přihlášení (Auth.js)" and "/app — data
  (LOCAL_DB/Firestore)" — the data row also tells you whether
  `.data/systedo.db` exists and to run `npm run seed:local` if not.
- **without**: `fallback: in dev, DEV_AUTH=true + LOCAL_DB=true sign in a
  synthetic user and store everything in local node:sqlite — /app fully
  offline. Both switches are IGNORED when NODE_ENV=production, where this
  group is hard-required: no AUTH_SECRET + Google OAuth means sign-in is off,
  and no Firestore project means /app data has nowhere to live (doctor: off).`

### ad-connectors

- **unlocks**: live campaign data in `/kampane` instead of demo data. Google
  Ads (read + edit, on behalf of the signed-in user's OAuth token and selected
  account) and Sklik (Seznam.cz; data-in only, one token per instance —
  per-user auth is a planned follow-up).
- **keys**: `GOOGLE_ADS_DEVELOPER_TOKEN` (from a Google Ads MANAGER account,
  Tools → API Center), `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (digits-only MCC id, if
  accounts sit under an MCC); `SKLIK_API_TOKEN` (Sklik → Settings → API).
- **options**:
  - Google Ads token — GET: live sync + campaign edits; COSTS: a manager
    account and Google's developer-token approval; NOTE: requires the
    cloud-auth path (the connector calls the API as the signed-in user).
  - Sklik token — GET: live campaigns + daily stats for users without a
    connected Google Ads account (Google takes precedence); LIMITED: read-only,
    instance-wide token.
  - none / later — `/kampane` stays on demo data.
- **verify**: doctor row "Google Ads (živá data)"; readiness matrix lines
  `GOOGLE_ADS_DEVELOPER_TOKEN` and `SKLIK_API_TOKEN` (present/absent only).
- **without**: `fallback: /kampane runs on demo campaign data — the page works,
  clearly demo. Doctor state: demo.`

### social-publishing

- **unlocks**: real social platform connections for content publishing (Meta,
  LinkedIn) and the twin's outbound e-mail channel. Each platform is
  independently configured; you must register your own apps — an open
  repository cannot ship shared ones.
- **keys**: `META_APP_ID` + `META_APP_SECRET`; `LINKEDIN_CLIENT_ID` +
  `LINKEDIN_CLIENT_SECRET`; `TWIN_SMTP_URL` (SMTP connection URL).
- **options**: per platform — GET: a real connection for that platform;
  COSTS: registering a developer app with that platform. none / later is fine
  per platform.
- **verify**: variables present in `.env.local` (no doctor row; no live probe —
  verifying must not place calls against a social API).
- **without**: `fallback: an unconfigured platform degrades to a demo
  connection rather than erroring, and without TWIN_SMTP_URL the e-mail
  channel degrades to "manual" rather than failing (.env.example §7).`

### creative-studio

- **unlocks**: real image generation (Leonardo AI) with Gemini vision scoring
  picking the best of several candidates, plus embedding-backed RAG search in
  the patterns library.
- **keys**: `LEONARDO_API_KEY` (app.leonardo.ai); `GEMINI_API_KEY` (shared with
  llm-engine — vision scoring); optional `GEMINI_VISION_MODEL` (defaults to
  `GEMINI_MODEL`), `GEMINI_EMBED_MODEL` (must be an embedding model),
  `FIREBASE_STORAGE_BUCKET` (asset library; default
  `<GOOGLE_CLOUD_PROJECT>.appspot.com`).
- **options**:
  - Leonardo + Gemini — GET: full studio (generate + vision-score).
  - Leonardo only — GET: real generation; LIMITED: no vision scoring of
    candidates (doctor: demo with a hint to add `GEMINI_API_KEY`).
  - none / later — demo mode.
- **verify**: doctor row "Creative Studio" (it distinguishes both-keys / Leonardo-only / neither).
- **without**: `fallback: the studio runs in demo mode — deterministic SVG
  placeholders instead of generated images; without embeddings, patterns
  search degrades to lexical. Doctor state: demo.`

### cron-alerts

- **unlocks**: the five scheduled jobs under `/api/cron/*` (schedules in
  `vercel.json`, constant-time guard in `src/lib/cron-auth.ts`), transactional
  alert e-mails via Resend, and an optional outgoing webhook for alerts and the
  weekly digest.
- **keys**: `CRON_SECRET` (any secret — the scheduler sends it as a Bearer
  token); `RESEND_API_KEY` (https://resend.com) + optional `ALERT_FROM_EMAIL`;
  optional `ALERT_WEBHOOK_URL` (Slack / Teams / Discord incoming webhook,
  `{text}` payload).
- **options**:
  - `CRON_SECRET` only — GET: protected scheduled sync; LIMITED: alert e-mails
    are logged, not sent (doctor: demo).
  - + `RESEND_API_KEY` — GET: real alert delivery (doctor: on).
  - + `ALERT_WEBHOOK_URL` — GET: chat-channel alerts and the weekly digest.
- **verify**: doctor row "Cron + upozornění"; readiness matrix `CRON_SECRET` /
  `RESEND_API_KEY`.
- **without**: `hidden: crons FAIL CLOSED — with no CRON_SECRET the /api/cron/*
  endpoints are disabled entirely rather than left open (.env.example §8).
  Nothing errors in the UI; scheduled sync simply does not run. Doctor state:
  off (its label), honest meaning: disabled by design.`

### ops-observability

- **unlocks**: the admin/operator telemetry surfaces, error tracking, and LLM
  observability. Nothing here is on by default and nothing phones home without
  a value.
- **keys**: `ADMIN_EMAILS` (comma-separated allowlist, case-insensitive);
  `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (errors-only mode — no tracing, no
  source-map upload); `LIGHTTRACK_URL` / `LIGHTTRACK_PROJECT` (dev) /
  `LIGHTTRACK_KEY` (enforced/cloud) / `LIGHTTRACK_SOURCE` /
  `LIGHTTRACK_ENABLED=false` for hard-off (best-effort mirroring of every LLM
  call through `src/lib/llm/telemetry.ts`, never blocks a generation). Rate
  and spend controls all have defaults: `AI_RATE_PER_MIN/DAY`,
  `SYNC_RATE_PER_MIN`, `AI_MAX_CONCURRENT`, `AI_MAX_BODY_BYTES`,
  `AI_GLOBAL_DAILY_CEILING`, `AI_CEILING_FAIL_CLOSED`, `TRUSTED_PROXY` +
  `TRUSTED_PROXY_HOPS` (only behind a proxy you control).
- **options**: each independently; none / later is the shipped default.
- **verify**: readiness matrix `ADMIN_EMAILS`; other variables present in
  `.env.local`. No live probe.
- **without**: `hidden: ADMIN_EMAILS fails CLOSED — unset means nobody is an
  admin and the operator telemetry surfaces are unreachable, by design.
  Sentry never initialises without a DSN (no network traffic), LightTrack
  stays inactive, and rate/spend limits run on their built-in defaults.`

## Zero-key path

Adamant's strongest story. With **nothing** configured:

```bash
npm install && npm run seed:local && npm run dev:local
```

- The **public marketing site** at `/` runs with a completely empty env file.
- The **full authenticated product** at `/app` works offline: `DEV_AUTH` signs
  in a dev user, `LOCAL_DB` stores everything in `.data/systedo.db`
  (`node:sqlite`), and `seed:local` has already created the dev user plus
  sample projects — open `/app/demo-eshop`.
- **Every AI tool runs** and returns a deterministic demo result — a typed,
  mandatory `demo()` fallback per generator, not an error page.
- `/kampane` shows demo campaign data; **Creative Studio** produces
  deterministic SVG placeholders; the dashboard renders the committed seeded
  demo dataset (`src/data/performance.json`, reproducible via
  `scripts/generate-data.mjs`).

Do not undersell this: it is the designed floor, stated in `.env.example`'s
header and CONTRIBUTING.md, and it is a usable product tour, not a stub.

## Setup helpers

| script | what it does | when to offer |
| --- | --- | --- |
| `npm run doctor` | env preflight: loads `.env.local` like the app does, probes the machine (Node version, claude CLI, key files, local DB) and prints the surface × status table plus the production-readiness matrix. Read-only — no model calls. Exits non-zero only on real misconfiguration (✗); demo mode is a supported state. | early — before asking any group question, and again at step 4 as the group verify |
| `npm run seed:local` | one-time: creates the dev user + sample projects in `.data/systedo.db` (`/app/demo-eshop`) | before the first `dev:local` boot; doctor's LOCAL_DB row hints at it when the file is missing |
| `npm run seed:check` (`generate-data.mjs --check`) | verifies the committed demo dataset still matches its deterministic generator | when demo dashboard data looks wrong, or as part of `check:ci` |

## Boot verify

1. Pre-boot gate: `npm run typecheck` (`tsc --noEmit`).
2. Boot `npm run dev:local` in the background (cloud mode: `npm run dev`).
   Read the real port from the `next dev` banner — the default is 3000 but
   Next.js moves to a free port when 3000 is taken; never assume.
3. Probe `GET /app` on the live port → expect 2xx with no redirect to a login
   page (`DEV_AUTH` authenticates the synthetic user). `GET /` proves the
   public site independently of any auth choice.
4. Per-group probes, all read-only: run `npm run doctor` and read its table
   (it IS the per-group verify for llm-engine, auth-datastore, ad-connectors,
   creative-studio and cron-alerts); `GET /api/health` exposes the same
   present/absent readiness matrix (`src/lib/readiness.ts`).
5. Restart caveat: env changes need a dev-server restart; `AGENTS.md` also
   notes `next dev` rewrites its own block into `AGENTS.md` — an uncommitted
   change there after boot is expected, not damage.

## Env notes

- **Build-time inlining**: `NEXT_PUBLIC_*` variables (`NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_SENTRY_DSN`) are inlined at build time and cannot reach an
  already-built client bundle. `NEXT_PUBLIC_SOURCE_REPO_URL` is proposed but
  **not yet read by the app** — do not promise it works.
- **`AUTH_SECRET`** is worth generating for the user: any 32-byte random value,
  base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- **Rotation coupling**: `CATALOG_TOKEN_SECRET` (note: some code comments still
  call it TOKEN_CRYPTO_KEY) and `BYOM_KEY_SECRET` both fall back to
  `AUTH_SECRET`. Set them explicitly BEFORE storing any connector token or
  BYOM key — otherwise rotating `AUTH_SECRET` makes stored ciphertext
  undecryptable (AES-256-GCM stores in `src/lib/inventory/token-crypto.ts`
  and `src/lib/llm/keys/crypto.ts`).
- **BYOM keys live in the app**, encrypted at rest through the keys store —
  process-level provider keys are for benchmarks/operator defaults only.
- **`SYSTEDO_DB_FILE`** defaults to `<cwd>/.data/systedo.db` — a trap for any
  service launched from a different working directory (it silently opens a
  different, empty database). Set an ABSOLUTE path anywhere outside plain
  local development; this is the one overlay-sanctioned absolute-path variable.
- **`DEV_AUTH` and `LOCAL_DB` are ignored when `NODE_ENV=production`** and
  belong in `.env.local` only.
- `NEXT_TELEMETRY_DISABLED=1` is recommended for self-hosted builds.

## Matrix rows

Aligned 1:1 with doctor's surface × status table so the skill and
`npm run doctor` never disagree (same states: on / demo / off / error).

| feature | states it can be in | what decides | how to change |
| --- | --- | --- | --- |
| Public site `/` | on (always) | nothing — the zero-key floor | — |
| AI tools — dev (Claude CLI) | on / demo | claude CLI installed + logged in | install `claude`; `/onboarding llm-engine` |
| AI tools — prod (Gemini) | on / demo | `GEMINI_API_KEY` | `/onboarding llm-engine` |
| `/app` sign-in (Auth.js) | on (OAuth) / on (DEV_AUTH) / error (partial) / off | `AUTH_SECRET`+`GOOGLE_CLIENT_ID/SECRET`, or `DEV_AUTH=true` in dev | `/onboarding auth-datastore` |
| `/app` data (Firestore / LOCAL_DB) | on / error (project w/o key) / off | `LOCAL_DB=true` in dev, or `GOOGLE_CLOUD_PROJECT` + Firebase credential | `/onboarding auth-datastore`; `npm run seed:local` |
| Cron + alerts | on / demo (e-mails logged) / off (fail-closed, by design) | `CRON_SECRET`, then `RESEND_API_KEY` | `/onboarding cron-alerts` |
| Creative Studio | on / demo (Leonardo w/o vision) / demo (placeholders) | `LEONARDO_API_KEY` + `GEMINI_API_KEY` | `/onboarding creative-studio` |
| Google Ads (live) | on / demo | `GOOGLE_ADS_DEVELOPER_TOKEN` (+ MCC id) | `/onboarding ad-connectors` |
| Sklik (live) | on / demo | `SKLIK_API_TOKEN` (readiness matrix row) | `/onboarding ad-connectors` |
| Social publishing + twin e-mail | on per platform / demo connection / manual e-mail | `META_*`, `LINKEDIN_*`, `TWIN_SMTP_URL` | `/onboarding social-publishing` |
| Admin + observability | on / hidden (fail-closed, by design) | `ADMIN_EMAILS`; `SENTRY_DSN`, `LIGHTTRACK_*` | `/onboarding ops-observability` |
