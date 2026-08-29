# Going open source — the impact map

**Status:** decision taken, flip not performed. This repository is still private.
This document is the canonical record of *what has to be true* before it is
public, and *where the line between open and hosted sits*.

**The decision:** Adamant ships under **AGPL-3.0-only** with a relicensing
**CLA**, the **entire product** open and **unmetered** when self-hosted, and a
paid **hosted cloud** on top that sells operations rather than features. The
model is copied deliberately from a sibling project (KandiDate / "kp") that made
the same call for the same reasons.

Companion design document: [`self-hosting.md`](./self-hosting.md).

---

## 1. The open-core boundary

### Open, unlimited, self-hostable: the entire application

Performance reporting and Výkon, campaign intelligence for Google Ads and Sklik,
the content engine and its 40+ LLM operations, Creative Studio, the brand-voice
twin and the Komunikace section, keywords, the patterns library, local SEO and
the map pack, the catalog/offering spine, diagnoses, the onboarding scan, organic
channels. No feature flags, no seat caps, no "enterprise SSO" gate, no AI-call
quotas in a self-hosted install.

### Cloud-only value: operations, not features

- Managed hosting, TLS, backups, restore rehearsals, zero-downtime upgrades.
- **Managed provider credentials** — the biggest real one. Cloud users never
  obtain a Gemini key, a Leonardo key, a Google Ads developer token, a Sklik API
  token, or an approved Meta/LinkedIn app. Those are approvals, not code, and
  they cannot be given away with the source.
- **A public HTTPS origin** for OAuth callbacks, shared reports, microsites and
  webhooks. A self-hosted install behind NAT structurally does not have one.
- Managed crons (a self-hosted install runs its own trigger).
- Guided onboarding, support, SLA.

### Why this stance for this product specifically

1. **There is no tech moat to protect.** The project's own 2026-07 strategic
   verdict was "no tech moat; lean on Sklik unification, diagnostics and price".
   A feature-gated open core defends a moat that does not exist, at the cost of
   the one thing open source actually buys: distribution.
2. **The hard parts are not the code.** Ads developer-token approval, a Sklik
   token, Meta app review, Leonardo credits, keeping 40+ prompts good against
   drifting models — all operational. That is exactly what a hosted plan sells.
3. **The AGPL already protects the only thing worth protecting.** A competitor
   who forks Adamant and runs it as a SaaS must publish their modifications; the
   CLA keeps the maintainer's own hosted offering unencumbered.
4. **A limits-based open core would be transparently fake here.** The metering
   that exists is cost control on *the operator's own* Gemini/Leonardo bill. In a
   self-hosted install the operator pays their own provider — there is nothing to
   meter, and it is two files to patch out anyway.

**One deviation considered and rejected:** making multi-user the cloud
differentiator. Adamant's data model is already multi-user with per-project
tenancy. Single-operator self-host is a reasonable *v1 scope* choice; it must
never become a *commercial line*.

---

## 2. The five blocking gaps, ranked

### Gap 1 — The production guard inversion (BLOCKING, effort M)

**The offline mode this repo already has is structurally forbidden from being
deployed.** Three guards, all keyed on `NODE_ENV !== "production"`, and
`next build && next start` sets `NODE_ENV=production`:

| Evidence | Guard |
| --- | --- |
| `src/auth.ts:26-29` | `DEV_AUTH = process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production"` |
| `src/lib/local-mode.ts:13-14` | `LOCAL_DB = process.env.LOCAL_DB === "true" && process.env.NODE_ENV !== "production"` |
| `src/lib/readiness.ts:44-50` | `firebasePreflight` mirrors it (`env.LOCAL_DB === "true" && !isProd`) and **throws fatally** in production without explicit Firebase credentials, unless `FIREBASE_ALLOW_ADC=true` |
| `src/lib/plans.ts:44-46` | `devByomUnlockActive` carries the same production gate |
| `src/lib/firebase.ts` | lazy proxy — but the first real use at runtime runs the preflight and throws |

So self-hosting is not a missing feature. It is *actively prohibited*, three
times over. There is no `middleware.ts`; the gate is per-route/per-layout.

