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

- [ ] `npm run check:ci` green locally (typecheck + lint + build + seed check + unit + llm gate).
- [ ] **`DEV_AUTH` and `LOCAL_DB` are UNSET in the Vercel environment.** They
      are ignored in production by code, but an unset variable is the only
      configuration that cannot rot.
- [ ] `CRON_SECRET` set (cron routes fail closed, so a missing secret means
      silent no-op crons, not an open endpoint).
- [ ] `FIREBASE_SERVICE_ACCOUNT` present (prod crashes loudly without it
      unless `FIREBASE_ALLOW_ADC=true` is intentional).
- [ ] New env vars added to `.env.example` with a comment.

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
