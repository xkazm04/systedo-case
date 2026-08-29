# WP W1-C — Dual-engine local pack: Google Maps + Seznam Mapy.cz in one ladder, map and diagnosis
card #16 · L · gate: contract (import CSV contract widens; persisted rows gain a field) · wave 1

## Goal
A local project can import rank ladders AND map packs for BOTH engines — Google (Maps / local
3-pack) and Seznam (Mapy.cz / Firmy.cz) — into the same `LocalSignals` blob; the ladder, the map
pack and the diagnosis grounding are engine-aware, and everything that exists today for Google is
byte-identical when no Seznam rows were ever imported. Acceptance: `GOLDEN_SAMPLE` + every existing
`local-signals`/`mappack-live` test stays green untouched; ≥15 new assertions cover the Seznam path.

## Non-goals
- No live Google/Seznam rank fetching (still CSV/URL import — the instrument is the import).
- No new sqlite table or migration: `local_signals` is one blob per project (`db.ts:132-138`);
  the engine lives INSIDE the rows. Do not touch `db.ts`.
- No LLM prompt change: `src/lib/ai/tools/local-diagnosis.ts` is OFF LIMITS (LLM gate; W2-C owns
  the local prompt next wave). The grounding type gains an optional field only (seam request).
- Do not edit `src/lib/local-signals/resolve.ts` beyond what the engine filter needs (W2-C overlays it
  next wave); do not touch `LocalModule.tsx`, `CoverageCell.tsx`, `organic-channels/**`.
- Do not "measure" the kanály Mapy.cz/Firmy.cz seeds (`organic-channels/sample.ts:60-75,378-393`) —
  W2-A's outcome ledger does that; here the second engine only becomes MEASURABLE in the pack/ladder.

## Seams
- Types `src/lib/local-signals/types.ts:9-19` (`LocalSignalsSource` = ingestion channel, NOT engine —
  keep), `:86-109` (`ImportedPackRow`, `ImportedPack`), `:115-122` (`LocalSignals`).
  `src/lib/mappack/sample.ts:31-54` (`MapListing`, `AreaPack`), `:60-79` (`RankPoint`, `KeywordRank`).
- Parsers `src/lib/local-signals/import.ts`: ranks header aliases `:23-27`, `parseRankRows` `:48`,
  `ladderKey(keyword, area)` `:36-38`; `mergeLadder`; pack aliases `:573-582`, `parsePackRows` `:632`,
  headerless order `:646-648`, uniqueness of rank / folded name WITHIN AN AREA `:713-723`,
  `PackRowErrorCode` `:586-594`, `PACK_ERROR_CS` map in the route `:47-56`.
- Import route `src/app/api/projects/[id]/local-signals/import/route.ts:66` (ranks branch `:215-227`
  union-merge; pack branch `:179-208` REPLACES the section). `DELETE ?source=` `:233`.
- Resolvers `src/lib/local-signals/resolve.ts:53` (`resolveLocalLadder`), `:87` (`resolvePacks` → sample by
  identity when no imported section, `:78-86` doc), `packsFromImported` `src/lib/mappack/compute.ts`.
- UI `src/components/app/modules/MapPackModule.tsx` (71 LOC, composes pack panel → map → ladder source →
  ladder), `MapPackClient.tsx` (292 LOC, props `{ areas, live }`, area tab strip `:203-221`, Leaflet
  `:76-164`), `RankLadder.tsx` (158 LOC, server, `{ rows }`), `LocalSourcePanel.tsx` (266 LOC, kind-scoped
  `T` keys, pack import help `packImportHelp`), `LocalLadderSource.tsx` (227 LOC, ranks import help).
- Diagnosis grounding `src/lib/diagnoses/local-request.ts:66-93` (ladder collapses to ONE
  `LocalDiagnosisLadder`, `src/lib/ai-types.ts:1178-1199`); `resolve-request.ts:137-151`.
- Recap appendix `src/lib/local-signals/summary.ts` (`localSignalsPromptText`) — engine-aware line, plain text.
- Existing precedent for a provider enum: `src/lib/keywords/types.ts:48` `KeywordSource = "google" | "sklik" | "sample"`.

## Data contract
```ts
// src/lib/local-signals/types.ts (additive)
export const LOCAL_ENGINES = ["google", "seznam"] as const;
export type LocalEngine = (typeof LOCAL_ENGINES)[number];      // absent → "google" on read
export interface ImportedPackRow { …existing…; engine?: LocalEngine }
// src/lib/mappack/sample.ts (additive)
export interface KeywordRank { …existing…; engine?: LocalEngine }  // absent → google
export interface AreaPack   { …existing…; engine?: LocalEngine }  // absent → google
```
Rules:
- **Legacy-read rule:** `engine` absent ⇒ `"google"`. `normalizeSignals`/`normalizeLadder` must NOT
  write `engine: "google"` onto legacy rows (keeps stored blobs and the sample byte-identical).
- **Ladder key:** `ladderKey(keyword, area, engine)` = existing `kw|area` for google, `kw|area|seznam`
  for seznam — so every existing key and every `id` derived from it is unchanged.
