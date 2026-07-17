# Wave 17 — AI workspace pipeline · Twin (brand double + autopilot UI) · project/tenant API

Module-clustered tail wave: 3 High + 9 Medium + 1 Low = **13 findings, all fixed**.
Branch `vibeman/ambiguity-ui-2026-07-16`. tsc clean each commit (pre-commit hook), LLM
gate green throughout (no gated tool files touched), full `npm run test:unit`
**1730/1730** (baseline 1723 + 7 new tests, 0 regressions).

## Commits

| # | Commit | Finding |
|---|--------|---------|
| 1 | fix(ai-pipeline): link repurposed variants to /clanek not the non-existent /blog | ai-workspace-pipeline #1 (High) |
| 2 | fix(ai-handoff): mirror validator MIN floors into the seed mappers | ai-workspace-pipeline #3 (M) |
| 3 | fix(ai-experiments): actually strip undefined in persist() as the docstring promised | ai-workspace-pipeline #4 (M) |
| 4 | fix(ai-validation): clamp qualified<=leads and won<=qualified in lead-source diagnosis | ai-workspace-pipeline #5 (Low) |
| 5 | fix(twin): a disabled channel never self-approves a draft | twin-brand-double #4 (M) |
| 6 | fix(twin): own the machine-approval bit server-side so it can't be forged or laundered | twin-brand-double #2 (High) |
| 7 | fix(twin): getTwin returns the honest store timestamp instead of a dead blob field | twin-brand-double #3 (M) |
| 8 | fix(twin): a stored channel config always names a usable connector | twin-brand-double #5 (M) |
| 9 | fix(social-api): reject a scheduled post whose time is in the past | project-tenant-api #2 (High) |
| 10 | fix(projects-api): verify a wire projectId before it keys a tenant | project-tenant-api #4 (M) |
| 11 | docs(stores): document the projectId-only keying invariant on the six uid-less stores | project-tenant-api #5 (M) |
| 12 | fix(twin-ui): confidence meter colour follows the channel's own bar | twin-autopilot-ui #4 (M) |
| 13 | refactor(twin-ui): single source for the channel/scope label maps | twin-autopilot-ui #5 (M) |

## Narratives

- **#1** `draftToRepurposeRequest` built `${origin}/blog/${slug}`, but the app has no
  `/blog` route — the renderer is `/clanek`. Every distributed variant shipped a 404
  link. Added shared `ARTICLE_BASE_PATH = "/clanek"`; the renderer is a single article
  page (no per-slug segment) so the link is the base path. Test updated to assert the
  URL resolves and never contains `/blog`.
- **#3** New `src/lib/ai/field-limits.ts` holds min+max for the ad/brief fields; both the
  seed mappers (handoff/pipeline) and the validators now read it. Mappers omit/blank a
  below-floor field (honest empty required field) instead of a too-short value that fails
  the next step. Tests: seed clears its validator; below-floor fields omitted/blanked.
- **#4 (persist)** Implemented the long-promised undefined-strip (`JSON.parse(JSON.stringify)`)
  so the first optional field a future dev adds can't throw inside the Firestore txn.
- **#5 (lead-source)** Clamped `qualified<=leads`, `won<=qualified` before deriving rates,
  matching the peer clamp — `{leads:10,qualified:500}` no longer yields qualRate 5000 %.
- **#4 (decideDraft)** Added `cfg.enabled` to the autonomy gate: a switched-off channel
  can hold a pending draft but never a self-approved one.
- **#2 (twin audit)** `enforceAutonomy` now re-derives `autoApproved` for EVERY
  non-terminal draft (was only for client-claimed `true`), closing the laundering path
  (flip flag to false on a draft the gate would auto-approve). Documented at
  `sanitizeDraft` that lifecycle fields are shape-checked only and made trustworthy by
  the route guards (enforceAutonomy + send/route + mergeTerminalDrafts).
- **#3 (updated_at)** Both `getTwin` backends now select the row/doc timestamp and stamp
  it onto the returned state, so `ResolvedTwin.updatedAt` is a real "last saved".
