# Projects, Project State & Project Data Spine

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

Note: prior report items #1 (`ALL` duplicate), #2 (`hash32` dup), #3 (dead `IconKey`s) and #4 (`PROJECT_HOME_SEGMENT`) are all **already fixed** in the current tree; item #5 (six locale ternaries) is still present but is NOT re-reported here (deduped). The findings below are new.

## 1. Legacy / unrecognized `project.type` is never coerced to a valid `ProjectType` — NaN dashboard + hard crash

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/projects/store.firestore.ts:27`
- **Scenario**: `toProject` maps a stored doc with `type: data.type ?? "eshop"` (mirrored in `store.local.ts:36` as `(r.type as Project["type"]) ?? "eshop"`). The doc-comment above it promises this "narrows it back to Project, tolerating legacy docs." But `??` only substitutes when the value is `null`/`undefined` — an *unrecognized string* (`"shop"`, a retired type, a manual/seed-script write, a value from an older app version — Firestore is schemaless) sails through unchanged. That poisoned `type` then hits three `Record<ProjectType, …>` lookups that are total only over the real union: `TYPE_BASE[project.type]` in `src/lib/project-data/seed.ts:31` → `undefined` → `seedScale(id, undefined)` → `NaN`, so `getProjectDataset`/`scaledDataset` multiply every `visits/cost/conversions/revenue/monthlyRevenue` by `NaN` and the whole overview renders `NaN`; `PROJECT_TYPE_META[type]` in `types.ts:143` → `undefined` → `.labelEn` **throws**; `KPI_PRESETS[type]` (`modules.ts:474`) → `undefined` → `.map` **throws**; and `modulesFor(type)` returns `[]` (empty sidebar). The API validates `type` on create/patch (`api/projects/route.ts:38`), so this only bites data that entered by any *other* path — exactly the "legacy docs" the comment claims to handle.
- **Root cause**: the defaulting assumes the only bad `type` is a *missing* one; it never validates the string against `PROJECT_TYPES`, so an out-of-union value is treated as valid.
- **Impact**: crash (thrown `TypeError` on the project overview / any `projectTypeMeta` caller) and success-theater NaN numbers across the dashboard for the affected workspace.
- **Fix sketch**: in both `toProject`s, coerce through the known set: `type: (PROJECT_TYPES as string[]).includes(data.type) ? data.type : "eshop"` (import `PROJECT_TYPES` from `./types`). One shared `coerceProjectType(v): ProjectType` helper next to `PROJECT_TYPES` keeps both backends honest and makes the "tolerating legacy docs" comment true.

## 2. `saveProjectState` is a blind full-blob replace — concurrent edits silently lose data

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/project-state/store.firestore.ts:23`
- **Scenario**: the content-schedule and review-triage modules are the whole reason `project_state` exists (per its own header: "state that used to live only in localStorage"). The client GETs the entire blob (a `ContentPost[]` / `ReviewInboxState`), mutates it locally, and PUTs the whole array back; `saveProjectState` does an unconditional `.set()` (Firestore) / `INSERT … ON CONFLICT DO UPDATE` (local, `store.local.ts:25`) with no version, ETag, or read-check. Two tabs (or a phone + desktop) open the same content schedule: tab A schedules post X and PUTs `[…, X]`; tab B — whose GET predated X — schedules post Y and PUTs `[…, Y]`. Last write wins, X is gone, no error shown to either user.
- **Root cause**: a per-key JSON blob with last-write-wins semantics is used for *collaboratively/multi-session mutable lists* as if writes were serialized; there is no optimistic-concurrency token.
- **Impact**: silent data loss of user-authored content-schedule posts and review-triage flags under the ordinary two-tab / two-device workflow.
- **Fix sketch**: add an `updatedAt`/version guard: return the stored `updatedAt` on GET, require the client to echo it on PUT, and reject with `409` when it no longer matches (Firestore transaction reading the doc first; local `WHERE updated_at = ?` guarded UPDATE). Alternatively make these two keys append/patch operations rather than whole-array replaces.

