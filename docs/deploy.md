# Deploy runbook — Adamant on Vercel

How to ship, verify, and roll back the production deployment. Env vars are
listed by NAME only — values live in the Vercel project settings (and locally
in `.env.local`, which is gitignored). `.env.example` is the annotated source
of truth for what each variable does.

## Environment variables (by name)

Required in production:

| Name | Why |
| --- | --- |
| `GEMINI_API_KEY` | Prod LLM provider (the dev fallback is the Claude CLI; without a provider, AI tools run in demo mode) |
| `AUTH_SECRET` | Auth.js session signing |
| `AUTH_TRUST_HOST` | `true` — callback URL behind Vercel's proxy |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth sign-in |
| `FIREBASE_SERVICE_ACCOUNT` | Full service-account JSON. Prod REFUSES silent fallback to ambient ADC (set `FIREBASE_ALLOW_ADC=true` only for an intentional ADC deploy) |
| `GOOGLE_CLOUD_PROJECT` | Firestore project id |
| `CRON_SECRET` | Bearer token Vercel Cron sends; cron routes fail closed without it |

Optional / feature-gating:

| Name | Feature |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for OG/canonical/share URLs (see host rename below) |
| `GEMINI_MODEL`, `GEMINI_VISION_MODEL`, `GEMINI_EMBED_MODEL` | Model overrides (cost table in `src/lib/llm/cost.ts` is keyed by model name) |
| `LEONARDO_API_KEY` | Creative Studio image generation (demo placeholders without it) |
| `FIREBASE_STORAGE_BUCKET` | Generated-asset library persistence |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_WEBHOOK_URL` | Cron alert e-mails / Slack-style webhook (log-only without them) |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Live Google Ads sync (sample data without them) |
| `SKLIK_API_TOKEN` | Live Sklik data-in sync (one token per instance for now) |
| `AI_RATE_PER_MIN`, `AI_RATE_PER_DAY`, `SYNC_RATE_PER_MIN`, `AI_MAX_CONCURRENT`, `AI_MAX_BODY_BYTES` | Per-IP AI rate limits (defaults in code) |
| `AI_GLOBAL_DAILY_CEILING`, `AI_CEILING_FAIL_CLOSED` | Global daily AI spend ceiling (durable Firestore guard) |
| `LIGHTTRACK_URL`, `LIGHTTRACK_PROJECT`, `LIGHTTRACK_KEY`, `LIGHTTRACK_SOURCE`, `LIGHTTRACK_ENABLED` | Optional self-hosted LLM observability mirror |

## Data stores — Firestore vs `.data/`

- **Production (Vercel)**: everything durable lives in **Firestore**
  (users, sessions, projects, usage metering, durable rate-limit counters).
  The serverless filesystem is read-only and ephemeral per instance — never
  rely on it for state.
- **Local dev**: `LOCAL_DB=true` swaps the store layer to **node:sqlite** files
  under `.data/` (`.data/systedo.db`, seeded by `npm run seed:local`), and the
  local Firebase service-account key is read from `.data/firebase-sa.json`.
  `.data/` is gitignored and must never be deployed.
- Both bypass flags are safety-fused: `DEV_AUTH` and `LOCAL_DB` are **ignored
  when `NODE_ENV=production`**.

## Telemetry retention (`llmTelemetry`)

Every `generateStructured` call writes one Firestore document to **`llmTelemetry`**
(cost, latency, tokens, status, extraction rung). Nothing in the request path
deletes them, so without a policy the collection grows for the lifetime of the
deployment — while its readers are already bounded (the per-project spend rollup
looks back **60 days** and caps its read at 5000 rows).

**Retention window: 90 days.** The readers' 60-day lookback plus a 30-day margin,
so a window the app actually renders can never be truncated by expiry, and one
quarter of history remains for an ad-hoc cost / prompt-drift investigation. The
number lives in code as `LLM_TELEMETRY_RETENTION_DAYS`
(`src/lib/llm/telemetry.ts`) — change it there and here together.

Enforcement is a **Firestore TTL policy**, not a cron: it deletes server-side, costs
no reads, and cannot fail silently the way a scheduled sweep can. The app's half is
that every write stamps an `expiresAt` **Timestamp** (`now + 90 days`) at the single
write door; a document written without it is never expired.

Create the policy **once per Firestore project** (it is not code-deployable):

```bash
gcloud firestore fields ttls update expiresAt \
  --collection-group=llmTelemetry \
  --enable-ttl \
  --project=<firebase-project-id>