Nothing else in this document matters until a production build can boot without
Firestore. The proposed fix — a first-class `SELF_HOSTED` mode rather than
loosening the dev guards — is designed in
[`self-hosting.md`](./self-hosting.md#1-the-self_hosted-mode-proposal).

### Gap 2 — The non-Google auth seam (BLOCKING, effort M)

`src/auth.ts` is Auth.js v5 with **exactly one provider: Google**, the Ads scope
baked in (`ADWORDS_SCOPE`), `adapter: FirestoreAdapter(firestore)` and
`session: { strategy: "database" }`. Sessions live in Firestore. A self-hoster
without a Google Cloud project cannot log in at all.

The good news is the blast radius: only **4 files** import `@/auth`
(`src/app/api/auth/[...nextauth]/route.ts`, `src/app/layout.tsx`,
`src/app/app/[projectId]/ucet/page.tsx`, `src/lib/session.ts`); **49** go through
`@/lib/session`. A provider swap is one file plus a session store.

Google OAuth stays available and **stays required for Google Ads** — that is a
Google API constraint, not an Adamant one. Options in
[`self-hosting.md`](./self-hosting.md#2-the-auth-seam).

### Gap 3 — Firestore-only modules (BLOCKING for the campaigns subset, effort M)

26 store pairs already have verified local/Firestore export parity, plus the
generic document-backend seams (`src/lib/campaigns/store/backend.ts` →
`local-docs.ts`, `src/lib/tenant-docs/backend.ts` → `local.ts`) which give
several domains a local branch for free. What is left:

| Module | Offline behaviour | v1? |
| --- | --- | --- |
| `src/lib/campaigns/alerts.ts` | 500 — `tenants/{t}/alerts`, transactions | **blocking** |
| `src/lib/campaigns/mutations.ts` | 500 — audit trail | **blocking** |
| `src/lib/campaigns/control-plane.ts` | 500 — `changeSets` + transactions | **blocking** |
| `src/lib/campaigns/anomaly-alerts.ts` | 500 | **blocking** |
| `src/lib/campaigns/report-config.ts` | 500 — `FieldValue` | **blocking** |
| `src/lib/google/token.ts` | 500 — **and this one gates Google Ads entirely** | **blocking** |
| `src/lib/account/sessions.ts` | 500 — session listing/revocation | **blocking** |
| `src/lib/campaigns/shared-report.ts` | 500 — `sharedReports` | deferrable |
| `src/lib/ai/experiments.ts` | 500 | deferrable |
| `src/lib/microsite.ts`, `microsite-identity.ts` | 500 | deferrable |
| `src/lib/images/store.ts`, `generations-store.ts`, `attribution.ts` | degrades honestly (`IMAGE_LIBRARY_OFFLINE = LOCAL_DB`) | deferrable |
| `src/lib/ai/durable-limit.ts` | falls back to the per-process sqlite limiter | fine |
| `src/lib/usage.ts`, `src/lib/campaigns/connection.ts` | already `if (LOCAL_DB)`-guarded | fine |

Roughly 12 modules, most of them small tenant-doc CRUD the existing seam can
absorb. `google/token.ts` and `account/sessions.ts` are the two that need real
thought, because they hold OAuth material. Adamant without Výkon is not the
product, so the campaigns subset is genuinely blocking.

This set is already *documented as deliberate* in
`src/lib/campaigns/store/backend.ts` ("deliberately OUT of scope … may 500
offline") — it is a known, bounded backlog, not a surprise.

### Gap 4 — Packaging (BLOCKING, effort M)

There is **no Dockerfile, no docker-compose, no Helm chart**. Deployment is
Vercel-only: `vercel.json` plus `docs/deploy.md`, whose entire runbook assumes
Vercel. Six crons live in `vercel.json` and have no in-repo scheduler
(`src/app/api/projects/orphans/route.ts:22` says as much: "there is no per-user
scheduler in this app").

Also: the SQLite file defaults to `SYSTEDO_DB_FILE || <cwd>/.data/systedo.db`.
A cwd-relative default is the classic self-host footgun — a service launched from
a different directory opens a *different, empty* database. And there is **no
backup, export, VACUUM or retention script anywhere**; `scripts/` has only
`seed-local-db.mjs`. You cannot tell people to self-host and give them no way to
back up.

Design: [`self-hosting.md`](./self-hosting.md#5-packaging).

### Gap 5 — Unmetering, in two switches (BLOCKING, effort S + M)

Two independent meters, both of which must pass on a paid route:

1. **Per-user daily quota** — `src/lib/usage.ts` `consume(userId, kind, amount)`,
   a Firestore transaction on `usage/{userId}`, day key in Europe/Prague, kinds
   `aiEval | sync | image`, with a `refund()` compensator. **6 call sites.**
2. **Per-IP durable window + global daily ceiling** —
   `src/lib/ai/durable-limit.ts` `durableGuard(ip, rules, { spendUnits })`; one
   transaction does both the per-IP fixed windows and the `_global_YYYY-MM-DD`
   counter. **11 call sites**, 3 of them via `guardPaidGeneration` in
   `src/lib/ai/paid-guard.ts`.

That is 17 call sites and **two** edits:

- `src/lib/usage.ts` — the seam **already exists**. `getUsage`, `getUserPlan`,
  `consume` (returns `{ok:true}`) and `refund` (no-op) all early-return under
  `if (LOCAL_DB)`. Widen the predicate to `LOCAL_DB || SELF_HOSTED`. ~5 lines,
  covers all 6.
- `src/lib/ai/durable-limit.ts` — add an early
  `if (SELF_HOSTED) return { ok: true, retryAfter: 0 }` at the top of
  `durableGuard`. Covers all 11 + `paid-guard.ts`. Leave `AI_MAX_CONCURRENT`
  alone: it is a sanity limit, not a commercial one, and it is already
  env-tunable.

The **M** part is UI honesty, and it matters: `/cena`,
`src/app/app/[projectId]/ucet/` and the header usage meter must render
"self-hosted — unlimited" rather than plan cards nobody can buy. `plans.ts`
already has the right abstraction — `aiAllowanceKind()` returns
`"capped" | "unlimited-via-own-key"`; add `"unlimited-self-hosted"` and carry it
through cs+en parity.

Shipping a self-host build that 402s its own operator is the single most
embarrassing possible bug for this positioning.

---

## 3. Two areas that are already fine

**The LLM layer is ahead of where kp started.** One chokepoint
(`generateStructured()` in `src/lib/llm/index.ts`), a type-system-enforced
deterministic `demo: () => T` on every operation, BYOM shipped with six vendors
(`openai · anthropic · gemini · openrouter · qwen · ollama`), per-user keys
encrypted at rest, and a key store that **already has both backends**. Ollama is
already wired (`src/lib/llm/byom/adapters.ts:490-491`, `OLLAMA_BASE_URL`
defaulting to `http://localhost:11434/v1`). Two small changes remain: ungate BYOM
in self-host mode (`plans.ts:44-46`), and stop keying provider order off
`NODE_ENV` (`src/lib/llm/provider-order.ts` + `src/lib/llm/index.ts:54`) so a
self-hoster's Claude CLI subscription is not demoted behind Gemini. Both **S**.

**Telemetry and git hygiene are clean.** LightTrack is opt-in and off by default,
with a loopback default endpoint and no external host baked in. Sentry is
errors-only: `tracesSampleRate: 0`, no build plugin, no source-map upload, no
session replay, and it returns immediately without a DSN. There is no Vercel
Analytics, PostHog, Plausible, GA, Mixpanel or Amplitude anywhere in `src/` or
`package.json`. `.gitignore` covers `.env*` (with `!.env.example`), `*.pem` and
`/.data`; a full history scan for added `.env`, service-account, `.pem`, `.p12`
and credential filenames finds **only `.env.example` was ever committed**.

---

## 4. Corrections to prior beliefs

Two things previously recorded as facts are wrong, and acting on them would waste
a sprint.

**"The campaigns store has no `LOCAL_DB` branch" — refuted.** It does, via the
generic document-backend seam at `src/lib/campaigns/store/backend.ts` →
`local-docs.ts`, which serves the `campaigns / series / reports / snapshots /
tenant` quintet. What is genuinely missing is the *narrower* list in Gap 3 above
— alerts, mutations, control-plane, anomaly-alerts, report-config — which that
same file explicitly documents as out of scope.

**"The `db.ts` migration ledger drops new tables" — refuted; the hazard is the
inverse, and it is fixed.** `src/lib/db.ts` uses a `schema_version` ledger;
`MIGRATIONS[]` is append-only and contiguous from 1; **v1 is the entire `SCHEMA`
string**; v2..v20 are additive ALTER/CREATE with an `applied(db)` probe so a
pre-ledger database is stamped rather than re-run. **Nothing is ever dropped** —
the only `DROP TABLE` lives in the unused `rebuildTable()` helper. The real
historical bug was the opposite: a table added to `SCHEMA` *only* never reaches
an existing database, because v1 never re-runs. That bit seven tables, was fixed
by migration v20, and is now pinned by `test-unit/db-migrations.test.mjs`.

**One residual gap found while checking that.** The guard test compares only
`type='table'` in `sqlite_master`. An **index** added to `SCHEMA` without a
migration entry reaches fresh databases but never existing ones — and the test
still passes. A silent performance regression across upgrades. **Effort S**,
worth fixing before self-hosters start upgrading real databases.

---

## 5. Go-public hygiene checklist

Everything here is **blocking the flip**, and none of it is code.

### 5.1 Decide the fate of the agent-harness directories

These are tracked today. Several read as internal tooling and will confuse a
contributor arriving from a search result. Decide per directory: **publish**
(with a README explaining what it is), **gitignore**, or **move to a private
repo**.

| Path | Tracked files | What it is |
| --- | --- | --- |
| `.claude/` | 157 | agent skills, settings, local harness config |
| `docs/harness/` | 301 | agent-harness documentation |
| `uat/` | 123 | simulated-UAT Character overlay — may name plausible-sounding people |
| `tiger/` | 42 | LLM call-site scan vault |
| `test-llm/samples/` | 20 | recorded model inputs/outputs — **check for real client data** |
| `.impeccable/` | 2 | design-scan state |
| `kpi-sim/` | 1 | KPI simulation config |
| `mvp-passport.json` | 1 | launch-readiness state |

`casesim/` was listed as a concern but **does not exist in this repository** — it
belongs to the sibling project. `.perfect/`, `.outreach/` and `.personas/` are
already untracked; verify they stay that way.

Recommendation: publish `.claude/` (skills are interesting and harmless once
reviewed) and `docs/harness/` behind a one-paragraph "this repo is built with an
agent harness" note; move `uat/`, `tiger/`, `kpi-sim/`, `.impeccable/` and
`mvp-passport.json` to a private repo — they are operational state, not product.
`test-llm/samples/` needs a file-by-file read before any decision.

### 5.2 Secret scan and rotation

- Run `gitleaks detect --no-git` **and** `gitleaks detect` (full history), plus
  `trufflehog git file://.` as a second opinion. A filename scan is already clean
  but does not prove no key was ever pasted *inside* a tracked file — a doc
  example, a test fixture, a recorded sample.
- **Rotate every credential that has ever touched a dev machine**, regardless of
  scan results: `GEMINI_API_KEY`, `LEONARDO_API_KEY`, `SKLIK_API_TOKEN`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `CRON_SECRET`,
  `AUTH_SECRET`, `CATALOG_TOKEN_SECRET`, `BYOM_KEY_SECRET`, `RESEND_API_KEY`,
  `META_APP_SECRET`, `LINKEDIN_CLIENT_SECRET`. Cheap insurance.
- Grep for operational leakage a public repo exposes: the maintainer's personal
  address (currently **zero hits in tracked files** — keep it that way), default
  `ADMIN_EMAILS` values, internal hostnames, the `.data/firebase-sa.json` path
  convention, and any real customer name in `test-llm/samples/` or `uat/`.

### 5.3 `.env.example`

Done as part of this pack: translated to English and completed. What was missing
and is now documented — `CATALOG_TOKEN_SECRET`, `BYOM_KEY_SECRET`, `ADMIN_EMAILS`,
`SYSTEDO_DB_FILE`, `AI_GLOBAL_DAILY_CEILING`, `AI_CEILING_FAIL_CLOSED`,
`TRUSTED_PROXY` / `TRUSTED_PROXY_HOPS`, `META_APP_ID` / `META_APP_SECRET`,
`LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`, `TWIN_SMTP_URL`,
`CLAUDE_CLI_PIN`, `OPENROUTER_API_KEY` / `QWEN_API_KEY`, `PATTERNS_EMBED_TIMEOUT_MS`,
`GOOGLE_APPLICATION_CREDENTIALS`, plus a proposed-but-unwired
`NEXT_PUBLIC_SOURCE_REPO_URL` (the AGPL §13 source link, marked as not yet read
by any code).

> **Naming correction.** The prior analysis named `TOKEN_CRYPTO_KEY` as the
> missing connector-token secret. That variable **is not read anywhere in
> `src/`** — it survives only in a comment and an error string in
> `src/app/api/cron/catalog-sync/route.ts:43,49`. The variable actually consulted
> by `src/lib/inventory/token-crypto.ts:43` is **`CATALOG_TOKEN_SECRET`**
> (falling back to `AUTH_SECRET` / `NEXTAUTH_SECRET`). `.env.example` documents
> the real name; the stale strings in the cron route should be corrected in a
> later code pass.

### 5.4 Metadata and README

- `package.json` is `"private": true` with **no `"license"` field**. Add
  `"license": "AGPL-3.0-only"`. Keeping `"private": true` is fine — it prevents
  an accidental `npm publish` — but say so in a comment or a doc rather than
  leaving it looking like an oversight. *(Not done in this pack: `package.json`
  was outside its write set.)*
- The README is Czech and stays Czech for its home-market audience, but the
  OSS-facing surfaces — this document, `self-hosting.md`, `CONTRIBUTING.md`,
  `SECURITY.md`, `.env.example` — are English, and the README's new
  "License & self-hosting" section is English so a stranger can orient.
- `AGENTS.md` opens with a block that `next dev` writes and re-writes on its own.
  That is now explained at the bottom of `CONTRIBUTING.md` so it does not read as
  a stray commit.

---

## 6. Consolidated backlog

| # | Item | Area | Effort | v1? |
| --- | --- | --- | --- | --- |
| 1 | `SELF_HOSTED` deploy-mode seam; ungate `LOCAL_DB` + `firebasePreflight` in production | auth/data | M | **done 2026-08-25** (`src/lib/deploy-mode.ts`) |
| 2 | Credentials (operator-password) auth provider + JWT sessions in self-host mode | auth | M | **done 2026-08-25** (`src/auth.ts`; styled login page still open) |
| 3 | Local twins for the ~7 blocking Firestore-only modules | data | M | **blocking — the main remaining gap** |
| 4 | Unmeter: `usage.ts` predicate + `durableGuard` early return | billing | S | **done 2026-08-25** |
| 5 | Dockerfile + docker-compose (`output: "standalone"`, cron sidecar) | packaging | M | **done 2026-08-25** |
| 6 | LICENSE / CLA / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT / `package.json` license | legal | S | **this pack** |
| 7 | English `.env.example` + `docs/open-source/*` + README section | docs | M | **this pack** |
| 8 | Secret scan, credential rotation, harness-directory decisions | hygiene | S | **blocking** |
| 9 | BYOM unconditionally on in self-host; provider order off configured providers, not `NODE_ENV` | llm | S | **done 2026-08-25** |
| 10 | `db:backup` script + absolute `SYSTEDO_DB_FILE` requirement + boot WAL checkpoint | data | S | **blocking** |
| 11 | Two hard 400s (`images/nobg`, `images/upload-ref`) → graceful degradation | image | S | **blocking** |
| 12 | Self-host-honest plan/usage UI (`aiAllowanceKind` + cs/en parity) | billing | M | v1 |
| 13 | Migration guard test: cover indexes, not just `type='table'` | data | S | v1 |
| 14 | Vision + embeddings routed through BYOM keys | image | M | v1.1 |
| 15 | Filesystem asset store for Creative Studio (replacing Firebase Storage) | image | M | v1.1 |
| 16 | In-process `node-cron` under `instrumentation.ts` | crons | M | v1.1 |
| 17 | Multi-user self-host auth (sqlite Auth.js adapter, passkeys) | auth | L | v1.1 |
| 18 | `OFFLINE=1` egress guard | hygiene | M | v2 |
| 19 | BYOM image vendor (ComfyUI / SDXL / Replicate) | image | L | v2 |
| 20 | Postgres backend for multi-replica self-host | data | L | v2 |

Items 6 and 7 were delivered by the original documentation pack. The guard
inversion landed on 2026-08-25 as five commits (items 1, 2, 4, 5, 9 — deploy
mode, operator auth, unmetering, Docker packaging, cron sidecar), following the
design in [`self-hosting.md`](./self-hosting.md), which now carries the
per-section implementation status. Item 3 — the Firestore-only campaign
modules, including `google/token.ts` (live Google Ads) and
`account/sessions.ts` — is the main gap still standing between "boots and
works self-hosted" and "the entire product self-hosted".
