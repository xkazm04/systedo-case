# WP W3-C — Conversion ledger + CSV connector (the safe half of closed-loop upload)
card #2 (safe half) · XL (narrowed to L: export-only, no live push) · gate: contract (new tables; CSV column) · wave 3

## Goal
Every qualified/won stage transition appends a durable, PII-free `ConversionEvent` row; the
CSV lead connector learns to CAPTURE `gclid` (and an optional per-row value) so the events
can carry a click id; a connector-seamed exporter produces a Google Ads offline-conversion
CSV (gclid rows only, English headers, comma) and a Sklik hand-mappable sheet (the
`sklik-export.ts` honesty posture); a `conversion-rollup` ledgers-cron step maintains a
cheap per-project summary; and the Kvalita leadů page grows a conversion strip with the
export downloads. NO live API upload (S3). Acceptance: both append sites pinned (stage
change AND import-at-qualified), export fixtures byte-pinned for both formats, rollup
pinned, gclid coverage honest — ≥26 assertions.

## Non-goals
- No Google/Sklik API calls, no OAuth, no upload queue — the "drain" of live upload is S3;
  this WP ends at a downloadable file (`docs/harness/feature-scout-2026-06-18/
  lead-quality.md:33` is the origin of that cut).
- No PII in the ledger or the exports: rows carry `contactId` + attribution labels +
  gclid + value, never name/email/phone (the repo's LLM-side prohibition —
  `crm/contacts/route.ts:8-10` — extends to this store by design).
- No Deal store, no per-stage revenue model: `value` is optional and null when unknown
  (never 0) — sourced ONLY from the new CSV `value` column or a future producer.
- Do not edit `db.ts`/cascades/`context-map.json` outside the seam protocol; do not touch
  `src/lib/lead-quality/**` computation, `src/app/api/leads/**` (the OLD aggregate
  importer — different namespace, `crm/contacts/route.ts:3-6`).
- `src/lib/ai-types.ts` + `src/lib/ai/validation.ts` are CO-OWNED with W3-B/W3-D this
  wave: marked additive hunks only (`// ── W3-C ──`), never reformat, list every hunk.