# verify:
gcloud firestore fields ttls list --project=<firebase-project-id>
```

(Console equivalent: *Firestore → Time-to-live → Create policy* → collection group
`llmTelemetry`, timestamp field `expiresAt`.)

Notes:

- Deletion is asynchronous — Google documents expiry within ~24 h of `expiresAt`,
  so treat 90 days as a floor, not a deadline.
- Documents written **before** this shipped carry no `expiresAt` and will never
  expire. They are harmless (the readers window them out); delete them with a
  one-off `at < <cutoff>` sweep if the collection size matters.
- The local dev store (`LOCAL_DB=true`) does not use Firestore and has no TTL —
  `.data/` is disposable.

## Pre-deploy checklist

- [ ] `npm run check:ci` green locally (typecheck + lint + build + seed check +
      unit + llm gates + adr:check + agents:surface). `.husky/pre-push` runs
      this for you on any push to `master` — see the Delivery contract below.
- [ ] **`DEV_AUTH` and `LOCAL_DB` are UNSET in the Vercel environment.** They
      are ignored in production by code, but an unset variable is the only
      configuration that cannot rot.
- [ ] `CRON_SECRET` set (cron routes fail closed, so a missing secret means
      silent no-op crons, not an open endpoint).
- [ ] `FIREBASE_SERVICE_ACCOUNT` present (prod crashes loudly without it
      unless `FIREBASE_ALLOW_ADC=true` is intentional).
- [ ] New env vars added to `.env.example` with a comment.

## Delivery contract

This repo ships by **direct push to `master`** — there is no PR / merge-queue
stage between a developer and production. That makes the push itself the
release act, and the contract below is what keeps it honest.

- **The full blocking gate is `npm run check:ci`** (typecheck + lint + build +
  seed drift guard + unit suite + LLM gates + `adr:check` + `agents:surface`).
  It is CI's exact contract — `.github/workflows/ci.yml` runs the same script —
  and **`.husky/pre-push` now enforces it on every push that updates
  `refs/heads/master`**. Other branches push freely; CI covers them.
- **Escape hatch**: `SYSTEDO_SKIP_GATE=1 git push` skips the gate. The hook
  prints loudly what was skipped; the operator owes a **recorded reason**
  (commit message or this doc). An unrecorded skip is an incident.
- **Red master = outage.** Because of the race below, a red gate on master is
  not "CI is unhappy", it is "production is (or is about to be) broken".
- **After every master push**: `gh run watch --exit-status` — do not walk away
  until CI confirms what the local gate predicted.

### The race

**Vercel deploys `master` on push, regardless of CI's verdict.** The Git
integration and GitHub Actions are parallel consumers of the same push event —
CI going red does not stop, delay, or roll back the Vercel build. The
compensation is the pre-push gate above: prove CI's exact contract *before*
the push exists. Corollary: **keep `check:ci` equal to CI's blocking set
whenever either changes** — ci.yml, the `check:ci` script in `package.json`,
and `.husky/pre-push` cross-reference each other so the three cannot silently
drift.

### Node version authority

Four opinions on Node existed: `engines` said `>=22.5`, `.nvmrc` says `24`,
CI pins `24.14.0` exactly, and Vercel was unpinned. Resolved (2026-08-27):

- **`package.json` `engines` is now `"24.x"`** — Vercel selects its build/
  runtime Node major from `engines`, so this pins production to the same major
  as local dev and CI.
- **CI stays `24.14.0`-exact deliberately**: the Intl format goldens
  (`test-unit/fixtures/format-golden.json`) are byte-pinned to the minting
  version's ICU, and ICU shifts across Node minors. Do not loosen CI to `24.x`;
  do not tighten `engines` to a patch version (Vercel needs only the major).

### Rollback

Rollback is **promote the previous Vercel deployment**, not a git revert under
pressure — see [Deploy + rollback (Vercel)](#deploy--rollback-vercel) below
for the exact steps (`vercel promote <deployment-url>` / dashboard promote).
Fix forward in git afterwards.

### Vercel CLI identity

`.vercel/` is absent/gitignored, so the CLI is not linked to the project on a
fresh checkout. For CLI deploys or `vercel promote`, either run `vercel link`
once (recreates `.vercel/project.json`) or export
`VERCEL_ORG_ID` + `VERCEL_PROJECT_ID`:

```
VERCEL_ORG_ID=team_x2mjBAxi3mgsZkKQ1SJgkjqL        # identifiers, not secrets
VERCEL_PROJECT_ID=prj_FJLHnh7OQtLipEXldZHB1FEzcHp6  # linked 2026-08-27; also in .vercel/project.json
```

The Git-integration path (push to master) needs none of this.

### Production env gap (found 2026-08-27, owed)

`vercel env ls` shows the project holds **one** variable — `GEMINI_API_KEY`
(Production + Preview). Everything else in the required table above is absent
on Vercel: `AUTH_SECRET`, `AUTH_TRUST_HOST`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `GOOGLE_CLOUD_PROJECT`,
`CRON_SECRET`. Consequences today: sign-in cannot work, Firestore-backed
routes fail (prod refuses the ADC fallback by design), and all five crons
fail closed (no `CRON_SECRET`). The build is green because none of these are
build-time inputs — this is exactly the "deployed" versus "working" gap the
delivery contract warns about.

Operator recipe (values are typed interactively, never pasted into a file):

```
vercel env add AUTH_SECRET production
vercel env add AUTH_TRUST_HOST production        # true
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add FIREBASE_SERVICE_ACCOUNT production
vercel env add GOOGLE_CLOUD_PROJECT production
vercel env add CRON_SECRET production
```

Use production-grade values (a production OAuth client, a dedicated service
account) — not the local `.env.local` ones. Add Preview-scoped, lower-privilege
counterparts afterwards so previews prove behavior, not just layout. Redeploy
(or promote) after adding; env changes do not re-run a build on their own.

### Known red, owed

Red that exists on master today, documented so nobody re-diagnoses it. The
`check` job itself is green; these are the owed items around it.

1. **e2e-smoke: 17/23 failing, ~30 min.** Two independent causes:
   - `new Date()` evaluated in prerendered shells crashes under Next's
     `cacheComponents` on `/`, `/app`, and `/ai-asistent`. Fix direction:
     replace `new Date()` in prerendered shells per the Next cacheComponents
     guidance (move it behind Suspense/dynamic, or pass time in from a dynamic
     boundary).
   - The e2e job has **no Firebase env** (`FIREBASE_SERVICE_ACCOUNT` /
     `GOOGLE_CLOUD_PROJECT`), so Firestore-backed server components 500. Fix
     direction: provide a scoped Firebase env to the e2e job, or make those
     specs env-guarded (skip when the env is absent).
2. **supply-chain "Secret scan": BLOCKING and red.** gitleaks over the full
   history reports **11 findings** (redacted output). The workflow's stated
   premise — "blocking because it passes today" — is now false. Owed work:
   **triage all 11 findings**, then land a `.gitleaksignore` with a
   per-finding reason for each entry that is a confirmed false positive. **Any
   real credential means rotation** (and history rewrite if warranted), not an
   ignore entry. The job **should stay blocking after triage** — the guardrail
   is right; the backlog under it is the debt.
3. **Dependabot dev-deps PRs: unmergeable.** `npm run lint` dies on them —
   `eslint-config-next@16.3.3` vendors a typescript-eslint that hard-refuses
   TypeScript 7. Nothing to fix locally; blocked until upstream
   (eslint-config-next / typescript-eslint) ships TS7 support. Close or
   snooze the PRs; do not force-merge past lint.

## Deploy + rollback (Vercel)

Deploys happen on push to `master` (Vercel Git integration) or explicitly with
`vercel deploy --prod`. Every production deploy is immutable and kept.

**Rollback = promote the previous deployment**, not a git revert under
pressure: Vercel dashboard → Project → *Deployments* → pick the last good
production deployment → **⋯ → Promote to Production** (CLI:
`vercel promote <deployment-url>`). This flips the alias atomically; fix
forward in git afterwards.

## Crons

Five schedules in `vercel.json`, all hitting `/api/cron/*` with
`Authorization: Bearer $CRON_SECRET` (verified constant-time in
`src/lib/cron-auth.ts`):

| Route | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/sync` | `0 * * * *` (hourly) | Re-sync connected ad accounts + critical-campaign e-mail alerts |
| `/api/cron/catalog-sync` | `0 5 * * *` (daily 05:00) | Catalog/inventory sync |
| `/api/cron/digest` | `0 7 * * 1` (Mon 07:00) | Weekly digest e-mail/webhook |
| `/api/cron/report` | `0 6 * * *` (daily 06:00) | Report generation |
| `/api/cron/social` | `0 * * * *` (hourly) | Social publishing tick |

## Host rename → adamant-named project (operator action)

The product is Adamant but the Vercel project is still `systedo-case`, so the
default production URL leaks the old name. Decision (2026-08-04): canonical
host = an adamant-named Vercel host; free during validation.

1. Vercel dashboard → Project → **Settings → General → Project Name** → rename
   (e.g. `adamant`). The production domain becomes `adamant*.vercel.app`;
   the old `systedo-case.vercel.app` URL stops resolving, so do this before
   sharing links.
2. Set **`NEXT_PUBLIC_SITE_URL`** in the project's production env to the new
   canonical origin (e.g. `https://adamant.vercel.app`, or the custom domain
   once one exists) and redeploy — OG tags, canonicals, the sitemap and share
   URLs all derive from it.
3. ~~Then update the hardcoded fallback in **`src/lib/site.ts`**~~ — done
   (2026-08-07): the fallback now reads `"https://adamant.vercel.app"`. If the
   Vercel project ends up under a different name or a custom domain, update the
   literal again so a build without the env var can never advertise a dead host.
4. Update the Google OAuth authorized redirect URI
   (`https://<new-host>/api/auth/callback/google`) in Google Cloud Console.

## Post-deploy verification

- [ ] `https://<host>/` renders the landing page (no 500, correct brand).
- [ ] `https://<host>/app` resolves — redirects to sign-in when logged out
      (a crash here means Firestore/auth env is broken).
- [ ] `https://<host>/robots.txt` shows the **production** policy: `Allow: /`
      with `Disallow: /app` + `Disallow: /api` and a sitemap line. If it shows
      a blanket `Disallow: /`, the deploy is not `VERCEL_ENV=production`
      (preview deploys are crawl-blocked by design — `src/app/robots.ts`).
- [ ] One cron route answers 401 without the bearer token.
