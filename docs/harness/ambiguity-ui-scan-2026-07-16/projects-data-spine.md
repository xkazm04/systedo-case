# Projects, Project State & Project Data Spine — ambiguity+ui scan

> Total: 5 findings (0 critical / 0 high / 4 medium / 1 low)

## 1. Corrupt project-state JSON is indistinguishable from "never saved" — caller reseeds and silently overwrites real user data
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-data-loss-on-parse-failure
- **File**: src/lib/project-state/store.local.ts:20 (and src/lib/project-state/store.firestore.ts:23)
- **Scenario**: A `project_state` blob (content schedule, review triage — user-created state) becomes unparseable (interrupted write, manual DB edit, a future serialization bug). `getProjectState` swallows the `JSON.parse` error with a bare `catch { return null; }`, the dispatcher's contract says `null → caller seed`, so the module renders fresh seed data; the user's next edit calls `saveProjectState`, which replaces the still-recoverable corrupt blob with the seed.
- **Root cause**: Two very different conditions — "no row exists" and "row exists but is corrupt" — are collapsed into one `null` return, with no log and no way for a caller to distinguish them.
- **Impact**: Permanent, silent loss of user-created state; the corrupt original is destroyed on the first save after the failure, and nothing was ever logged to diagnose it.
- **Fix sketch**: In both backends, log (`console.error` with userId/projectId/key) inside the catch at minimum; better, return a discriminated result (`{ status: "missing" } | { status: "corrupt", raw } | { status: "ok", data }`) or rename the corrupt path's `null` behavior into the dispatcher's doc comment so callers know reseeding may clobber a recoverable blob.

