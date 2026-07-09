# Projects, Project State & Project Data Spine

> Context #43 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 1, Low: 3)
> Files read: 17

## 1. `modules.ts`'s local `ALL` array duplicates `types.ts`'s `PROJECT_TYPES` — a silent-gap landmine, not a type error

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/projects/modules.ts:58`
- **Scenario**: `modules.ts` declares its own `const ALL: ProjectType[] = ["eshop", "app", "leadgen", "content", "local"]` (line 58) and uses it as `availableFor: ALL` on 18 of the ~31 module entries. This is a byte-for-byte duplicate of `PROJECT_TYPES` already exported from `src/lib/projects/types.ts:17`, which `modules.ts` already imports the `ProjectType` *type* from but not the *value*. `types.ts`'s own header comment promises: "Adding one here [a `ProjectType`] flows through the module registry + onboarding automatically (a missing preset is a type error)" — true for `KPI_PRESETS` (a `Record<ProjectType, KpiDef[]>`, so the compiler forces an update) but **false** for `ALL`, which is a plain array literal with no static exhaustiveness check.
- **Root cause**: `ALL` was hand-written locally instead of importing the canonical list, presumably to avoid a value import when only the type was needed originally.
- **Impact**: the moment a 6th `ProjectType` is added to `PROJECT_TYPES`, the compiler forces the author to fix `KPI_PRESETS` (Record) but says nothing about `ALL` (array). Every module with `availableFor: ALL` — including core ones like `vykon`, `klicova-slova`, `reporty`, `nastaveni`, `ucet`, `twin`, `schranka`, `sprava-kanalu` — silently excludes the new type from the sidebar (`modulesFor`) and 404s its pages (`isModuleAvailable`, consumed by `src/lib/projects/guard.ts`). No error, no warning — just a broken app for the new project type until someone notices.
- **Fix sketch**: in `modules.ts`, replace the local declaration with `import { PROJECT_TYPES } from "./types";` and `const ALL = PROJECT_TYPES;` (or reference `PROJECT_TYPES` directly at each `availableFor: ALL` site). Arrays are currently identical, so this is a zero-behavior-change edit that closes the gap permanently.

## 2. `vary.ts`'s `hash32` reimplements `seed.ts`'s `seed01` hash core

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/project-data/vary.ts:56-64`
- **Scenario**: `vary.ts` already imports `seedScale` and `TYPE_BASE_FOR` from `./seed`, but its private `hash32()` (lines 56-64) re-implements the exact same FNV-1a loop as `seed01()` in `src/lib/project-data/seed.ts:8-15` — same magic constants (`2166136261`, `16777619`), same `charCodeAt`/`Math.imul` loop — differing only in the final line (`seed01` normalizes to `(h % 10_000) / 10_000`; `hash32` returns the raw `h >>> 0`).
- **Root cause**: `projectVary()`'s seeded wobble PRNG needs a raw 32-bit seed rather than `seed01`'s normalized float, so a second copy of the hash was written instead of factoring out the shared core.
- **Impact**: the two files' header comments both lean on a "deterministic, distinct-but-stable per-project" guarantee (dataset scaling in `seed.ts`, module-fixture variation in `vary.ts`). If the hash ever needs a fix (e.g. better distribution, or a bug), a maintainer editing one copy can easily miss the other, silently breaking the "two seeded helpers agree on what a project's identity hashes to" assumption nothing currently tests for.
- **Fix sketch**: in `seed.ts`, extract the loop into `export function fnv1a32(s: string): number { let h = 2166136261; for (...) { ... } return h >>> 0; }`, rewrite `seed01` as `(fnv1a32(id) % 10_000) / 10_000`, then have `vary.ts` import `fnv1a32` from `./seed` and delete its local `hash32`.