- **#5 (connector)** New `storableConnectorId` (server-side; `configured` is env-dependent)
  reconciles each channel's connector in the twin save route: a typo or a
  known-but-unconfigured id degrades to `manual`, so a stored config always names a usable
  connector and send never throws connector-unconfigured on a config the UI accepted.
- **#2 (past schedule)** `social/posts` POST returns 422 when a supplied `scheduledAt`
  is >2 min in the past instead of silently publishing live; only an omitted `scheduledAt`
  means publish-now.
- **#4 (phantom tenant)** New shared `rejectUnknownProject` guard 404s a wire projectId
  that isn't the caller's, before it keys a tenant, in every handler of campaigns/share,
  microsite, social/posts and social/messages (keyless anonymous/no-project paths
  untouched).
- **#5 (store keying)** Added a shared KEYING INVARIANT note to the six uid-less dispatcher
  stores (competitors, cost-model, onboarding, organic-channels, local-signals, twin).
- **#4 (meter colour)** New pure `confidenceTone(confidence, threshold, riskCount)` keys
  the outbox confidence bar to the channel's own `autoThreshold` (+ risks), replacing the
  fixed 80/50 that disagreed with the autonomy verdict beside it.
- **#5 (label maps)** `CHANNEL_LABELS` moved into `twin/labels.ts`, `SCOPE_LABELS` derived
  as `{ generic, ...CHANNEL_LABELS }`; the three twin components import the shared maps.

## Verification

- tsc: clean on every commit (lint-staged `tsc --noEmit`).
- LLM gate: `✓ all tool contracts match their golden snapshots` on every commit; no
  `src/lib/ai/tools/*` schema/prompt changes.
- `npm run test:unit`: **1730 pass / 0 fail** (baseline 1723 + 7 new tests). No regressions.
- Untracked `uat/driver/*.mjs` left untouched; no package.json/deps/CI changes; no push.

## Behavior changes needing sign-off

1. **Repurpose back-link now points at `/clanek`** (was a 404 `/blog/<slug>`). If a real
   per-article route is planned, `ARTICLE_BASE_PATH` is the one place to extend.
2. **Scheduling a post in the past is now rejected (422)** rather than publishing
   immediately. Requests that intend publish-now must omit `scheduledAt` (a >2-min past
   value is treated as a mistake). Offset-less datetime interpretation was left as-is
   (still server-local) — flagged in the finding but not changed here.
3. **Tenant-keyed routes now 404 an unknown/stale projectId** (share/microsite/social)
   instead of silently serving/creating a phantom-tenant. A client passing a deleted or
   typo'd id now gets 404 where it previously got empty/lost data.
4. **A known-but-unconfigured connector (e.g. `email-smtp` without `TWIN_SMTP_URL`) now
   degrades to `manual` at save** instead of persisting and throwing at send time. Once a
   real SMTP connector is configured, its id persists normally.
5. **A draft on an `auto` channel that also clears the gate is recorded as
   `autoApproved:true`** even if the client asserted a human approval — the gate is now the
   authority on the machine-approval bit (prevents laundering; minor relabel of a
   genuinely-human approval that was above the bar anyway).

## Patterns

- **Client-owns-the-blob vs. audit-record** tension is resolved by keeping sanitize
  shape-only (client-safe) and making trust a ROUTE concern (enforceAutonomy /
  enforceConnectors / mergeTerminalDrafts). Connector "configured" and machine-approval
  are env/gate-dependent, so they can't live in the client-imported `types.ts`.
- **Two auth idioms** (`requireOwnedProject` vs `resolveTenant`) → the tenant idiom now has
  a matching existence check via one shared `rejectUnknownProject`.
- **Mirror-only-the-caps** was the shared root cause of the mapper/validator drift; a single
  min+max source (`field-limits.ts`) ties both sides.
- **Magic UI thresholds** (80/50) that duplicate a configurable domain value → replace with
  a pure helper keyed to the real value, unit-tested so meter and gate can't drift.
