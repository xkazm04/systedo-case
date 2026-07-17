# Wave 10 — Local SEO cluster fixes

Module-clustered tail wave closing the remaining findings in the Local SEO area across
three reports: `local-seo-leads-reviews-ui.md`, `local-seo-mappack.md`, `local-seo-pages.md`.
12 findings targeted (4 High + 8 Medium) → **10 fixed, 2 skipped with cause**.

Branch `vibeman/ambiguity-ui-2026-07-16`. End gates: **tsc 0 · test:unit 1660/1660**
(baseline 1647 + 13 new tests) · **0 regressions**.

## Commits

| Commit | Finding(s) | Summary |
|---|---|---|
| `cfba655` | leads-reviews #2 (H) | Extract monotone rank/rating tone ramp to `lib/local/tones.ts`; route 6 consumers through it |
| `09b6e00` | leads-reviews #1 (H) | Map-pack panel: render `noGeo` note for empty pack, debounced `tileerror`, honest import-failure copy |
| `0d1405b` | mappack #1 (H), #4 (M), #5 (M) | coverageKey diacritic fold; mergeLadder same-day dedup + best carry-forward; parseGbpStatus fail-attention |
| `ea1cc1b` | mappack #3 (H) | Recap coverage stats exclude stale `untracked` keywords + honest disclosure line |
| `ab434e0` | pages #2 (H) | Twin readiness gate: null sentinel for a failed catalog read (≠ empty), dataset-derived `now` |
| `bf0fde3` | leads-reviews #5 (M) | Ladder change column: null (first import) → em dash, distinct from a true 0; `Math.abs` on slip |
| `bd3279e` | leads-reviews #4 (M) | Guard + error-handle the ladder "revert to sample" (confirm + res.ok + catch + setMsg) |
| `e941300` | pages #4 (M) | Central `isDemoProject` predicate (`lib/projects/demo.ts`); 5 call sites de-magicked |
| `530f053` | pages #3 (M) | Sample-data banner derived from each page's live/sample resolution (schranka, srovnani-seo, mapa) |
| `86efadc` | pages #5 (M) | Per-project social brand key (`lib/social/brand-storage.ts`) with legacy migration |

## Narratives

**leads #2 (tone ramp)** — The rank→tone pill ramp was severity-inverted (4–10 red /
11+ softer coral, so #25 looked calmer than #5) and copy-pasted across four modules plus
two review surfaces. One pure `src/lib/local/tones.ts` now owns `rankTone` (monotone:
1–3 positive, 4–10 coral warning, 11+ negative worst), `ratingTone` and `star`; RankLadder,
LocationsModule, MapPackClient, LocalModule, LocalReviews, ReviewInbox all import it, and
the LocalModule legend pills were flipped to match. **Behavior change (visible):** the map-
pack / matrix pills for ranks 4–10 and 11+ swap colors — this is the intended correction.

**leads #1 (map empty states)** — `noGeo` copy existed but no branch rendered it; a geo-less
pack showed a blank grey box. Now: no points → `noGeo` note; a Leaflet *import* failure →
its own "map failed to load" copy; ≥3 tile errors → the existing tiles-unavailable copy.

**mappack #1/#4/#5** (grouped — one file, independent hunks): coverageKey now NFD-folds
diacritics so a `Plzen`/`Montaz` CSV overlays the `Plzeň`/`Montáž` seed (was a silent no-op
on the common Czech path). mergeLadder replaces a same-day point instead of stacking a
duplicate (no fake 0-day trend / history flush) and carries all-time `best` forward past the
12-point cap. parseGbpStatus fails an unrecognised non-empty status to `attention` (a
suspended profile can't hide as healthy); empty stays `connected`.

**mappack #3 (recap)** — coverage figures now computed over non-`untracked` keywords with a
disclosure line, so a partial re-import's stale frozen ranks no longer inflate "sledováno N,
v top 3 M".

**pages #2 (twin)** — `loadProjectCatalog(...).catch(() => [])` collapsed a read error into
"empty catalog", telling the user to redo setup. Now catches to `null`; `offerings:
number | null` threads to deriveReadiness, which grounds a null (unknown) count to `partial`
rather than the `empty` level that reads as "unconfigured". Also passes dataset-derived `now`.

**pages #3/#4/#5** — sample banner tied to provenance; `isDemoProject` centralised; social
brand keyed per project.

## Behavior changes needing sign-off

- **Local rank pill colors (leads #2):** ranks 4–10 now render `coral` (was red/`negative`)
  and 11+ render `negative` (was `coral`). Intended severity correction, but it visibly
  recolors the map-pack ranking, the coverage matrix and the LocalModule legend.
- **GBP status default (mappack #5):** an imported GBP row with an unrecognised non-empty
  status now counts toward the needs-attention queue instead of the healthy count.
- **mapa page** now shows the "illustrative sample data" banner (the competitor pack is
  always sample); previously it showed none.

## Skipped (with cause)

- **mappack #2 (H) — "live coverage shows seeded fictional rank":** already resolved by an
  earlier wave. `resolveCoverage` sets `rank: null` on every combo when coverage is live
  (resolve.ts:158), and its docstring + the pinned test
  `resolveCoverage: live coverage nulls the seeded rank…` already assert exactly this.
- **leads-reviews #3 (M) — "target-breach alert can never fire":** premise is false in the
  current code. `sourceAlerts` pushes a `critical` alert whenever `cpqlNow > targetCzk`,
  and `targetCzk` defaults to the named exported `CPQL_TARGET_CZK` (900) when opts omit it —
  so criticals DO fire. The 25% rise is likewise the named exported `CPQL_ALERT_RISE`. The
  `{}` passed at the call site is an `AlertOptions` (thresholds), not a per-project targets
  map — no dead path, only a cosmetic bare-`{}` nit not worth the churn.

## New tests (13)

- `test-unit/local-tones.test.mjs` (4): monotone rank ramp, rating ramp, star.
- `test-unit/local-signals.test.mjs` (+4): same-day re-import replace, best carried past the
  cap, unrecognised-GBP→attention/empty→connected, diacritic-fold coverage overlay.
- `test-unit/projects-demo.test.mjs` (2): `isDemoProjectId`/`isDemoProject`.
- `test-unit/twin.test.mjs` (+1): null offerings → partial (not empty) grounding.
- `test-unit/social-brand-storage.test.mjs` (2): per-project key + legacy fallback.

`summary.ts` (recap) has no dedicated unit test — it is async and store-backed; the change is
a filter over an in-memory array with no new pure seam to isolate.

## Patterns

- Duplicated "tone ramp" logic drifts and freezes bugs in place — one pure module per color
  language, imported everywhere, is the fix (and makes the severity monotonicity testable).
- `.catch(() => [])` / `?? 0` on a nullable that carries meaning ("unknown" vs "empty",
  "first import" vs "no change") is a recurring honesty bug — keep the sentinel, branch on it.
- `startsWith("demo-")` and `app:social-brand` were undocumented magic conventions re-derived
  at every site — centralising each removes the drift risk and documents the rule.