## 3. Five `IconKey` union members (`plus`, `folder`, `speed`, `locations`, `clusters`) are never produced anywhere

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/projects/icon-keys.ts:21-36`
- **Scenario**: grepped every producer of an `IconKey` value in the app — all `icon:` fields in `MODULES` and `PROJECT_TYPE_META` (`modules.ts`, `types.ts`) plus every direct `<ModuleIcon icon={...}>` call site (`ProjectSwitcher.tsx`, `ProjectsHome.tsx`, `ProjectOverview.tsx`, `PortfolioCompare.tsx`, `SectionRailNav.tsx`, `CatalogManagerModule.tsx`, `OnboardingModule.tsx`, `ProjectSettings.tsx`) — none ever assigns `"plus"`, `"folder"`, `"speed"`, `"locations"`, or `"clusters"`. Yet `MODULE_ICONS: Record<IconKey, Icon>` in `src/components/app/icon-map.tsx:43-84` is forced by the `Record` type to map all five to real components (`Plus`, `Folder`, `Bolt`, `Layers`, `Network`) and import them from `@/components/icons` — dead weight dragged in purely because the union still lists them.
- **Root cause**: likely relics from an earlier module (e.g. an older `rychla-reakce` speed-to-lead inbox or a standalone locations/clusters module) that got folded into other modules (`schranka`, `lokalni`, `knihovna`) under different icon keys, per the comments in `modules.ts:265-267,298-300`.
- **Impact**: low but real — a reader extending `IconKey` doesn't get pushed toward reuse since 5 "free" unused keys already exist, and `icon-map.tsx` carries 5 permanently-unreachable map entries + imports.
- **Fix sketch**: remove `plus`, `folder`, `speed`, `locations`, `clusters` from the `IconKey` union in `icon-keys.ts`; TypeScript will then flag the now-excess keys in `MODULE_ICONS`, so drop those 5 entries and the now-unused `Plus`/`Folder`/`Bolt`/`Layers`/`Network` imports in `icon-map.tsx`.

## 4. `PROJECT_HOME_SEGMENT` is exported but never imported anywhere

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/lib/projects/types.ts:194`
- **Scenario**: `export const PROJECT_HOME_SEGMENT = "";` is documented as "The default home module for a freshly-opened project," but a repo-wide grep (not just `src/`) finds zero references outside this declaration line. The one place that plausibly wants it — `modules.ts:64`, the `"Přehled"` (Overview) module's `key: ""` — uses a bare literal `""` instead of importing the named constant.
- **Root cause**: added as self-documenting intent but never wired to its intended call site.
- **Impact**: minor — a reader who finds this export expects it to be load-bearing somewhere; it isn't, so it's just noise today.
- **Fix sketch**: either delete the export, or (the more useful direction, since the constant genuinely names a real convention) import it in `modules.ts` and use it for the overview module's `key: ""` (and anywhere else a route-segment literal `""` currently means "home"), making the constant load-bearing instead of dead.

## 5. Six near-identical `locale === "en" ? … : …` resolvers spread across `types.ts` and `modules.ts`

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/projects/modules.ts:507-554`
- **Scenario**: `moduleLabel`, `moduleBlurb`, `sectionLabel`, `kpiLabel` and `kpiHint` in `modules.ts` (lines 507-554) each hand-roll the same one-line branch — `return locale === "en" ? X.en : X.cs` (or the `KPI_HINTS` lookup equivalent) — to resolve a cs/en pair. `projectTypeMeta()` in `src/lib/projects/types.ts:139-158` does the identical thing at object-granularity (an `if (locale === "en") return {...}; return {...}` building four fields at once) rather than sharing a primitive with the other five.
- **Root cause**: every new bilingual concept (module label, blurb, section header, KPI label, KPI hint, project-type meta) got its own copy-pasted ternary instead of one shared helper, even though both files already import `SupportedLocale` from the same `@/lib/format`.
- **Impact**: low today — each instance is 1-4 lines and currently correct — but the pattern will likely be copy-pasted an nth time as more fields go bilingual, and a transposed `en`/`cs` branch in any one copy wouldn't be caught by the others (no shared test surface).
- **Fix sketch**: add a tiny generic `export function localize<T>(locale: SupportedLocale, en: T, cs: T): T { return locale === "en" ? en : cs; }` (e.g. alongside `SupportedLocale` in `@/lib/format`, or in `types.ts` since both files already import from there), then rewrite the six call sites to use it. Zero behavior change — verified each site matches the same `en`-selects / `cs`-falls-through direction.
