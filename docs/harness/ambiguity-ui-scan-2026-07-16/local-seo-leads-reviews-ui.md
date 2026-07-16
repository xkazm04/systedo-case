# Local SEO, Map Pack, Leads & Reviews — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Map pack's documented "no coordinates" fallback was never implemented — blank map region instead
- **Severity**: High
- **Lens**: ui
- **Category**: missing-empty-state
- **File**: src/components/app/modules/MapPackClient.tsx:75 (effect early-return), :34 (`noGeo` dead string), :130 (fallback branch)
- **Scenario**: An `AreaPack` whose listings lack coordinates (or has zero listings) is selected. The header comment promises "If a pack ever lacks coordinates, the map degrades to a note", and a translated `noGeo` string ("Pro tuto oblast zatím nejsou souřadnice.") exists for exactly this — but the effect just early-returns (`points.length === 0`) and the user sees an empty grey 16:10 box with no explanation. Separately, `setFailed(true)` fires only when the *Leaflet module import* fails; actual tile-load failures (offline, CARTO CDN blocked) leave a rendered but tile-less map, yet the shown fallback message claims "Mapové dlaždice nejsou dostupné".
- **Root cause**: The `noGeo` copy was written and translated but never wired to a render branch; the `failed` state conflates "library failed to load" with "tiles unavailable" and no `tileerror` handler exists.
- **Impact**: A confusing blank panel for geo-less areas (the exact degradation the port comment says is handled), and a misleading error message on the one failure path that is handled. Dead i18n key invites future deletion of copy that was meant to be used.
- **Fix sketch**: In `LeafletMap`, render the `noGeo` note when `points.length === 0` (before the effect ever runs); attach `tileLayer.on("tileerror", ...)` (debounced/once) to drive the `tilesUnavailable` message, and give the import-failure branch its own honest copy.

## 2. Rank→tone color ramp is severity-inverted and copy-pasted across four modules
- **Severity**: High
- **Lens**: ui
- **Category**: inconsistent-severity-ramp
- **File**: src/components/app/modules/RankLadder.tsx:46; LocationsModule.tsx:96; MapPackClient.tsx:53; LocalModule.tsx:91 (rankCell)
- **Scenario**: Everywhere ranks are shown, positions 4–10 get the `negative` (red) pill while 11+ — objectively worse — gets `coral` (softer). A keyword sitting at #25 looks *less* alarming than one at #5. The same `rankTone` function is duplicated verbatim in four files (plus `ratingTone` duplicated in LocalReviews.tsx:60 and ReviewInbox.tsx:92, and the `star()` helper duplicated in LocalModule.tsx:85 and LocalReviews.tsx:56 with a "Mirrored in…" comment admitting the copy).
- **Root cause**: One comment (LocalModule) rationalizes it as "4–10 = warning (negative-soft)", i.e. the author is using the `negative` token as a warning color — a private re-meaning of the design token that every consumer must know. Duplication then froze the inversion in four places.
- **Impact**: Visual severity contradicts data severity on the module's core metric; users triage the wrong keywords/locations first. Any future fix must be made in four files or the modules drift apart.
- **Fix sketch**: Extract a single `rankTone()` (and `ratingTone`/`star`) into e.g. `src/lib/local/tones.ts`, and make the ramp monotone: 1–3 `positive`, 4–10 `coral` (warning), 11+ `negative` (worst). Update the LocalModule legend pills to match.

## 3. Trend-alert "target breach" severity can never fire — targets are hardcoded to `{}`
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: dead-config-path
- **File**: src/components/app/modules/LeadQualityModule.tsx:173
- **Scenario**: `periodAlerts(sources, {}, locale)` passes an empty targets object at the only call site. The UI fully supports `critical` alerts (the "cíl"/"target" pill, `alertTone.critical`, the footer text promising "růst CPQL o více než 25 % nebo překročení cíle") — but with no targets, only the `warning`/drift class can ever appear.
- **Root cause**: The targets parameter was designed for per-project goals that were never threaded through; the magic `{}` silently disables half the alert taxonomy while the copy still advertises it. The 25% drift threshold also lives invisibly inside `compute` with no name at the call site.
- **Impact**: Users read the footer, expect target-breach alerts, and never get them — an honesty gap in a module that is otherwise scrupulous about "Seam:" disclosures. Future developers will assume targets flow from somewhere.
- **Fix sketch**: Either thread real project targets into the call (and keep the copy), or pass a named `NO_TARGETS` constant with a comment and drop the "překročení cíle" clause from `trendFooter` until targets exist. Surface the 25% threshold as a named exported constant.

## 4. Ladder "revert to sample" destroys imported data with no confirmation and swallows failures
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: destructive-action-unguarded
- **File**: src/components/app/modules/LocalLadderSource.tsx:96-104
- **Scenario**: In the live-data strip, one click on "Zpět na ukázková" fires `DELETE` on the import route — no confirm step, no undo. If the request fails (network, 500), `revert()` has no `catch` and never checks `res.ok`: the rejection escapes the async function unhandled, `setMsg` is never called, and `router.refresh()` (on the throw path it's skipped entirely) leaves the user staring at unchanged data with zero feedback. Contrast: `submit()` and `refreshFromUrl()` in the same file both check `res.ok` and set `msg`.
- **Root cause**: `revert` was written as fire-and-forget with only a `finally` for the busy flag; the destructive semantics of dropping imported rankings history weren't weighed.
- **Impact**: Accidental loss of imported ranking data (the module elsewhere prides itself on "historie zachována"), and a silent no-op on failure that reads as a broken button.
- **Fix sketch**: Mirror `submit`'s error handling (`res.ok` check + `setMsg(t("failed"))` + `catch`), and gate the click behind a lightweight confirm (two-step button or `confirm()` copy explaining sample data will replace the import).

## 5. RankLadder change column conflates "no prior import" with "no change"
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: null-collapsed-to-zero
- **File**: src/components/app/modules/RankLadder.tsx:109, :141-148
- **Scenario**: `const delta = changeSinceLast(r) ?? 0;` — a keyword with a single observation (fresh import, the exact case the Sparkline's n===1 guard above it exists for) renders "beze změny" / "no change" in the "Od posl. importu" column, identical to a keyword that genuinely held its position across two imports.
- **Root cause**: The nullable return of `changeSinceLast` (explicitly `null` for a first/single observation, per its own comment) is coalesced to `0` before the three-way render, erasing the distinction the compute layer deliberately preserved.
- **Impact**: Misleading stability signal on first import — every row claims "no change" when nothing has been compared yet. It also undercuts the module's otherwise honest badges ("mimo import", "klesá"). Minor adjunct: the slipped label renders "▼ -3" (down-arrow *and* minus sign) because `slipped: "{n}"` interpolates the raw negative number, while climbed formats "+{n}".
- **Fix sketch**: Keep `delta` nullable; render "—" (or a small "první import" label) for `null`, reserving "beze změny" for a true `0`. Use `Math.abs(delta)` in the slipped label so it reads "▼ 3".