- **CSV contract (both parsers):** optional column `engine` (aliases `engine`, `vyhledávač`,
  `vyhledavac`, `zdroj`, `mapa`); values `google|seznam|mapy|mapy.cz|firmy|firmy.cz|seznam.cz` →
  `google|seznam` (case/diacritic-folded); missing column ⇒ google; unknown value ⇒ row error
  `invalid-engine` (add to `PackRowErrorCode` and to the ranks parser's error path with a Czech message).
- **Pack uniqueness** (`import.ts:713-723`) is per `(area, engine)`; a Seznam pack for "Praha 4" no longer
  collides with the Google one. `packsFromImported` groups by `(area, engine)` and stamps `AreaPack.engine`.
- **Pack section replace semantics** stay per-import (the section REPLACES) — but an import whose rows
  are all one engine must keep the OTHER engine's rows (merge by engine, replace within engine). Pin it.
- Resolvers: `resolveLocalLadder` / `resolvePacks` return every engine; add pure helpers
  `ladderForEngine(rows, engine)` and `packsForEngine(packs, engine)` in `src/lib/mappack/compute.ts`
  plus `enginesPresent(rows | packs): LocalEngine[]`.

## Invariants
- ADR-0001 (no backend change — the blob format is additive); ADR-0002 (route already `requireOwnedProject`).
- Byte-identity: `test-unit/mappack-live.test.mjs` `GOLDEN_SAMPLE`, `resolvePacks` "sample by identity",
  and all `local-signals.test.mjs` merge pins pass UNMODIFIED.
- Honest provenance: a `seznam` tab with no imported rows shows an empty state ("no Seznam data imported
  yet") — NEVER the Google sample relabelled.

## UI (each component stays ≤ 200 LOC net growth 0 or extract)
- `MapPackClient.tsx`: an engine segmented control (Google · Seznam) above the area strip, shown only when
  `enginesPresent(areas).length > 1` or the project has a seznam pack; `areas` prop becomes
  `AreaPack[]` incl. engine — filter client-side. Extract the segmented control into
  `src/components/app/modules/mappack/EngineSwitch.tsx` (shared with the ladder). Map legend gets the
  engine name; T keys cs/en.
- `RankLadder.tsx`: an engine `Pill` per row when >1 engine present; otherwise unchanged output.
- `LocalSourcePanel.tsx` (pack) + `LocalLadderSource.tsx` (ranks): import help text mentions the optional
  `engine` column; placeholders show one seznam example line. No logic change.
- `MapPackModule.tsx`: passes the engine list through; nothing else.

## Diagnosis grounding (W1-C's half; the prompt line is W2-C's)
- `local-request.ts`: compute the ladder rollup per engine; `LocalDiagnosisInputs` gains nothing new (the
  rows carry engine). Output: existing `ladder` = Google rollup (unchanged when no seznam rows);
  NEW optional `ladderSeznam?: LocalDiagnosisLadder` — this needs ONE additive optional field on
  `LocalDiagnosisRequest` in `src/lib/ai-types.ts:1231-1252` → **seam request** (Director applies; the
  LLM gate does not fingerprint types). Until applied, compute it and keep it typed via a local
  intersection so `tsc` passes without the seam; say so in the report.
- `summary.ts`: when seznam rows exist, add one line "Seznam (Mapy.cz): …" to the recap appendix.

## Build steps
1. Types + `normalize*` (no-write on legacy) + `ladderKey` engine-aware + tests (byte-identity first: run the
   existing suites before touching parsers).
2. Parsers: `engine` column, error code, folding; `mergeLadder` per-engine keys; pack merge-by-engine;
   `packsFromImported` grouping; `test-unit/local-signals-engines.test.mjs` (≥15 assertions: parse both
   engines, missing column ⇒ google, unknown ⇒ error, per-engine uniqueness, seznam import keeps google
   pack, ladder keys unchanged for google, `enginesPresent`, `packsForEngine`).
3. Resolvers + compute helpers; `local-request.ts` per-engine rollup + test in `local-diagnosis.test.mjs` shape
   (new file `local-diagnosis-engines.test.mjs`).
4. UI: `EngineSwitch`, `MapPackClient`, `RankLadder`, help copy. LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/local-signals src/lib/mappack src/lib/diagnoses/local-request.ts src/components/app/modules/MapPack*.tsx src/components/app/modules/RankLadder.tsx src/components/app/modules/LocalSourcePanel.tsx src/components/app/modules/LocalLadderSource.tsx src/components/app/modules/mappack` ·
`npm run test:unit` — `mappack*`, `local-*` suites green.

## Acceptance
- Existing `mappack-live`, `mappack`, `local-signals`, `local-diagnosis` tests: 0 lines changed, green.
- ≥15 new assertions; `grep -c '"seznam"' src/lib/local-signals/import.ts` ≥ 1.

## Hotspot requests
- `src/lib/ai-types.ts:1231-1252` — `ladderSeznam?: LocalDiagnosisLadder;` (verbatim insert + anchor).
- `context-map.json` — new `mappack/EngineSwitch.tsx`, new tests (Director).
- Doc-sync: one paragraph in `docs/roadmap/local-seo-consolidation.md` ("dual engine") — you may edit it.

## Rollback
Revert; blobs with `engine: "seznam"` rows read as extra rows on old code (unknown key ignored; the old
pack uniqueness would then reject a RE-import that mixes engines — note in the report).