## Seams
- **Append site 1 (stage change):** `src/lib/leads/mutate.ts:76-77` — after
  `saveContact` + `appendActivity` in `changeStage`, best-effort append (try/catch
  console.error — the W1-A posture, `events-store.ts:30-33`): emit `qualified` when
  `PIPELINE_RANK` crosses 0→≥1, `won` on →3 (`types.ts:50-59`); rank REGRESSION emits
  nothing (a retraction is S3's problem — note it in the header). Idempotent id
  `${contactId}_${kind}` so a re-qualify after regression upserts, not duplicates.
- **Append site 2 (import/create):** `src/lib/leads/apply.ts` ~:232-253 — a contact
  CREATED (or auto-merged) at rank ≥1 via `applyLeadEvent` never passes `changeStage`
  (initial stage set at :202) — append there too, same id rule (upsert makes the two
  sites safe to overlap).
- **CSV columns:** `src/lib/leads/connectors/csv.ts` — `Col` :27 gains `"gclid"` and
  `"value"`; `COL` alias table :30-48 gains `gclid|google click id|click id` and
  `value|hodnota|deal value|cena`; attribution build :137-142 carries `gclid`;
  the parsed value rides `raw` → `applyLeadEvent` → the append site (thread it —
  `LeadEvent.attribution` is `Partial<Attribution>` and `Attribution.gclid` already
  exists at `types.ts:122`, unused until now). `mergeAttribution` (`apply.ts:111-119`)
  must PRESERVE an existing gclid (first-touch wins — pin it).
- **Store trio (NEW `src/lib/leads/conversion-store.ts` + `.local` + `.firestore`):**
  copy `src/lib/catalog/events-store*.ts` wholesale (row-based, Family B
  `(userId, projectId)`… NO — leads stores key by projectId alone (`store.ts:26`);
  follow the LEADS keying: projectId key, `clearConversionEvents(projectId)`).
  Cap 5000, newest-first reads, upsert by id, evict oldest.
- **Types (NEW `src/lib/leads/conversion-events.ts`, pure):** contract below + the two
  pure detectors `conversionFromStageChange(prev, next, contact, now)` /
  `conversionFromApply(contact, now)` and `gclidCoverage(events)`.
- **Exporters (NEW `src/lib/conversions/`):** `types.ts` — the connector seam
  (`ConversionExporter { id; label; build(events, opts): { filename; mime; body } }`),
  `google-csv.ts` — comma-delimited, header row exactly
  `Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency`,
  gclid-rows only, time `YYYY-MM-DD HH:MM:SS+01:00` (Europe/Prague offset of the event),
  value blank when null, currency CZK; reuse `csvCell` (`src/lib/export.ts:41-59` —
  formula-injection guard) with a comma joiner (the `ltv/compute.ts:358` pattern, NOT
  `toCsv` which is semicolon/CRLF cs-Excel). `sklik-sheet.ts` — the
  `src/lib/sklik-export.ts:1-24` posture verbatim: Czech UI-mirroring headers, semicolon,
  a hand-mappable sheet, header comment stating the spec is not offline-verifiable.
  `registry.ts` — `CONVERSION_EXPORTERS` (the S3 live-push implements this same seam).
- **Export route (NEW):** `src/app/api/projects/[id]/conversions/export/route.ts` — GET
  `?format=google|sklik&kind=qualified|won&days=30`; `requireOwnedProject`
  (`crm/contacts/route.ts:26-27` shape); `Content-Disposition: attachment`. A plain
  `<a href>` from the strip downloads it (cookie auth; no client blob dance).
- **Cron step (NEW `src/lib/leads/conversion-rollup-step.ts`):**
  `CONVERSION_ROLLUP_STEP_ID = "conversion-rollup"`, shape verbatim from
  `src/lib/organic-channels/rollup-step.ts:39-47`; run = per project with events:
  recompute a summary blob + prune rows older than 180 days (prune LAST, :95-101
  precedent); counts `{projects, events30d, pruned, failed}`; register by appending to
  `LEDGER_STEPS` (`src/lib/cron/ledgers.ts:88` — that line is yours, W1-E precedent).
  Summary rides `project_state` key `conversionSummary`
  ({ owner: "kvalita-leadu", version: 1, http: false } — the measurement rule,
  `keys.ts:60-65`), written via the `outcomes-state.ts` CAS shape.
- **Kvalita strip:** `src/components/app/modules/LeadQualityModule.tsx` — mount NEW
  `src/components/app/modules/leads/ConversionLedgerStrip.tsx` (≤200 LOC, server
  component, `T` cs/en) immediately after `LeadImportPanel` (~:220): 30d qualified/won
  counts, gclid coverage ("X ze Y konverzí nese Google Click ID — doplňte sloupec gclid
  do importu" when low), the two download links, and an honest empty state. The module
  is `availableFor: ["leadgen"]` only (`modules.ts:299-308`) — the strip inherits that.
  Props threaded from `kvalita-leadu/page.tsx` (read the summary blob there).
- **Diagnosis grounding (aggregate counts only):** `LeadSourceDiagnosisRequest`
  (`src/lib/ai-types.ts:1085-1125`) gains
  `conversions?: { qualified30d: number; won30d: number; gclidPct: number }` (per-source,
  joined by the display source label — the ledger row carries `sourceLabel` for exactly
  this); `seedToRequest` (`src/lib/diagnoses/lead-source-request.ts:97-114`) one
  conditional line; `buildLeadSourceDiagnosisPrompt` one line after the trend block with
  the anti-fabrication framing. Fingerprint is system+schema so no golden drift expected
  (W2-A precedent) — byte-pin the no-field prompt; if `llm:gate:check` drifts anyway,
  `llm:eval:update --reason`.
- GDPR note (state in conversion-events.ts header): `eraseContact`
  (`mutate.ts:171-200`) tombstones PII but ledger rows carry none — they survive as the
  attribution record, which is the point of a ledger.
- Test harness: temp-db `test-unit/campaigns-local-store.test.mjs:1-30` shape;
  `test-unit/catalog-events*.test.mjs` shapes for trio + detector.

## Data contract
```ts
// src/lib/leads/conversion-events.ts
export type ConversionKind = "qualified" | "won";
export interface ConversionEvent {
  id: string;                 // `${contactId}_${kind}` — upsert, never duplicate
  contactId: string;
  kind: ConversionKind;
  at: string;                 // ISO, the stage-entry moment
  sourceLabel: string;        // the display label lead-quality groups by (join key)
  attribution: { source: string; campaign?: string; gclid?: string };
  value: number | null;       // CZK; null = unknown (never 0)
  connectorId?: string;
}
export const CONVERSION_EVENT_CAP = 5000;
export const CONVERSION_RETENTION_DAYS = 180;
export interface ConversionSummary {
  qualified30d: number; won30d: number;
  bySource: Array<{ sourceLabel: string; qualified30d: number; won30d: number; gclidPct: number }>;
  gclidPct: number; updatedAt: string;
}
```
Store API: `appendConversionEvents(projectId, events)` (upsert),
`listConversionEvents(projectId, { limit?, kind?, sinceDay? })` (newest-first),
`pruneConversionEvents(projectId, beforeDay)`, `clearConversionEvents(projectId)`.

Sqlite (seam request, migration **v31** — W3-B holds v30; append after `db.ts:1152`;
`db-migrations.test.mjs` LATEST = highest present when you finish):
```sql
CREATE TABLE IF NOT EXISTS conversion_events (
  project_id TEXT NOT NULL, id TEXT NOT NULL,
  at TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (project_id, id)
);
CREATE INDEX IF NOT EXISTS idx_conversion_events_at ON conversion_events (project_id, at);
```
Firestore: `projects/{pid}/conversionEvents/{id}`? — NO: follow the leads trio's actual
firestore layout (`store.firestore.ts` — same parent the lead stores use); mirror
`events-store.firestore.ts` batch/evict mechanics.

## Invariants
- ADR-0001 trio; ADR-0002 the export route keys off `requireOwnedProject`; append is
  best-effort AFTER the contact save (a ledger failure must never fail a stage change or
  an import).
- Honesty: `value` null ≠ 0; the Google CSV contains ONLY gclid rows (a gclid-less
  qualified lead is exportable to Sklik's hand sheet and to nothing else — the strip
  says so); no PII anywhere in rows or files.
- Cache Components: plain handlers, no `export const dynamic`.

## Build steps
1. `conversion-events.ts` pure detectors + `test-unit/leads-conversion-events.test.mjs`
   (rank crossings incl. regression-silent, import-at-won, id stability; ≥8).
2. Trio + local-store test (upsert, cap, prune, kind filter, clear; ≥6).
3. Both append sites + CSV gclid/value columns + `mergeAttribution` first-touch pin —
   extend the existing `leads-*` suites (import fixture with gclid column → event carries
   it; ≥6).
4. Exporters + byte-pinned fixtures (google header row + a 2-row body verbatim; sklik
   sheet headers verbatim; formula-injection cell pinned) + export route test (auth,
   format/kind params, attachment header).
5. Rollup step + `LEDGER_STEPS` append + keys.ts registration + step test
   (`cron-ledgers` shape).
6. Strip + page wiring + grounding field/prompt line (+ no-field prompt byte-pin);
   LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/leads src/lib/conversions
"src/app/api/projects/[id]/conversions" src/components/app/modules/leads
src/components/app/modules/LeadQualityModule.tsx "src/app/app/[projectId]/kvalita-leadu"
src/lib/cron/ledgers.ts src/lib/diagnoses/lead-source-request.ts` · `npm run test:unit`
(all `leads-*`, `lead-*`, `cron-ledgers` suites green) · `npm run llm:gate:check`.

## Acceptance
- `changeStage(working→qualified)` fixture → exactly one event, kind `qualified`,
  `sourceLabel` from attribution (pinned); `qualified→working→qualified` → still ONE row
  (upsert pinned); CSV import of a `won` row with gclid → `won` event carrying it.
- Google CSV fixture byte-pinned incl. header; a null-value row renders an empty cell.
- Rollup fixture: 3 events (2 with gclid) → `gclidPct` 0.67-ish exact, prune drops a
  200-day row (pinned).
- ≥26 new assertions.

## Hotspot requests (seam requests — verbatim inserts + anchors)
- `db.ts` v31 + DDL (+ LATEST); table-count comments (42 → new count) — Director settles
  at seams (W3-B/W3-D also migrate; append yours, never renumber theirs).
- `delete-cascade.ts` `{ name: "conversion-events", delete: (p) => clearConversionEvents(p) }`
  before the microsite entry (:103) + import line; cascade-suite fixture entry
  (`test-unit/project-delete-cascade.test.mjs` — the wave-2 lesson: the fixture set is
  pinned to the registry, add seed+present).
- `duplicate-cascade.ts` exclusion bullet (operating data, :17-34 list).
- `src/lib/ai-types.ts` + `validation.ts` hunks (co-owned — list them).
- `context-map.json` (Director).

## Rollback
Revert; `conversion_events` inert; exported CSVs already downloaded are the operator's
files; grounding field disappears from prompts (fingerprint unchanged).
