# WP S3 — Live conversion upload (Google click conversions), mapping-approved, dry-run first
card #2 (live half) · XL (narrowed to L: Google only; Sklik stays the hand sheet) · gate: **contract + irreversible** (rows reach a third-party processor; double-counting is the risk) · wave 4 · runs in PARALLEL with S1/S2 (no control-plane dependency)

## Goal
The W3-C conversion ledger reaches Google Ads: the operator picks a conversion action
(read via GAQL), runs a DRY RUN that shows exactly which rows would go (the exporter
seam's `build`, never posted), and APPROVES the mapping — a frozen record on
`project_state` (the inventory-plan "accepted, mutates nothing" precedent — a budget-
shaped change-set cannot express a mapping, verified); only then does a
`conversion-drain` ledgers step upload un-uploaded gclid rows through
`uploadClickConversions`, marks every accepted row `uploaded` in the same pass, records
per-row failures without marking, and claims one drain per project per day (the first
genuine `claimSentPeriod` claimant among the steps — the upload is NOT idempotent
against Google). Acceptance: mapping lifecycle pinned (dry-run required before approve;
approve freezes; unapprove stops the drain), the upload payload byte-pinned against the
CSV's own rows, double-upload impossible (pinned), partial failure leaves rows
retryable (pinned) — ≥30 assertions.

## Non-goals
- No Sklik live import (no documented API offline — the `sklik` exporter stays the
  hand-mappable sheet; the mapping card says so). No retraction of regressed conversions
  (documented at `conversion-events.ts:111-114`; a later rung). No value adjustments.
- No change-set envelope involvement (`control-plane*.ts`, `mutations.ts` untouched —
  S1 owns them this wave). No new tables: the `uploaded` marker rides the event's
  `data` JSON (`db.ts:669-679`), no migration.
- PII posture unchanged: gclid + time + value + currency + action, nothing else, exactly
  the CSV's columns; state the consent decision explicitly in the card copy
  ("odesíláme jen identifikátor kliknutí, čas a hodnotu").
- `src/lib/google/ads.ts` is CO-OWNED with S1b (which lands AFTER you): append in a
  `// ── S3 ──` region, never reformat, list hunks.

## Seams
- **Conversion-action read:** `src/lib/google/ads.ts` (S3 region) —
  `listConversionActions(token, customerId)`: GAQL `SELECT conversion_action.resource_name,
  conversion_action.name, conversion_action.type, conversion_action.status FROM
  conversion_action WHERE conversion_action.status = 'ENABLED'` via the (exported by
  S1b — if not yet exported when you build, export it yourself with a `// ── S3 ──`
  marker; the Director reconciles) `searchStream`; `AdsApiError` invariant (:30-34).
- **Upload:** `uploadClickConversions(token, customerId, rows, fetchImpl = fetch)` —
  POST `${BASE}/customers/${cid}:uploadClickConversions`, body
  `{ conversions: [{ gclid, conversionAction, conversionDateTime, conversionValue?,
  currencyCode }], partialFailure: true, validateOnly?: boolean }`, headers
  `adsApiHeaders` (:84-93); parse `results[]` + `partialFailureError` into
  `{ accepted: string[]; failed: Array<{ gclid; message }> }` (a row is accepted iff its
  index has a result and no partial-failure detail names it — document the mapping).
  `fetchImpl` is the injectable transport (ads.ts has none — this is the precedent;
  keep the default so callers are unchanged). `conversionDateTime` = the exporter's
  `pragueStamp` (`google-csv.ts:64`) — the ONE stamp format, reused not copied.
- **Payload = the exporter's rows:** `src/lib/conversions/google-upload.ts` (NEW) —
  `buildGoogleUploadRows(events, mapping, now)`: same filter as `buildGoogleConversionCsv`
  (:81-91: gclid rows only, kind per mapping), so the dry-run table, the CSV and the
  live payload can never disagree (pin: rows from the upload builder deep-equal the
  parsed CSV body for the same fixture). Implements `ConversionExporter` for the
  registry (`id: "google-live"`, `build` returns the JSON payload as `body` — the seam's
  `build` is pure/sync by design, `types.ts:1-13`; the POST lives in the drain).
- **Mapping record (NEW `src/lib/conversions/mapping.ts`, pure + store wrapper):**
  contract below; rides `project_state` key `conversionUpload`
  ({ owner: "kvalita-leadu", version: 1, http: false } — server-owned, the measurement
  rule) via the `outcomes-state.ts` CAS shape. Lifecycle (pure, pinned):
  `draft` (action chosen) → `dry-run` (`dryRunAt`, `dryRunRows`) → `approved`
  (`approvedAt`, frozen `conversionAction` + `kinds`) → `paused`; approve without a
  dry-run in the last 24h → refused; changing the action after approval → back to
  `draft` (must dry-run again).
- **Routes (NEW `src/app/api/projects/[id]/conversions/upload/route.ts`):**
  `requireOwnedProject`; GET (mapping + available actions via `listConversionActions`
  when ads is linked — `getAdsConnection`/`getUserAccessToken` the `mutations.ts:79-86`
  way; degrade to `actions: []` with `reason`), POST `{ action: "select" | "dry-run" |
  "approve" | "pause" }`; `dry-run` = `buildGoogleUploadRows` over un-uploaded events
  (≤ 500) and, when `validateOnly` is supported, `uploadClickConversions(...,
  {validateOnly:true})` — best-effort, its failure does not block a dry run; response
  carries rows + count + the first 20 rows for the table. Activity on approve/pause.
- **Marker:** `ConversionEvent` gains `uploaded?: { platform: "google-ads"; at: string;
  batchId: string; action: string }` and `uploadError?: { at; message; attempts }`
  (additive; the store's upsert by id writes it — `appendConversionEvents` is the
  writer, `conversion-store.ts:51`); `ConversionEventQuery` gains `uploaded?: boolean`
  (local: `json_extract(data,'$.uploaded') IS NULL`; firestore: mirror `uploaded` as a
  queryable field like `at`/`kind` :58-61).
- **Drain step (NEW `src/lib/conversions/drain-step.ts`):**
  `CONVERSION_DRAIN_STEP_ID = "conversion-drain"`, `due`: interval 1h; run =
  `listConversionTenants` (the rollup's join, :62) → per tenant with an `approved`
  mapping: `claimSentPeriod(tenant, "ledger-conversion-drain", isoDay)` — skip when
  already claimed today; un-uploaded gclid rows of the mapped kinds, attempts < 3,
  batch ≤ 200 → `uploadClickConversions` → accepted rows marked `uploaded` (batchId =
  `${isoDay}_${short}`), failed rows get `uploadError` (attempts++); on a transport-level
  throw (`classifyLiveError`) release the claim (`releaseSentPeriod`) so the next hour
  retries; counts `{projects, uploaded, failed, skipped, claimed}`. Append to
  `LEDGER_STEPS` (`ledgers.ts:94-101` — S2 appends its step in parallel; marker protocol).
  Demo/sample tenants skipped.
- **UI:** NEW `src/components/app/modules/ConversionUploadCard.tsx` (client, ≤200 LOC,
  `T`, choreography in `src/components/hooks/useConversionUpload.ts`) mounted in
  `nastaveni/page.tsx` between `WebhookEndpoints` (:49) and `ProjectDangerZone` (:50):
  action select, kinds checkboxes, "Zkušební běh" (table of rows + count + the
  validate-only verdict), "Schválit nahrávání" (disabled until a fresh dry run), status
  + pause, last drain result (from the mapping's `lastDrain`). `ConversionLedgerStrip.tsx`
  (:103-116) gains a server-rendered status line ("Nahrávání do Google Ads: aktivní /
  neaktivní — nastavení") — no client island needed.
- **Integrations:** `IntDetail` gains `"conversion-upload-active"`/`"conversion-upload-off"`
  (`compute.ts:61-81`), `ProvisionInput.conversionUploadApproved?: boolean` (optional,
  degrade), google-ads row detail (:290-294), copy table; probe in `status.ts`.
- Tests to copy: `leads-conversion-ledger.test.mjs` (real-sqlite harness :20-42),
  `conversions-export.test.mjs` fixture (reuse FIXTURE for the payload pin),
  `cron-ledgers`/`conversion-rollup` step shape; for the upload, inject `fetchImpl`.

## Data contract
```ts
// src/lib/conversions/mapping.ts
export type ConversionUploadStatus = "draft" | "dry-run" | "approved" | "paused";
export interface ConversionUploadMapping {
  status: ConversionUploadStatus;
  conversionAction?: { resourceName: string; name: string };
  kinds: { qualified: boolean; won: boolean };
  dryRunAt?: string; dryRunRows?: number; dryRunValidated?: boolean | null;
  approvedAt?: string; pausedAt?: string;
  lastDrain?: { at: string; uploaded: number; failed: number; batchId: string };
  updatedAt: string;
}
export const DRY_RUN_MAX_AGE_MS = 24 * 3_600_000;
export const DRAIN_BATCH = 200; export const DRAIN_MAX_ATTEMPTS = 3;
// conversion-events.ts (additive)
ConversionEvent.uploaded?: { platform: "google-ads"; at: string; batchId: string; action: string };
ConversionEvent.uploadError?: { at: string; message: string; attempts: number };
// ads.ts (S3 region)
export interface ClickConversionRow { gclid: string; conversionAction: string; conversionDateTime: string; conversionValue?: number; currencyCode: string }
export interface ClickConversionOutcome { accepted: string[]; failed: Array<{ gclid: string; message: string }> }
```
No migration; keys.ts gains ONE key (`conversionUpload`).

## Invariants
- A row is uploaded at most once: marked in the same pass it was accepted; the query
  excludes marked rows; the daily claim bounds a race between two ticks; pin "run the
  drain twice → second run uploads 0".
- No upload without `status === "approved"` AND a dry run within 24h at approval time;
  pausing stops the next drain (pin both).
- Payload rows deep-equal the CSV's rows for the same events (one filter, pinned).
- Failures never mark; after 3 attempts a row is left with `uploadError` and skipped
  (surface the count in the card).
- ADR-0002 (route keyed by the guard; the drain reads owner pairs from the store);
  ADR-0001 (project_state trio); no `export const dynamic`.

## Build steps
1. `mapping.ts` pure lifecycle + store wrapper + keys.ts + `test-unit/conversions-mapping.test.mjs` (≥10).
2. `ads.ts` S3 region (`listConversionActions`, `uploadClickConversions` with
   `fetchImpl`) + fixture pins (request body exact, partial-failure parsing; ≥6).
3. `google-upload.ts` builder + registry entry + CSV-equivalence pin (≥3).
4. Event marker fields + store query + local-store pins (uploaded filter, upsert marks).
5. Drain step + `LEDGER_STEPS` + sqlite end-to-end (approved mapping + fixture fetch →
   rows marked; second run 0; partial failure; claim release on throw; ≥8).
6. Routes + card + hook + strip status + integrations detail + deploy-doc paragraph
   ("Nahrávání konverzí do Google Ads"); LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/conversions src/lib/leads src/lib/google/ads.ts
"src/app/api/projects/[id]/conversions" src/components/app/modules/ConversionUploadCard.tsx
src/components/hooks/useConversionUpload.ts src/components/app/modules/leads
"src/app/app/[projectId]/nastaveni" src/lib/integrations src/lib/cron/ledgers.ts` ·
`npm run test:unit` (all `leads-*`, `conversions-*`, `cron-ledgers`, `ads-*` green).

## Acceptance
- Mapping: approve without dry-run → refused; dry-run then approve → `approved`;
  select a different action → `draft` (pinned).
- Upload fixture: 3 events (2 gclid) → request body has exactly 2 conversions with
  `pragueStamp` times, the 200 response with one partial failure → 1 marked
  `uploaded`, 1 `uploadError attempts:1`; second run → body has 1 conversion; after 3
  failures → 0 (pinned).
- CSV-equivalence pin holds on the shared fixture.
- ≥30 new assertions.

## Hotspot requests
- `src/lib/cron/ledgers.ts` append (marker protocol with S2), `src/lib/project-state/keys.ts`
  one key, `src/lib/google/ads.ts` S3 region (co-owned with S1b). `context-map.json`
  (Director). No migration, no sast.

## Rollback
Revert; `uploaded` markers in event JSON are ignored by old readers; an approved mapping
blob is inert (old code has no drain); conversions already uploaded stay in Google —
that is the irreversibility this rung accepts, bounded by the dry-run-first rule.
