# Self-hosting Adamant — the design

**Status: PARTIALLY IMPLEMENTED (2026-08-25).** The mode inversion described in
this document has landed: `SELF_HOSTED=true` is a real, honoured-in-production
switch. What works today, per section:

| Section | Item | Status |
| --- | --- | --- |
| §1 | `src/lib/deploy-mode.ts` seam + the three consumers + fail-closed boot rule | **implemented** |
| §2 | Operator-password auth (Option A: Credentials + JWT sessions, `ADAMANT_OPERATOR_PASSWORD`) | **implemented** (Auth.js's built-in sign-in form; a styled login page is open) |
| §3 | SQLite as the production store (`LOCAL_DB=true` legal under `SELF_HOSTED`) | **implemented**; Gap 2 (`db:backup` script) and the index-migration test hole remain **open** |
| §4 | BYOM ungated in self-host; provider order no longer keyed off `NODE_ENV` | **implemented**; the two image-route hard 400s and BYOM vision/embeddings remain **open** |
| §5 | Dockerfile (standalone, non-root, node:24) + docker-compose + `/app/.data` volume | **implemented** |
| §6 | Cron sidecar (`scripts/cron-runner.mjs`, schedules read from `vercel.json`) | **implemented** |
| — | Firestore-only campaign modules (impact.md Gap 3: alerts, mutations, control-plane, `google/token.ts`, `account/sessions.ts`…) | **open — the main blocker**: live Google Ads sync and the campaigns write-paths still 500 on a Firestore-less install |
| — | Self-host-honest plan/usage UI; `NEXT_PUBLIC_SOURCE_REPO_URL` footer wiring | **open** |

### Quick start (what already works)

```bash
cp .env.example .env    # set AUTH_SECRET + ADAMANT_OPERATOR_PASSWORD (minimum)
docker compose up -d --build
# → http://localhost:3000, sign in with the operator password
```

Or without Docker: `SELF_HOSTED=true LOCAL_DB=true SYSTEDO_DB_FILE=/abs/path/systedo.db npm run build && npm start`.

The rest of this document is the agreed design, kept as the reference for the
open items above; original context in
[`impact.md` §2](./impact.md#2-the-five-blocking-gaps-ranked).

The target, stated plainly: **a self-hosted install runs the entire product, on
your machine, on your models, on your data, with no limits, and nothing phones
home.** Not a trial edition. The hosted cloud is the same code with the
operations handled.

---

## 1. The `SELF_HOSTED` mode proposal

### Why a third mode rather than loosening the dev guards

The tempting change is to delete `NODE_ENV !== "production"` from
`src/lib/local-mode.ts` and `src/lib/readiness.ts`. **Do not.** Those same
expressions guard `DEV_AUTH` in `src/auth.ts:26-29`, and a loosening refactor
risks re-opening a login bypass in production — the worst possible failure for a
tool that spends advertising budget. The safe move is an *additional*, explicit
mode that never implies `DEV_AUTH`.

### The seam

A new `src/lib/deploy-mode.ts` — pure, framework-free, the sibling of
`local-mode.ts`:

```ts
export type DeployMode = "cloud" | "self-hosted" | "dev";

// SELF_HOSTED=true is an EXPLICIT operator decision, honoured in production.
// It does NOT enable DEV_AUTH. It selects a different, real auth provider.
export const SELF_HOSTED = process.env.SELF_HOSTED === "true";
```

Three consumers change, and only three:

1. `src/lib/local-mode.ts` —
   `LOCAL_DB === "true" && (NODE_ENV !== "production" || SELF_HOSTED)`.
2. `src/lib/readiness.ts` — `firebasePreflight` gains `|| SELF_HOSTED` alongside
   its `localDb` term, so a Firebase-less production boot is legal *in that mode
   only*. `productionWarnings()` should also stop calling an unset `CRON_SECRET`
   a misconfiguration in this mode and say "crons disabled — see docs" instead.
3. `src/lib/plans.ts` — `devByomUnlockActive` and `planHasByom` treat
   `SELF_HOSTED` as unlocked (see §4).

`DEV_AUTH` deliberately does **not** consult `SELF_HOSTED`. It stays
dev-only, forever.

### Fail-closed rule

Borrowed from the sibling project, and worth copying exactly: **a production
build with `SELF_HOSTED=true` and no operator credential must refuse to boot**,
unless `ALLOW_OPEN=1` is set explicitly. The point is that "I put it on the
internet with no password" has to be a decision rather than an accident.

---

## 2. The auth seam

`src/auth.ts` is Auth.js v5 with exactly one provider (Google, Ads scope baked
in), a `FirestoreAdapter`, and `session: { strategy: "database" }`. Only **4
files** import `@/auth`; **49** go through `@/lib/session`. The swap is small.

### Option A — single operator password (recommended for v1)

An Auth.js `Credentials` provider checking `ADAMANT_OPERATOR_PASSWORD`, with
`session: { strategy: "jwt" }` so no database adapter is needed at all. The
per-project tenancy already in place (`u_{userId}_proj_{projectId}`) works
unchanged with one fixed user id. Single-tenant self-host is the honest 90% case.

Cost: one file, plus a login page. **Effort M.**

### Option B — multi-user over SQLite

Email + password (argon2) or passkeys/WebAuthn, with a thin Auth.js adapter over
`src/lib/db.ts` — the `users` / `sessions` / `accounts` / `verification_tokens`
quartet, roughly 150 LOC. Correct eventually; **defer to v1.1**.

**Multi-user must ship as a self-host feature, not a cloud gate.** Making it the
cloud differentiator is the classic open-core line and directly contradicts the
stance in [`impact.md` §1](./impact.md#1-the-open-core-boundary).

### Google stays, and stays required for Google Ads

Google OAuth remains available and is **still mandatory for the Google Ads
connector** — that is a Google API constraint, not an Adamant one. Self-hosters
register their own OAuth client and supply `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` with `http://localhost:3000/api/auth/callback/google` as
a redirect URI. Document the exact console steps; do not try to work around it.

---

## 3. SQLite as a production store

`src/lib/db.ts` is closer to production-ready than expected, and has three gaps.

**What is already right.** `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout =
5000`, `PRAGMA foreign_keys = ON`, and `synchronous` left at SQLite's `FULL`
default. Migrations run through an append-only `schema_version` ledger with an
`applied(db)` probe, so a pre-ledger database is stamped rather than re-run, and
nothing is ever dropped. `test-unit/db-migrations.test.mjs` pins it.

**Gap 1 — the cwd-relative default.** The file resolves to
`SYSTEDO_DB_FILE || <cwd>/.data/systedo.db`. A service launched from a different
working directory silently opens a *different, empty* database. Self-host docs
must require `SYSTEDO_DB_FILE` to be an **absolute** path on a mounted volume,
and the boot path should warn loudly when it is unset in `SELF_HOSTED` mode.

**Gap 2 — no backup story at all.** `scripts/` contains only
`seed-local-db.mjs`. Losing the file loses everything. Ship a `db:backup` script
using SQLite's online backup API (or `VACUUM INTO`), a documented restore, and a
WAL checkpoint on boot so the `-wal` sidecar is not part of what the operator has
to remember to copy. **Effort S, blocking.**

**Gap 3 — single process only.** One cached `DatabaseSync` on `globalThis`. Fine
for `next start` in one container; incompatible with multiple replicas. That is
an accepted v1 constraint (the packaging below pins one replica); a Postgres
backend is the v2 answer for HA.

**One test hole worth closing early.** The migration guard test compares only
`type='table'` in `sqlite_master`. An index added to `SCHEMA` without a migration
entry reaches fresh databases but never existing ones, and the test still passes.
Fix before self-hosters start upgrading real databases.

---

## 4. Models: BYOM by default, and the Ollama story

This is the area where Adamant is **ahead** of where the reference project
started, and almost nothing structural is needed.

Every LLM text call already goes through one chokepoint, `generateStructured()`
in `src/lib/llm/index.ts`. Every operation carries a **required** deterministic
`demo: () => T` fallback, enforced by the type system, so an install with no
provider at all still works — degrade, don't crash, as a product property rather
than a courtesy. BYOM ships with six vendors — `openai`, `anthropic`, `gemini`,
`openrouter`, `qwen`, `ollama` — with per-user keys encrypted at rest and a key
store that already has both a Firestore and a local backend.

Ollama is already wired: `src/lib/llm/byom/adapters.ts:490-491` defaults
`OLLAMA_BASE_URL` to `http://localhost:11434/v1`, and `OPENAI_BASE_URL`,
`ANTHROPIC_BASE_URL`, `GEMINI_BASE_URL`, `QWEN_BASE_URL` and
`OPENROUTER_BASE_URL` are all overridable — so LM Studio, llama.cpp, vLLM,
LiteLLM and Azure all work through the same rows.

### The two changes that remain

1. **Ungate BYOM in self-host.** `src/lib/plans.ts:44-46` gates
   `devByomUnlockActive` on `NODE_ENV !== "production"`, and `planHasByom`
   requires the paid `byom` plan. In self-hosted mode BYOM is not a plan feature;
   it is the *only* model path. One predicate. **S.**
2. **Provider order must not key off `NODE_ENV`.**
   `src/lib/llm/provider-order.ts` returns `dev ? ["claude","gemini"] :
   ["gemini","claude"]`, with `isDevEnvironment()` at `src/lib/llm/index.ts:54`
   defined as `NODE_ENV !== "production"`. In a self-hosted production build that
   demotes the Claude CLI — which many self-hosters have on a Pro/Max
   subscription and which needs no key — behind a Gemini key they may not have.
   Key the order off *configured providers*, not the environment. **S.**

### The honest caveat: images and embeddings

BYOM covers the text chokepoint only. Grepping `byom` in `src/lib/images/`,
`src/lib/leonardo/` and `src/lib/patterns/embeddings.ts` returns zero hits.

| Surface | Key | With no key |
| --- | --- | --- |
| Image generation (Leonardo) | `LEONARDO_API_KEY` | deterministic SVG placeholders, quota refunded |
| Background removal | `LEONARDO_API_KEY` | **hard 400 — must become a graceful degradation** |
| Reference-image upload | `LEONARDO_API_KEY` | **hard 400 — must become a graceful degradation** |
| Vision scoring | `GEMINI_API_KEY` | `{score: null, defects: …}`, never throws |
| RAG embeddings | `GEMINI_API_KEY` | `null` → lexical-only search, quota refunded |

Leonardo is a genuine cloud dependency, but it is an **operator-supplied key**,
not an Adamant-hosted service — so it is AGPL-compatible and consistent with the
model. The two hard 400s are the exception and must be fixed for v1; they are the
only places the codebase currently violates its own "degrade, don't crash" rule.
Routing vision and embeddings through the user's already-stored BYOM key is a
v1.1 item, as is a filesystem asset store to replace Firebase Storage (today
`IMAGE_LIBRARY_OFFLINE = LOCAL_DB` means generated assets have nowhere to
persist offline — the code already says so honestly).

---

## 5. Packaging

### Runtime

One container running `next start`. Requires `output: "standalone"` in
`next.config.ts` (not set today) to keep the image reasonable, Node **≥ 22.5**
pinned (`node:sqlite` needs it), a non-root uid, a `/data` volume for the SQLite
file, a health check, and `NEXT_TELEMETRY_DISABLED=1` baked in.

### Compose

`docker-compose.yml` with the app, a named volume, and a cron sidecar (§6).
`docker compose up -d --build` from a copied `.env.example` is the whole quick
start. Pin `replicas: 1` anywhere replicas are expressible — the SQLite store is
single-process (§3).

### The env file

`.env.example` is now English and complete, and is the single reference. In a
follow-up it should be split into explicit **self-hosted** and **cloud-only**
sections once `SELF_HOSTED` exists as a real variable.

### Docs split

`docs/deploy.md` stays as the **cloud/Vercel** runbook, unchanged. Self-hosting
gets this document and, once implemented, a quick start at the top of it.

---

## 6. Crons

Five jobs live in `vercel.json`, all `GET`, all `maxDuration: 300`, all gated by
`cronAuthorized(request)` in `src/lib/cron-auth.ts` (Bearer `CRON_SECRET`, both
sides SHA-256'd then `timingSafeEqual`, **failing closed** — no secret means
crons are silently disabled rather than open).

| Path | Schedule | Job |
| --- | --- | --- |
| `/api/cron/sync` | hourly | Google Ads + Sklik fan-out per (account, project), critical-campaign email, report-metrics refresh |
| `/api/cron/catalog-sync` | daily 05:00 | warehouse/ERP re-pull, token decrypt, health-transition alerts, Leonardo generation reaping |
| `/api/cron/digest` | weekly Mon 07:00 | portfolio digest, "Diagnóza týdne", operator LLM telemetry rollup |
| `/api/cron/report` | daily 06:00 | cadence-filtered shared report + email, claim-first day lock |
| `/api/cron/social` | hourly | publish due scheduled posts, reclaim stale `publishing` claims |
| `/api/cron/ledgers` | hourly :30 | ledger step registry — every due step in `src/lib/cron/ledgers.ts` |

There is **no scheduler in the repo** — no `node-cron`, no `setInterval`, nothing
in `src/instrumentation.ts` (Sentry only).

**Option 1 — documented external cron (recommended for v1).** The routes are
already HTTP-shaped and already secret-gated, so *zero code change is required*:
an `alpine` + `curl` + `crond` (or `supercronic`) sidecar firing six
authenticated GETs. Identical on a VPS crontab or a systemd timer. Document the
long timeouts — the routes budget 300s. **Effort S.**

**Option 2 — in-process scheduler.** `register()` in `instrumentation.ts` starts
`node-cron` when `SELF_HOSTED`. Tempting (one container, nothing to configure),
but it fires per server instance, must be idempotent — the routes already
claim-lock via `claimReportDay`, stale-claim reclamation and `cron/sent-guard` —
and it duplicates on every dev HMR reload. **Effort M, v1.1** if self-hosters ask.

**Option 3 — tell people to `curl` it themselves.** Unacceptable UX for a
self-host-first product.

Ship option 1 with v1. The product works without crons — all six are background
refreshes — but "my scheduled posts never published" is a day-2 support burden.

---

## 7. External egress inventory

The list to hand your security team. Every host below is reached **only** when
you configure the corresponding key or URL. With none set, an Adamant install
makes no outbound calls at all.

| Host | Reached when | What for |
| --- | --- | --- |
| `generativelanguage.googleapis.com` | `GEMINI_API_KEY` | text generation, vision scoring, embeddings |
| `api.anthropic.com` | BYOM `anthropic` key | text generation |
| *(none — local process)* | Claude CLI installed | text generation on a subscription, no network egress from this app |
| `api.openai.com` | BYOM `openai` key | text generation |
| `openrouter.ai` | `OPENROUTER_API_KEY` | text generation, the quality benchmark |
| `dashscope-intl.aliyuncs.com` | BYOM `qwen` key | text generation |
| `localhost:11434` (or your `OLLAMA_BASE_URL`) | Ollama configured | local text generation |
| `cloud.leonardo.ai` | `LEONARDO_API_KEY` | image generation, background removal, reference upload |
| `googleads.googleapis.com` | `GOOGLE_ADS_DEVELOPER_TOKEN` + a connected account | campaign data in, campaign edits out |
| `api.sklik.cz` | `SKLIK_API_TOKEN` | campaign and daily-statistics reads |
| `accounts.google.com` / `oauth2.googleapis.com` | `GOOGLE_CLIENT_ID` | login, Ads authorisation |
| `graph.facebook.com` | `META_APP_ID` | social publishing |
| `api.linkedin.com` | `LINKEDIN_CLIENT_ID` | social publishing |
| `api.resend.com` | `RESEND_API_KEY` | alert and digest email; twin outbound email (S2 — the `email` connector; `TWIN_SMTP_URL` is retired) |
| your webhook host | `ALERT_WEBHOOK_URL` | Slack/Teams/Discord alerts |
| your Sentry host | `SENTRY_DSN` | error reports, errors-only, no tracing, no replay |
| `127.0.0.1:8787` (or your `LIGHTTRACK_URL`) | `LIGHTTRACK_PROJECT` or `LIGHTTRACK_KEY` | LLM observability, loopback by default |
| `firestore.googleapis.com` | Firebase credentials | **cloud mode only** — not used in a SQLite self-host |

Publishing this list precisely *because* it is long is the point. A future
`OFFLINE=1` process-level fetch allowlist (loopback plus explicitly configured
private endpoints) is a v2 item for air-gapped and data-residency deployments.

---

## 8. Production checklist (for the eventual quick-start doc)

- Terminate TLS in front of the container; the app provides none.
- Set `TRUSTED_PROXY` (and `TRUSTED_PROXY_HOPS`) **only** when a proxy you
  control rewrites the client-IP headers — otherwise a caller forges their own
  rate-limit identity.
- `SYSTEDO_DB_FILE` absolute, on a mounted volume, backed up on a schedule you
  have actually restored from once.
- `AUTH_SECRET`, `CATALOG_TOKEN_SECRET` and `BYOM_KEY_SECRET` generated per
  install, never reused, and set *before* any connector token or model key is
  stored (see [`SECURITY.md`](../../SECURITY.md)).
- `CRON_SECRET` set, and the cron sidecar actually firing — check the run log.
- Run as non-root; the image should not need a writable root filesystem beyond
  `/data`.
- Rehearse an upgrade against a copy of your database before running it against
  the real one.
- If you modify Adamant and offer it to others over a network, AGPL §13 requires
  you to offer those users your modified source. The intended mechanism is a
  `NEXT_PUBLIC_SOURCE_REPO_URL` variable pointing the app's own footer at your
  fork — **it is proposed in `.env.example` but not yet read by any code.**
  Wiring it is a small v1 item; until then, link your fork yourself.

---

## 9. Handoff: constraints on the connectors initiative

Self-hosting imposes three hard constraints on any WhatsApp / Meta / LinkedIn /
Google connector design. `src/lib/social/connection.ts` already has the right
shape — `socialConfigured()` reads `META_APP_ID` / `LINKEDIN_CLIENT_ID`,
`providerConfigured(platform)` is per-platform, and a demo connection stays a
demo connection. **Extend that; do not invent a parallel one.**

1. **No public webhook endpoint on localhost.** Meta Graph, LinkedIn and Google
   Pub/Sub all require an HTTPS callback they can reach; a self-hosted install
   behind NAT has none. **Polling is the baseline transport for every
   connector**; webhooks are a cloud-and-tunnel optimisation, opt-in via a
   configured public base URL. Design the interface so a poller and a webhook
   receiver feed the *same* ingest function.
2. **OAuth redirect URIs must accept `http://localhost:<port>`.** Google already
   works this way here. Meta and LinkedIn are fussier about non-HTTPS redirects —
   document the exact app-configuration steps, and support a configurable public
   base URL (`NEXT_PUBLIC_SITE_URL` today; a dedicated `PUBLIC_BASE_URL` if the
   semantics need to diverge) for users behind a reverse proxy or a tunnel.
3. **Users bring their own app credentials.** You cannot ship a Meta app id or a
   LinkedIn client id in an open repository, and thousands of installs cannot
   share one app — rate limits, review liability, ToS. Every connector needs a
   per-install credentials path, with the already-present degradation to demo
   accounts when unset.

Point 3 is also the crispest example of legitimate cloud-only value: the hosted
product supplies the approved apps, the Ads developer token and the Sklik token.
That is an approval, not a feature — which is exactly why it can be sold without
holding anything back from the source.

Connector tokens must be encrypted at rest through
`src/lib/inventory/token-crypto.ts` (v2, per-token salt), which reads
**`CATALOG_TOKEN_SECRET`** — not `TOKEN_CRYPTO_KEY`, a name that survives only in
a stale comment and error string in `src/app/api/cron/catalog-sync/route.ts`.
