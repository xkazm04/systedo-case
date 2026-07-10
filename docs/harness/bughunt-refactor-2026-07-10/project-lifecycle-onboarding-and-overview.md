# Project Lifecycle, Onboarding & Overview

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. New project's Start wizard pre-fills with a DIFFERENT project's scanned business profile (global localStorage slot)

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/app/modules/OnboardingModule.tsx:144`
- **Scenario**: `OnboardingModule` drives its review form from `useAiTool<OnboardingScanResult>("onboarding-scan")` (line 137). On mount, `useAiTool`'s restore effect (`useAiTool.ts:120-149`) reads `resultKey(mode, variant)` = `systedo.ai.result.onboarding-scan` — a slot with **no project scoping** (`useAiTool.ts:37-38`) — and, if a prior scan is persisted, sets `status="done"` with that stored result. Back in `OnboardingModule`, the render-time seeder `if (scanned && scanned !== seededScan && mode === "scan") { setSeededScan; setProfile(scanned); setMode("review") }` (lines 144-150) then fires. Repro: onboard project A (scan `acme.cz`) → its result is written to the global slot; create project B and open `/app/B/start`. B is un-onboarded so `mode` initializes to `"scan"` (line 129), the restore effect hydrates A's result, and B's review form is auto-populated with A's `businessName`/`summary`/`offering`/`audience`/`keywords`/`competitors`. Clicking "Apply and seed the app" (line 296) POSTs `{ scan: { ...profile /* = A's data */, scannedUrl: B's url } }` to `/api/projects/B/onboarding`, writing A's competitors + grounding into B.
- **Root cause**: the onboarding-scan persistence key is global (`mode` only, no project variant), but the scan result is per-project business data; the component treats any restored "done" result as this project's scan.
- **Impact**: cross-project (and, for an agency, cross-client) data bleed — one project's brand profile leaks into every newly created project's onboarding and can be persisted as that project's competitors/AI grounding.
- **Fix sketch**: pass a per-project `variant` to `useAiTool("onboarding-scan", project.id)` so the slot is `…onboarding-scan.<projectId>`; and/or gate the seeder on `!progress.scanApplied && !progress.scan` (only seed when this project has never scanned) rather than on any restored "done" result.

## 2. Creating a "Local" project shows NO selected brand-color swatch — its default accent isn't in the palette

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/create-project-shared.tsx:13`
- **Scenario**: `ACCENTS = ["#14b8b1","#0e9c97","#6366f1","#8b5cf6","#fb7141","#d4503e"]` (line 13). `CreateProjectForm.pickType` sets `accent = PROJECT_TYPE_META[pt].defaultAccent` (line 111; initial state line 105). Four of five type defaults are in `ACCENTS` (eshop `#14b8b1`, app `#6366f1`, leadgen `#fb7141`, content `#0e9c97`), but **`local`'s default is `#0891b2`** (`types.ts:118`), which is absent from `ACCENTS`. `ProjectDetailsFields` highlights the selected swatch via `accent === c` (create-project-shared.tsx:132,135,137); since no swatch equals `#0891b2`, selecting the Local type leaves the entire brand-color row showing nothing selected even though a valid accent is set and will be saved.
- **Root cause**: the `ACCENTS` swatch list and the per-type `defaultAccent` values are two independent hand-maintained hex lists that were never reconciled — `local` was given a teal (`#0891b2`) that isn't one of the six presets.
- **Impact**: user-visibly-broken affordance for every Local-project creation (looks like no brand color chosen); the same mismatch also blanks the picker in ProjectSettings when editing any Local project.
- **Fix sketch**: either add `#0891b2` to `ACCENTS`, or set `local.defaultAccent` to an existing preset; better, derive `defaultAccent` from `ACCENTS` (e.g. index per type) so a type's default is provably in the swatch set.

## 3. `OnboardingModule`'s `TYPE_LABEL` re-declares project-type names that have already drifted from `projectTypeMeta`

- **Severity**: Medium
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/app/modules/OnboardingModule.tsx:29`
- **Scenario**: Every other lifecycle surface (ProjectsHome:126, ProjectSwitcher:68/100, CreateProjectForm:179, PortfolioCompare:54) renders a project type's label through the single source of truth `projectTypeMeta(type, locale).label` (`types.ts:139`). `OnboardingModule` instead hardcodes its own `TYPE_LABEL: Record<ProjectType,{cs,en}>` (lines 29-35) for the "Suggested type" line (line 286). The two have **already diverged**: `leadgen` is `Poptávky`/`Lead-gen` here vs canonical `Leady / služby`/`Leads / services`; `content` is `Obsahový web`/`Content` vs `Obsah / média`/`Content / media`; `local` is `Lokální podnik`/`Local business` vs `Lokální SEO`/`Local SEO`; `eshop` EN is `E-commerce` vs canonical `E-shop`. So the same type is named differently on the onboarding screen than everywhere else. (Distinct from the prior report's finding #4, which was about hardcoded Czech `aria-label`s in `ChipEditor`, not `TYPE_LABEL`.)
- **Root cause**: `OnboardingModule` was written with a private label map instead of importing `projectTypeMeta`, so it never tracked the canonical labels' later edits.
- **Impact**: user-visible label inconsistency for 4 of 5 types; a future type rename in `PROJECT_TYPE_META` won't reach the onboarding "suggested type" text.
- **Fix sketch**: delete `TYPE_LABEL`, import `projectTypeMeta`, and render `projectTypeMeta(profile.suggestedType as ProjectType, locale).label` (guarded by the existing `KNOWN_TYPES`/optional check) at line 286.

## 4. Project name is validated trimmed but submitted raw — projects get created with whitespace names

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/create-project-shared.tsx:57`
- **Scenario**: `useProjectDraft.submit` guards on `if (!name.trim())` (line 57) but sends the un-trimmed value: `body: JSON.stringify({ name, ... })` (line 67) — only `domain` is trimmed. Entering `"  Acme  "` passes the non-empty check and is posted verbatim; the project is stored with leading/trailing spaces, which then read oddly in the switcher/cards (`truncate` alignment, `· domain` spacing) and defeat any name-based comparison/sorting.
- **Root cause**: trimming was applied to the validation predicate and to `domain`, but not to the `name` actually sent.
- **Impact**: data-hygiene — persisted project names carry stray whitespace; minor visual/ordering degradation, no crash.
- **Fix sketch**: send `name: name.trim()` in the POST body (line 67), mirroring the existing `domain.trim()` treatment.

## 5. `ChipEditor` keys and removes chips by their string value; AI-scanned lists aren't de-duplicated

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/modules/OnboardingModule.tsx:444`
- **Scenario**: `ChipEditor` renders `values.map((v) => <span key={v}>…<button onClick={() => onChange(values.filter((x) => x !== v))}>` (lines 444-455). Manual adds are de-duplicated case-insensitively (line 436), but the initial `profile.keywords`/`profile.competitors` come straight from the scan result, and the server's `cleanList` (`tools/_shared.ts:7`) trims/drops blanks but **does not de-duplicate**. So a model that returns e.g. `competitors: ["Alza","Alza"]` yields two chips with the same React `key` (dev warning + reconciliation hazard), and removing one removes both (the `x !== v` filter drops every match).
- **Root cause**: chips are identified by their value rather than a stable index/id, on the assumption values are unique — which holds for user input but not for un-deduped scan output.
- **Impact**: duplicate-key React warning and a confusing "remove deletes two chips" interaction when a scan returns repeated keywords/competitors.
- **Fix sketch**: de-dupe when seeding (`Array.from(new Set(...))` in `normalizeOnboardingScan`, or in the `set("keywords"/"competitors")` seam) and/or key/remove chips by index so identical values remain independently removable.