## 3. `deleteProject` deletes only the workspace row — every per-project satellite is orphaned

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/projects/store.local.ts:130`
- **Scenario**: `deleteProject` runs a single `DELETE FROM projects WHERE id = ? AND user_id = ?` (Firestore twin at `store.firestore.ts:85` deletes just the project doc — its own comment admits "this removes the workspace entry, not campaign/social data"). Everything keyed by `(userId, projectId)` survives: `project_state` rows (content schedule, review triage), the starter catalog persisted at create time (`saveOfferings(uid, project.id, …)` in `api/projects/route.ts:54`), twin state, cost-model, etc. Delete a project, and its saved content posts, review flags, catalog and twin voice remain in the store forever — invisible (no project lists them) but resident. For a product that ships an account-deletion request (AccountSecurity) and GDPR framing, that residue is a data-retention/privacy defect, not just a storage leak.
- **Root cause**: deletion was modeled as removing one row rather than a cascade over the project's data graph; no per-project satellite store is notified.
- **Impact**: unbounded orphaned per-project data (storage growth + personal-data residue that outlives the user-visible delete).
- **Fix sketch**: make `deleteProject` a cascade — a shared `purgeProjectData(userId, projectId)` that deletes `project_state`, catalog offerings, twin/cost-model docs, and tenant-scoped activity for the project (SQL: `DELETE … WHERE user_id=? AND project_id=?` per table; Firestore: batch-delete the subcollection docs). At minimum delete `project_state` here since it is 1:1 with the project.

## 4. `project_state` store writes an unbounded stringified blob into one Firestore doc — no store-level size guard

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/project-state/store.firestore.ts:23`
- **Scenario**: `saveProjectState` writes `{ data: JSON.stringify(data) }` into a single Firestore document, which Firestore hard-caps at 1,048,576 bytes. The only guard is in the route (`api/projects/[id]/state/[key]/route.ts:42`): `JSON.stringify(body.data).length > MAX_BYTES` (256_000). That measures UTF-16 code *units*, not bytes, despite the name `MAX_BYTES` — Czech diacritics and emoji are 2-4 UTF-8 bytes each, so a payload under the 256k-char cap can be ~0.5-1 MB of actual bytes. A large, diacritic/emoji-heavy content schedule can pass the app cap yet exceed Firestore's per-doc byte limit, and the `.set()` throws — the user's save fails with a generic error while the store believes nothing is wrong.
- **Root cause**: the size limit lives only in the route and is expressed in characters, while the durable backend enforces a byte limit; the store itself trusts the caller and has no guard.
- **Impact**: intermittent, size-dependent write failures (lost save) for large content-schedule/review blobs on the Firestore backend; the char-vs-byte gap makes the ceiling unpredictable.
- **Fix sketch**: measure bytes (`Buffer.byteLength(json, "utf8")` / `new TextEncoder().encode(json).length`) and cap well under Firestore's 1 MiB (e.g. 512 KB) inside `saveProjectState` itself, returning a typed too-large error rather than letting Firestore throw. Rename `MAX_BYTES` accordingly.

## 5. Project field-defaulting is copy-pasted across both store backends (`toProject` + `createProject`)

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/lib/projects/store.local.ts:32`
- **Scenario**: the same six defaulting rules are hand-written twice, once per backend. `toProject` in `store.local.ts:32-45` and `store.firestore.ts:23-36` both encode: `name || "Projekt"`, `type … ?? "eshop"`, `accentColor ?? PROJECT_TYPE_META.eshop.defaultAccent`, `logoUrl/domain/tenant/adsCustomerId → … || undefined`, and `createdAt/updatedAt ?? new Date(0).toISOString()`. `createProject` in both files repeats another pair: `name: input.name.trim() || PROJECT_TYPE_META[input.type].label` and `accentColor: input.accentColor || PROJECT_TYPE_META[input.type].defaultAccent`. This is NOT in the 2026-07-09 report (which covered `ALL`/`IconKey`/hash/`PROJECT_HOME_SEGMENT`/locale-ternaries, none of these). The two copies already drift subtly — e.g. legacy-`type` coercion (finding #1) has to be fixed in both, and the `name` fallback differs (`"Projekt"` on read vs the type `label` on create).
- **Root cause**: the backends were written as independent row/doc mappers with no shared "raw fields → Project" normalizer, so every default rule exists in two places.
- **Impact**: low today but a maintenance trap — any change to a default (or the finding-#1 coercion) must be mirrored by hand across two files with no shared test surface; a missed mirror silently diverges the local and Firestore representations of the same project.
- **Fix sketch**: extract a framework-free `normalizeProject(raw: { id; name?; type?; accentColor?; logoUrl?; domain?; tenant?; adsCustomerId?; createdAt?; updatedAt? }): Project` into `types.ts` (already the shared, dependency-light home), and a `defaultsForNewProject(input): {name; accentColor}` helper; have both `toProject`s and both `createProject`s call them. Zero behavior change, one place to fix defaults.