## 2. `saveProjectState` is unbounded but the Firestore backend has a hard 1 MB doc limit — a prod-only failure the local dev path can never reproduce
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: hidden-backend-limit-divergence
- **File**: src/lib/project-state/store.firestore.ts:27
- **Scenario**: The state store backs open-ended, append-style module state (content schedule entries, review triage decisions, the twin's "one persisted blob" shared by three modules — modules.ts:297). As a project accrues months of entries, `JSON.stringify(data)` grows past Firestore's 1 MiB document cap and `set()` starts throwing on every save — but only in production; the sqlite dev backend accepts blobs of any size, so the divergence is invisible until a paying user hits it.
- **Root cause**: The dispatcher's contract ("Replace the stored blob") documents no size envelope, and neither backend enforces or even mentions one; the whole-blob-per-key design assumes blobs stay small without stating it.
- **Impact**: A user's module silently stops persisting (every save 500s), with no path to recover except manual data surgery; the trade-off (blob-per-key simplicity vs. growth ceiling) was never written down.
- **Fix sketch**: Assert a size budget at the dispatcher (`saveProjectState` throws a typed error past e.g. 900 KB serialized, so both backends behave identically), document the envelope in the dispatcher's header, and have the growth-prone callers (schedule, triage, twin) prune/archive old entries before save.

## 3. `applyProjectShape`'s "per-day ratios pointwise IDENTICAL" guarantee is broken by `Math.round` at low magnitudes
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: documented-invariant-vs-rounding
- **File**: src/lib/project-data/dataset.ts:169-183 (also scaledDataset:61-67)
- **Scenario**: A `content` project can carry a combined scale near 0.45 × 0.7 ≈ 0.31 (seed.ts TYPE_BASE × seedScale floor), then a shape factor as low as 0.75 on a quiet base day. A base day with 2–4 conversions rounds to 1 or 0 while cost/revenue (larger numerators) round to nonzero values — the very day now shows conversions = 0 with cost > 0, so CPA = cost/0 and conv-rate = 0 on any daily drilldown, and ROAS/PNO drift from the scaled base despite the header's promise that "derived ratios (ROAS/PNO/CPA/conv-rate) are pointwise IDENTICAL to `base`".
- **Root cause**: Each volume field is independently `Math.round`ed after the uniform factor; the uniform-factor algebra that makes ratios invariant only holds over the reals, and the file's (otherwise excellent) invariant documentation doesn't carve out the integer-quantization error, which is relative-error-unbounded as counts approach 0. The same unstated caveat applies to vary.ts's "ratios and orderings are preserved exactly".
- **Impact**: Small/low-type demo projects can render absurd day-level figures (infinite/NaN CPA, 0% conv-rate on a day with spend), undermining the "reads as its own coherent reality" goal; a future test pinning the documented invariant would fail spuriously.
- **Fix sketch**: Either floor conversions at 1 when the pre-round value is > 0 (cheap, keeps days coherent), or soften the doc to "pointwise identical up to integer rounding; conversions may quantize to 0 on low-volume days" and make the ratio-consuming surfaces guard division by zero. A determinism test at minimum magnitude would pin whichever contract is chosen.

## 4. The "mirrors the Firestore backend's interface exactly" promise is drifting: Firestore `updateProject`/`createProject` skip the normalization the local backend performs
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: backend-normalization-divergence
- **File**: src/lib/projects/store.firestore.ts:79 (vs src/lib/projects/store.local.ts:106-109)
- **Scenario**: The local backend encodes an explicit contract — "`undefined` means leave as-is; an empty string clears the field" — trimming `logoUrl`/`domain` and storing `NULL`. The Firestore backend just drops `undefined` keys and writes whatever remains verbatim: a clearing patch stores `logoUrl: ""` / `domain: ""` in the doc, and `createProject` writes `domain: ""` for a whitespace-only input (`input.domain ?` is truthy for `" "`; local guards with `input.domain?.trim()`). Today `toProject`'s `|| undefined` masks this at read time, so the drift is invisible — until anything queries Firestore directly (`where("domain", "!=", null)`, an export, a security rule) or a new field copies the pattern without the read-side mask.
- **Root cause**: The "empty string clears" semantics live only as a comment inside `store.local.ts`; the Firestore twin was never given the same normalization, and nothing (shared helper or contract test) forces the two backends to converge on stored representation, only on read-back shape.
- **Impact**: Two persistence backends that claim to be identical store different data for identical calls; each new patchable field is a fresh opportunity for the paths to disagree in a way dev (LOCAL_DB) never exercises.
- **Fix sketch**: Extract one `normalizeProjectPatch(patch)` (trim, empty-string→null/absent) in `types.ts` and call it from both backends; in Firestore, map cleared fields to `FieldValue.delete()` (or `null`) instead of `""`. A small parity test running the same patch matrix through both backends would lock the contract.

## 5. `updateProject` accepts a blank name at the store layer — the create-path guard exists only in the API route
- **Severity**: Low
- **Lens**: ambiguity
- **Category**: invariant-enforced-at-wrong-layer
- **File**: src/lib/projects/store.local.ts:102 (and src/lib/projects/store.firestore.ts:79)
- **Scenario**: `createProject` defends the "a project always has a display name" invariant in both backends (`input.name.trim() || PROJECT_TYPE_META[type].label`), but `updateProject` writes `patch.name` verbatim — `""` or `"   "` sails through. Today the only caller (src/app/api/projects/[id]/route.ts:19) happens to filter falsy trimmed names, so the invariant survives by coincidence of one call site; any second caller (onboarding flow, seed script, a future bulk-rename) that passes user input straight through strands a project whose name renders as nothing in the switcher, sidebar and client reports.
- **Root cause**: The non-empty-name invariant is enforced on create in the store but on update only in one HTTP route, so the store's own API is inconsistent about which layer owns validation.
- **Impact**: Latent blank-name projects if the store is reused outside the current route; also inconsistent trim behavior (create trims, Firestore update doesn't).
- **Fix sketch**: Mirror the create-path guard in both `updateProject`s: `if (patch.name !== undefined) name = patch.name.trim() || row.name` (ignore a blank rename rather than apply it), and note in `ProjectPatch`'s doc comment that blank names are rejected at the store layer.
