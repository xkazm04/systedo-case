# Deploy runbook — Adamant on Vercel

How to ship, verify, and roll back the production deployment. Env vars are
listed by NAME only — values live in the Vercel project settings (and locally
in `.env.local`, which is gitignored). `.env.example` is the annotated source
of truth for what each variable does.

## The manifest — this page's machine-readable half

Everything below is prose, and prose drifts. The same facts are declared as data in
[`.github/environments.json`](../.github/environments.json): the runtime the platform
must give us, the schedules it must fire, and every environment variable the
deployment reads, each classified by what its absence costs and whether it reaches the
browser.

```bash
npm run env:manifest         # print the declared target
npm run env:manifest:check   # …and fail on drift
```

The check diffs that declaration against `vercel.json`, `package.json`,
`next.config.ts`, `.env.example`, the workflows and this page, and the same comparison
runs on **every build** (`test-unit/environment-manifest.test.mjs`, inside
`npm run test:unit` → `npm run check:ci` → `.husky/pre-push`). So a cron nobody
declared, a Node bump in one workflow and not the others, or a new variable classified
nowhere refuses the push rather than surfacing after a deploy.

**It reads the repository, not the Vercel project.** What is actually configured
there — whether a secret is set, which region a function landed in, whether the
Firestore TTL policy below exists — is not in any committed file, and the manifest's
`cannotSee` list says so. That half is § Post-deploy verification, and it is the
operator's.

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
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_WEBHOOK_URL` | Cron alert e-mails / Slack-style webhook (log-only without them) — the OPERATOR's single destination. `RESEND_API_KEY` also enables **real twin delivery**, see below |

| `WEBHOOK_SECRET_KEY` | Encrypts each project's own outbound-webhook signing secret at rest (falls back to `AUTH_SECRET`). Without either, the per-project webhooks card refuses to register a destination rather than store a plaintext secret. Changing it invalidates every stored secret — a mass re-mint |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Live Google Ads sync (sample data without them) |
| `SKLIK_API_TOKEN` | Live Sklik data-in sync (one token per instance for now) |
| `AI_RATE_PER_MIN`, `AI_RATE_PER_DAY`, `SYNC_RATE_PER_MIN`, `AI_MAX_CONCURRENT`, `AI_MAX_BODY_BYTES` | Per-IP AI rate limits (defaults in code) |
| `AI_GLOBAL_DAILY_CEILING`, `AI_CEILING_FAIL_CLOSED` | Global daily AI spend ceiling (durable Firestore guard) |
| `LIGHTTRACK_URL`, `LIGHTTRACK_PROJECT`, `LIGHTTRACK_KEY`, `LIGHTTRACK_SOURCE`, `LIGHTTRACK_ENABLED` | Optional self-hosted LLM observability mirror |

<!-- S2 -->
**`RESEND_API_KEY` is a two-in-one switch, and the second half sends mail to your
customers' customers.** Setting it makes the twin's `email` connector selectable on
the `email` and `leads` channels; an approved draft on a channel using it is
genuinely mailed to the recipient, and there is no undo. On a channel the operator
set to `autonomy: "auto"`, the half-hourly `twin-dispatch` ledger step also drafts an
answer to an arrived message, self-approves it when it clears the channel's
confidence bar with zero flagged risks, and delivers it — with no human click at all.
Three server-enforced brakes stand in front of that, all set in Správa kanálů and all
decided inside the same transaction that marks a draft `sent`: keep a channel on
**assist** and every message waits for a person; set a **weekly send limit** and the
claim refuses the send that would break it; switch on **require consent** and nothing
goes out to a contact without a recorded, in-force grant for that channel's purpose
(no linked contact, no record, or an unreachable CRM all refuse — the gate fails
closed). Grants are recorded per contact in the CRM detail. Retired with this change:
`TWIN_SMTP_URL` — there is no SMTP transport and no `nodemailer` dependency, and a
stored `email-smtp` connector id is read as `email`.
<!-- /S2 -->

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

- [ ] `npm run check:ci` green locally. Its stages are listed once, under the
      Delivery contract below (`npm run delivery:chain` prints them); this line
      deliberately does not restate them, because the copy that gets restated is
      the copy that falls behind. `.husky/pre-push` runs it for you on any push
      to `master`.
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

- **The full blocking gate is `npm run check:ci`**, and it is declared exactly
  once — in `package.json`. These are its stages, in the order they run,
  cheapest first:

  <!-- BEGIN:check-ci-chain — generated by `npm run delivery:chain -- --write`; edit package.json, never this list -->
  `adr:check` → `docs:parity` → `agents:surface` → `checkpoint:check` → `actions:check` → `sast` → `merge-gate` → `contract:ledger:check` → `context:decay:check` → `review:agent:gate` → `llm:gate:check` → `llm:quality:check` → `llm:budget:check` → `seed:check` → `test:unit` → `check`
  <!-- END:check-ci-chain -->

  It is CI's exact contract — `.github/workflows/ci.yml` runs that same chain
  through `check:ci:timed`, which parses the stages out of the same `check:ci`
  entry — and **`.husky/pre-push` enforces it on every push that updates
  `refs/heads/master`**. Other branches push freely; CI covers them.
- **And that three-way alignment is a check now, not a comment.** `ci.yml` used
  to open by asking the reader to keep itself, the `check:ci` script and the
  pre-push hook pointing at each other; it was the one alignment here held by
  good intentions, and the list above had already fallen five stages behind —
  it did not mention `sast`, which is the stage that stops a route shipping with
  no caller identity. `npm run merge-gate` (blocking, inside `check:ci`,
  therefore inside the hook) now fails when a stage is not a real npm script,
  when the hook runs anything less than the whole chain, when `ci.yml` never
  names a stage it runs, or when the list above stops being the chain.
  `npm run delivery:chain` prints it; `-- --write` regenerates the block.
  Rules and reasons: `scripts/lib/delivery.mjs`.
- **The rubric review blocks here, not only on a pull request.**
  `review:agent:gate` is Part A of
  [`.github/agent-review-rubric.md`](../.github/agent-review-rubric.md)
  (`scripts/agent-review.mjs --base origin/master`), the same code
  `agent-review.yml`'s `mechanical` job runs. It is in `check:ci` because a
  required status check only bites on a PR: on a direct push the workflow's
  verdict arrives *after* Vercel has begun building, so a finding would have been
  a comment on a release rather than a gate before one. In CI's `check` job the
  stage is a deliberate no-op — that checkout is shallow, `origin/master` is the
  pushed commit, the diff is empty — while the dedicated job does the real review
  with full history. `test-unit/delivery-contract.test.mjs` fails if either
  wiring is removed.
- **The review leaves a trail on the change it judged.** On the push path there is
  no pull request to comment on, so the verdict has to be attached to the commit
  itself: the workflow runs Part A with `--annotate`, and each finding becomes a
  check annotation anchored to its file and line — readable from the commit, from
  the Checks tab, and inline on a PR's Files view. The report is also kept as the
  `mechanical-review` artifact (`mechanical.md` plus `mechanical.json`) for 90
  days, which outlives the weekly triage cycle. A pull request always gets a
  comment: Part B's review, or Part A's report when no `ANTHROPIC_API_KEY` is
  configured. And once a week
  [`agent-review-history.yml`](../.github/workflows/agent-review-history.yml)
  (`npm run review:agent:history`) reads those annotations back and reports which
  rubric rules have actually been firing — reporting rung, never blocking, because
  it needs the network and a token and so can never be proven in `check:ci`.
- **What may stop a change is enumerated, not remembered.**
  [`.github/required-checks.json`](../.github/required-checks.json) lists the
  jobs that must be green — including the rubric review of the diff — with the
  reason each one earns a red build. `npm run merge-gate` (inside `check:ci`,
  therefore inside the pre-push hook) fails if one of them is renamed, stops
  running on pull requests, or gains a `continue-on-error` on a step that is not
  declared reporting-rung. Because master ships on push, that list is doing two
  jobs: it is what a contributor's PR is required to pass, and it is what the
  maintainer's own push cannot get around without `SYSTEDO_SKIP_GATE=1`. Keep
  GitHub's *Settings → Branches → require status checks* a copy of that file;
  the file is the source.
- **And the copy is written down, then checked.**
  [`.github/branch-ruleset.json`](../.github/branch-ruleset.json) is that GitHub
  side as the literal Rulesets payload — apply it with the `gh api` line in its own
  header. `npm run merge-gate` fails when its required contexts stop being exactly
  the enumerated `check` strings (offline, blocking, so it holds in the pre-push
  hook), and `npm run protection:verify` reads what GitHub is really enforcing and
  reports it check by check. The weekly history workflow runs that verification and
  appends the answer to the published trail issue — reporting rung, because it
  needs a token. Note what it can see: rulesets, not classic branch protection, so
  a "no" there means *no ruleset requires this check*, not *the branch is open*.
  The admin bypass in that payload is deliberate — master ships on push, and
  without it the ruleset would refuse the release act itself; `.husky/pre-push` is
  what governs the maintainer.
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

**And something now asks whether the rollback is needed, instead of waiting for
you to notice.** Every gate in this repository runs *before* the push, and the
push is the release — so for the minutes that matter most nothing was looking.
[`.github/workflows/post-deploy.yml`](../.github/workflows/post-deploy.yml) fires
on the same push, polls `/api/health` (the readiness probe that already existed
and that nothing was wired to) for up to five minutes through
[`scripts/post-deploy-verify.mjs`](../scripts/post-deploy-verify.mjs), and fails
the run when the release does not report `ok`, when Firestore is unreadable with
credentials present, or when the guard answers 401 — the last of which is also a
cron outage, since they share `CRON_SECRET`. The verdict is kept as a 90-day
artifact, so "was the release on the 3rd healthy?" is answerable later.

It needs two things configured and **says so loudly when they are not**: the
deployment URL in the repository variable `ADAMANT_HEALTH_URL`, and `CRON_SECRET`
as a repository secret. Without them it records `status: "skipped"` with the
reason rather than a green it did not earn — declared as the `post-deploy-verify`
capability in [`scripts/harness-degradation.mjs`](../scripts/harness-degradation.mjs).

**It does not revert for you, on purpose.** An automatic revert needs a token that
can write `refs/heads/master`, which on this topology is a release under the
operator's name — `AGENTS.md` § Red. The job holds `contents: read`. What changed
is that the rehearsed rollback below now starts from an automatic dated signal
instead of from somebody opening the app.

[`runbooks/revert-drill.md`](runbooks/revert-drill.md) is the rehearsal — a
seeded fault on one of the seams that matter, timed from "applied" to "tree clean
again", with the detection layers ranked by when they fire and what each one
cannot see. **Its two machine legs now run themselves**: `npm run revert:drill`
(`scripts/revert-drill.mjs`), fired weekly and on demand by
[`.github/workflows/revert-drill.yml`](../.github/workflows/revert-drill.yml),
which proves the tree is green, seeds the fault, records which layer caught it
and after how long, then removes the seed and asserts the file is byte-for-byte
what it was — and publishes the dated row into a trail issue. **The promote leg
is still the operator's and still unmeasured**, so how long the live site stays
wrong is the number this contract still owes. The runbook also now states what a
promote does *not* take back (uploaded conversions, sent mail, Firestore
documents written under a new shape, crons that fired in the window), which is
the question to answer before choosing promote over fix-forward. Note what the
detection ranking already shows without a stopwatch: layers 4 and 5
(Sentry, cron alerts) are inert in this deployment because their env vars are
absent (see the production env gap above), so a change that clears `check:ci`
and then misbehaves at runtime is currently detected by somebody looking.

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
routes fail (prod refuses the ADC fallback by design), and all six crons
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

1. ~~**e2e-smoke: 17/23 failing, ~30 min.**~~ **FIXED 2026-08-28** on
   `ship/adamant-stabilize`; the diagnosis recorded here on 2026-08-27 was
   wrong on both counts and is kept so nobody re-derives it.

   **The actual cause was one line of product code.** `22746f17` (2026-08-05,
   "flip the authoring direction to en-source") changed
   `src/lib/format.ts:41` `DEFAULT_LOCALE` from `cs` to `en`. The locale is a
   cookie (`src/lib/i18n/locale.ts`) and a fresh Playwright browser carries
   none, so every page rendered **English** — while five specs assert Czech
   copy. Every Czech locator missed; the test-id and role assertions in the
   same files kept passing, which is why it read like a partial page failure.
   The last green run is 2026-08-05T21:24Z and that commit landed at 23:55Z
   the same day: it was red on the very next run and stayed red for 22 days.
   A second, independent cause hit the two authed specs — the workspace
   anchor `Adamant — domů` drifted to `Adamant: domů` in the CS-DASH sweep
   (`1038216d`), so `gotoAppHub` reported "gate" on a `DEV_AUTH` server.

   **What the old entry blamed, and why neither was it.** The
   `Error: Route "/": … unstable value new Date() while prerendering` lines
   are dev-server log noise: the routes still render and every spec on them
   passes once the locale matches. The Firestore
   `Unable to detect a Project Id` lines are caught and fall back by design —
   proven by re-running the whole suite locally with `.env.local`/`.env`
   removed entirely (no Firebase env, no `GEMINI_API_KEY`): green. Both
   remain worth their own cleanup; neither was failing a test.

   Fix: `tests/support.ts` (a `pinLocale` fixture + one shared `gotoAppHub`
   whose two anchors are mutually exclusive, so an anchor drift now FAILS
   instead of skipping) plus a per-spec locale pin. `/design-system` uses
   bilingual matchers instead, so its committed `en` visual baseline stays
   valid.
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

Six schedules in `vercel.json`, all hitting `/api/cron/*` with
`Authorization: Bearer $CRON_SECRET` (verified constant-time in
`src/lib/cron-auth.ts`):

| Route | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/sync` | `0 * * * *` (hourly) | Re-sync connected ad accounts + critical-campaign e-mail alerts |
| `/api/cron/catalog-sync` | `0 5 * * *` (daily 05:00) | Catalog/inventory sync |
| `/api/cron/digest` | `0 7 * * 1` (Mon 07:00) | Weekly digest e-mail/webhook |
| `/api/cron/report` | `0 6 * * *` (daily 06:00) | Report generation |
| `/api/cron/social` | `0 * * * *` (hourly) | Social publishing tick |
| `/api/cron/ledgers` | `30 * * * *` (hourly, :30) | Ledger step registry — runs every due step in `src/lib/cron/ledgers.ts` |

`/api/cron/ledgers` is the **shared** slot: it is one schedule and one guard for
every ledger-shaped background job (conversion drain, webhook retry, go-link
rollup, social read-back). A new job registers a step in
`src/lib/cron/ledgers.ts` (`LEDGER_STEPS`) with its own `due()` cadence — no new
`vercel.json` entry, no new route. It is offset to :30 so it never contends with
the hourly `sync`/`social` tick, and each invocation writes one `cron_runs` row
carrying per-step counts plus each step's `lastRunAt` (which is how a step's
cadence survives across runs). One step failing never stops the others.

<!-- S3 -->
### Nahrávání konverzí do Google Ads (the `conversion-drain` step)

The one background job in this deployment that writes to a **third party
irreversibly**: it POSTs offline click conversions to
`customers/{cid}:uploadClickConversions`, and Google counts a gclid twice if it is
sent twice. Operational facts an on-call reader needs. It runs only where
`GOOGLE_ADS_DEVELOPER_TOKEN` is set (no token → the step reports zero work and
`ok`, so a preview deploy can never upload) and only for a project whose owner has
**approved** the mapping in Nastavení after a dry run inside the previous 24 h —
the approval is a `project_state` blob (`conversionUpload`, `http:false`), so it
cannot be minted by a client PUT. It claims one period per project per day
(`claimSentPeriod(tenant, "ledger-conversion-drain", <YYYY-MM-DD>)`); the claim is
**released** when the transport threw (network / 401 / 429 / 5xx) so the next
hourly tick retries, and **kept** on a permanent 4xx so a misconfigured account is
retried tomorrow rather than hammered hourly. Every accepted row is marked
`uploaded` in the same pass the acceptance is read, and the drain's query excludes
marked rows — which is why replaying the step is safe and why **restoring the
`conversion_events` table from a backup taken before an upload is not**: the
restored rows would have lost their markers and would be sent again. There is no
migration to roll back (the marker rides the event JSON); reverting the code leaves
approved mappings inert and already-uploaded conversions in Google, which is the
irreversibility this feature accepts and bounds with the dry run. Only gclid,
conversion action, time, value and currency leave the product — no identity field
is on the wire. Sklik has no live path and stays the hand-mapped CSV.

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

**Two of these are automatic now.** `.github/workflows/post-deploy.yml` fires on the
same push that ships the release and runs `scripts/post-deploy-verify.mjs`, which (1)
polls `/api/health` until the new deployment answers and (2) times the public routes
in [`.github/post-deploy-budgets.json`](../.github/post-deploy-budgets.json) against
the ceiling each one is allowed. A route over its ceiling — or one that does not
answer 2xx at all — **fails that run**, which is the only number in this repository
that can go red *after* the merge. The verdict, with every measurement, is kept as a
90-day artifact (`post-deploy.json`).

It does **not** revert: that would need a token able to write `refs/heads/master`, and
the job holds `contents: read`. A red run is the trigger for the rollback below, which
is rehearsed weekly by `npm run revert:drill`. Without `CRON_SECRET` and
`vars.ADAMANT_HEALTH_URL` the run records `skipped` rather than a green it did not
earn — the release then ships unverified, and the checklist below is all there is.

- [ ] `https://<host>/` renders the landing page (no 500, correct brand).
- [ ] `https://<host>/app` resolves — redirects to sign-in when logged out
      (a crash here means Firestore/auth env is broken).
- [ ] `https://<host>/robots.txt` shows the **production** policy: `Allow: /`
      with `Disallow: /app` + `Disallow: /api` and a sitemap line. If it shows
      a blanket `Disallow: /`, the deploy is not `VERCEL_ENV=production`
      (preview deploys are crawl-blocked by design — `src/app/robots.ts`).
- [ ] One cron route answers 401 without the bearer token.

<!-- S1 -->
## Sklik writes

`SKLIK_WRITES_ENABLED` arms REAL Sklik campaign mutations (daily budget, pause /
resume) from the ad-ops control plane. It is **off by default** — only the exact
value `1` arms it — because one input to the write path, the Sklik JSON-RPC method
name, cannot be verified without a live account; the fixture suite proves the
payloads, but the **live proof is the owner's**, and it runs in this order. (1) In a
NON-production environment holding a real Sklik token, set `SKLIK_WRITES_ENABLED=1`
and confirm `npm run doctor` reports "zápisy do Skliku ZAPNUTÉ". (2) In that Sklik
account create a THROWAWAY test campaign with a small daily budget, and make sure
the connection's money unit is settled — the console refuses the write outright
while the verdict is `halere-suspected` or the account has never been evaluated.
(3) In the console pick the Sklik network, propose a change set, and approve the
SMALLEST single-move set you can get (the confirm button reads "Potvrdit zápis do
Skliku" — if it does not, you are pointed at Google Ads). (4) Verify in the Sklik
web UI that the two campaigns' daily budgets actually changed by the amount the
ledger states. (5) Revert the set from the ledger row. (6) Verify in the Sklik UI
that both budgets are back to their exact prior values. (7) Only after 4 and 6 both
pass, set `SKLIK_WRITES_ENABLED=1` in production. If step 4 shows nothing changed,
the method name is wrong: fix `SKLIK_CAMPAIGN_UPDATE_METHOD` (and, for pause /
resume, `SKLIK_STATUS_ACTIVE` / `SKLIK_STATUS_SUSPEND`) in `src/lib/sklik/client.ts`
— that constant is deliberately the only thing to change — and start again at 3. To
disarm at any time, unset the variable and redeploy: with it off the console refuses
Sklik approvals with a message instead of writing, and nothing else in the product
changes.
