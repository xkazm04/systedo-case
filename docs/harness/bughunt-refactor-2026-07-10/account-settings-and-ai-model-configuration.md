# Account, Settings & AI Model Configuration

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Concurrent BYOM mutations lost-update the whole `byomConfigs/{userId}` doc — a just-connected key can silently vanish

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/components/app/modules/ByomMatrix.tsx:78`
- **Scenario**: `ByomKeys` and `ByomMatrix` render together on the `nastaveni` settings page. Each owns its own `busy` flag (`ByomKeys.tsx:106` string busy; `ByomMatrix.tsx:58` `useAsyncAction` boolean), and **neither disables the other's controls** — `ByomKeys`'s `busy !== null` only greys out `ByomKeys`'s own buttons, and `ByomMatrix`'s `disabled={busy}` only greys out its own selects. So a user can change a matrix operation-assignment while a key "Connect"/"Save models" POST from `ByomKeys` is still in flight. Every server mutation is a full read-modify-write of one doc: `store.ts` `get()` → mutate → `save()` (`setByomOperation` 180-189, `putByomKey` 42-56, `setActiveByomVendor` 80-89), and the Firestore backend persists via `byomDoc.set(clean(cfg))` (`store.firestore.ts:50-52`) which **overwrites the entire document**, not a field-merge. Interleave: the matrix POST reads the config *before* the key write commits, then `.set()` rewrites the whole doc without the new key.
- **Root cause**: the config is a single mutable doc mutated by full-doc RMW with no transaction/optimistic-concurrency, and the two client surfaces that mutate it are not mutually gated (they hold independent `busy` state).
- **Impact**: state corruption / silent data loss — a freshly connected (encrypted) API key or a matrix assignment disappears; on reload the "Connected" pill is gone and generation silently falls back to the app provider, with no error shown to the user.
- **Fix sketch**: make the writes safe rather than relying on the UI: wrap each mutation in a Firestore `runTransaction` (or `set(..., { merge: true })` on the specific subfield) in `store.firestore.ts`/`store.local.ts`, so `operations`, `keys` and `activeVendor` are updated as independent fields instead of a whole-doc overwrite. As defence-in-depth, lift a single shared `busy`/config to the `nastaveni` page (see #3) so the two surfaces can't submit concurrently.

## 2. ByomKeys discards the user's pasted API key when the save is rejected

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/modules/ByomKeys.tsx:177`
- **Scenario**: `saveKey()` does `await call(...)` then **unconditionally** `setKeyDraft((d) => ({ ...d, [vendor]: "" }))` and `setShowKeyInput(... false)` (181-182). But `call()` never throws — it catches network errors and, on `!res.ok`, sets `error` and returns normally (152-155, 164-166). So when the server rejects the key (invalid format, entitlement lost, 500, or the validation branch reports the key doesn't work), the error banner appears **and the typed key is wiped**: for a replace the input also collapses shut. The user must re-open the field and re-paste the full secret to retry.
- **Root cause**: `saveKey` assumes `call()` resolving means the mutation succeeded; success and failure are indistinguishable to the caller because `call()` returns `void`.
- **Impact**: user-visible friction bordering on data loss on the unhappy path — the most error-prone field in the module (a long pasted API secret) is cleared exactly when the user needs to retry.
- **Fix sketch**: have `call()` return a boolean (`return false` in the `!res.ok`/`catch` branches, `true` otherwise); in `saveKey`, only clear `keyDraft`/`showKeyInput` when it returns `true`.

## 3. ByomMatrix keeps its own config copy — connecting the first key doesn't unlock the matrix until a full reload

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/app/modules/ByomMatrix.tsx:60`
- **Scenario**: `ByomMatrix` fetches `/api/byom` once on mount into its own `state` (60-76) and only ever updates `state.config` from *its own* POST/DELETE responses (`apply`, 87). `ByomKeys` holds a separate copy. So on a fresh settings visit with no keys, `ByomMatrix` renders the "Connect at least one API key above first" empty state (`configured.length === 0`, 114). When the user then connects their first key in `ByomKeys`, that updates only `ByomKeys`'s state; `ByomMatrix.state.config.keys` is still empty, so the operations matrix **stays stuck on the empty message** until a full page reload. The inverse also misleads: removing all keys in `ByomKeys` leaves the matrix still showing operation assignments bound to now-deleted vendors.
- **Root cause**: two sibling components each cache the same account-wide resource with no shared source of truth or cross-component invalidation. (Distinct from the 2026-07-09 refactor item, which flagged the *double-fetch/wrapper duplication*; this is the user-visible staleness symptom on the write path.)
- **Impact**: a BYOM-entitled user who just added a key believes the operations matrix is broken (still asking them to add a key) — the feature appears non-functional until they happen to reload.
- **Fix sketch**: lift `{ entitled, config }` to the `nastaveni` page (or a `useByomConfig()` context/hook shared by both components) fetched once, with mutations updating that single store so both surfaces re-render together.

## 4. IntegrationStatus rows in a category absent from CATEGORY_ORDER vanish from the board but still count in the summary tiles

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/app/modules/IntegrationStatusModule.tsx:50`
- **Scenario**: the summary tiles are computed over *all* rows (`statusSummary(rows)`, which increments per `r.status` across every row — `integrations/compute.ts:85-90`), but the board only renders categories listed in the hardcoded `CATEGORY_ORDER` array (50), via `CATEGORY_ORDER.map(...).filter(g => g.rows.length > 0)` (56-59). Today `IntCategory` (`compute.ts:13`) is exactly the six values in `CATEGORY_ORDER`, so there is no live mismatch. But `CATEGORY_ORDER` is typed `IntCategory[]`, so adding a seventh category to the union + `buildIntegrationRows` compiles cleanly without adding it here — those rows would then be silently dropped from the visible list while still inflating a summary tile (e.g. "Connected 6" with only 5 cards visible).
- **Root cause**: the display category ordering is a hand-maintained array that must be kept in lockstep with the `IntCategory` union, with no exhaustiveness check tying the two together.
- **Impact**: latent — a future connector in a new category would render an inconsistent board (tile counts exceed visible rows) with no error, undermining the module's stated "honest readiness" purpose.
- **Fix sketch**: derive the category list exhaustively — e.g. `const CATEGORY_ORDER: readonly IntCategory[] = [...]` with a `satisfies`-backed completeness assertion, or build it from the distinct categories present in `rows` — so a new `IntCategory` can't be silently omitted.

## 5. Quality-score → colour-band thresholds are duplicated across the two quality components

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/app/modules/ByomQualityMatrix.tsx:32`
- **Scenario**: `ByomQualityMatrix.tsx:32` defines `tone(s) = s>=8 ? "text-positive" : s>=6 ? "text-navy-800" : s>=4 ? "text-coral-600" : "text-negative"` and `ByomQualityOverview.tsx:39` defines `barTone(s) = s>=8 ? "bg-positive" : s>=6 ? "bg-brand-500" : s>=4 ? "bg-coral-500" : "bg-negative"`. Both encode the same composite-score band boundaries (8 / 6 / 4) that classify a 0–10 quality composite into good/ok/weak/bad; only the Tailwind channel differs (text vs bg, with a deliberate navy-vs-brand swap at the mid band). The 2026-07-09 report deduped `short()` across these same two files but did not touch these threshold helpers.
- **Root cause**: each component grew its own colour helper; the score-band boundaries (which belong with the scoring logic) were never centralised next to `qualityComposite`/`clamp10` in `lib/llm/quality.ts`.
- **Impact**: minor — if the quality banding is ever re-tuned (e.g. "good" becomes ≥8.5), the boundaries must be edited in two places or the matrix and the overview bar will disagree on the same score.
- **Fix sketch**: add `export const qualityBand = (s: number): "good" | "ok" | "weak" | "bad" => s>=8 ? "good" : s>=6 ? "ok" : s>=4 ? "weak" : "bad";` to `lib/llm/quality.ts`, and have each component map that single band key to its own `text-*` / `bg-*` class table.
