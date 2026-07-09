# Project Lifecycle, Onboarding & Overview

> Context #1 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 18

## 1. ProjectDetailsFields' accent palette + input styling is byte-copied into ProjectSettings, and the copy has already drifted

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/create-project-shared.tsx:13-141`
- **Scenario**: `create-project-shared.tsx` defines `export const ACCENTS = ["#14b8b1", "#0e9c97", "#6366f1", "#8b5cf6", "#fb7141", "#d4503e"]` (line 13) and `export const inputClass = "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-navy-800 placeholder:text-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"` (lines 15-16), then renders the accent swatch picker at lines 124-141. `src/components/app/modules/ProjectSettings.tsx` (the project **edit** form, one screen away) redefines both constants verbatim as private, non-exported copies (`ACCENTS` at line 66, `inputClass` at lines 68-69) instead of importing the exported ones, then re-renders its own swatch picker at lines 193-208. The copies have **already diverged**: `create-project-shared.tsx`'s selected swatch gets `ring-2 ring-offset-2 ring-offset-surface` in addition to the box-shadow (line 134-136), while `ProjectSettings.tsx`'s selected swatch only gets the box-shadow — no ring class at all (line 203-204). A user picking the same accent color sees a visibly different "selected" affordance depending on whether they're creating vs. editing a project.
- **Root cause**: `ProjectSettings.tsx` was written by copy-pasting the create-project fields instead of importing `ACCENTS`/`inputClass`/`ProjectDetailsFields` from `create-project-shared.tsx`.
- **Impact**: Two hand-maintained copies of the brand palette and one of the app's base input styles. The visual drift already happened once (missing ring) and will keep happening — a future palette change (e.g. adding a 7th accent) requires editing two files, and it's easy to update only one.
- **Fix sketch**: In `modules/ProjectSettings.tsx`, drop the local `ACCENTS`/`inputClass` consts and import `ACCENTS`, `inputClass` from `@/components/app/create-project-shared`; ideally also reuse the `ProjectDetailsFields` swatch-button JSX by extracting it into a small exported `AccentPicker({ value, onChange })` in `create-project-shared.tsx` that both `ProjectDetailsFields` and `ProjectSettings` render, so the ring-on-select behavior can't drift again.

## 2. `defaultModules()`/`packageSize()` re-derive "modules available for this project type" instead of calling the existing `modulesFor()`

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/create-project-packages.ts:26-47`
- **Scenario**: `moduleStatus(m, type)` (line 26-32) computes `const inType = m.availableFor.includes(type)` and `defaultModules(type)` (line 35-42) collects every `MODULES` entry where that inline predicate is true. This is exactly the predicate `src/lib/projects/modules.ts:430-434` already exports as `modulesFor(type)` (`MODULES.filter((m) => m.availableFor.includes(type))`), which the sidebar (`AppSidebar.tsx`) and the project card module-count (`ProjectsHome.tsx:127`) both call instead of re-deriving. `create-project-packages.ts` is the one place in the app that reimplements the availability check by hand rather than calling the shared helper.
- **Root cause**: `create-project-packages.ts` predates or was written independently of `modulesFor()`, and needed the extra "core" vs. "on" vs. "add" classification so it grew its own type-membership check alongside it instead of composing with the existing one.
- **Impact**: Two independent implementations of "is module X available for project type Y." They agree today only because both ultimately read `m.availableFor`, but the moment `modulesFor()` gains any additional condition (a feature flag, a plan-tier gate, anything beyond `availableFor`), `defaultModules()`/`packageSize()` will silently fall out of sync — the create-project matrix would show a stale default package and a wrong "N modules" count on the type headers, with no compiler error to catch it.
- **Fix sketch**: In `moduleStatus()`, replace `const inType = m.availableFor.includes(type);` with a check against a memoized `modulesFor(type)` key set (or simply keep `moduleStatus` as the single place doing the raw check but have `defaultModules`/`packageSize` build directly from `modulesFor(type).map(m => m.key)` intersected with `moduleStatus`'s core/on classification). Either way, route the "is this module in the type's package" question through `modulesFor()` so there is one source of truth.

## 3. ProjectOverview's default module-href builder duplicates AppSidebar's private `moduleHref()`

- **Severity**: Low
- **Category**: duplication
- **File**: `src/components/app/ProjectOverview.tsx:198-200`
- **Scenario**: `ProjectOverview.tsx` builds its default `moduleHref` as `hrefForModule ?? ((projectId, key) => (key ? \`/app/${projectId}/${key}\` : \`/app/${projectId}\`))`. `src/components/app/AppSidebar.tsx:22-24` defines the identical logic as a module-private `function moduleHref(projectId: string, key: string): string { return key ? \`/app/${projectId}/${key}\` : \`/app/${projectId}\`; }`. Same route convention, two hand-written copies.
- **Root cause**: `AppSidebar.tsx`'s helper isn't exported, so `ProjectOverview.tsx` had no importable version to reuse and rewrote the same one-liner inline.
- **Impact**: Low today (it's a trivial, stable route shape), but it's the third+ place in the codebase with this exact `key ? .../${key} : ...` conditional (also inlined ad hoc in a few module components) — if the authed module route prefix ever changes from `/app/` it has to be hunted down in each copy.
- **Fix sketch**: Move `moduleHref` out of `AppSidebar.tsx` into a small framework-free helper (e.g. `src/lib/projects/routes.ts`, alongside the existing framework-free `modules.ts`/`types.ts`) and have both `AppSidebar.tsx` and `ProjectOverview.tsx` import it as the default for their local href builders.
- **Build risk**: Don't just export `moduleHref` from `AppSidebar.tsx` and import it into `ProjectOverview.tsx` — `AppSidebar.tsx` is a `"use client"` module and `ProjectOverview.tsx` is a server component; `tsc` won't flag pulling a client-marked module into server code, but it's the wrong direction across the boundary this codebase treats as load-bearing. Put the helper in a plain (no `"use client"`) lib file instead so both sides import from a neutral module.

## 4. OnboardingModule's chip editor hardcodes Czech aria-labels, bypassing the file's own `t()`/locale system

- **Severity**: Medium
- **Category**: cleanup
- **File**: `src/components/app/modules/OnboardingModule.tsx:450,471`
- **Scenario**: Every other string in `OnboardingModule.tsx` — including the two `ChipEditor` instances' own visible labels and placeholders — goes through the file's `T`/`useT` locale table (`t("fKeywords")`, `t("addPlaceholder")`, etc.), so the component correctly speaks English when `locale === "en"`. But inside `ChipEditor` itself, the remove-chip button is `aria-label={\`Odebrat ${v}\`}` (line 450) and the add button is `aria-label="Přidat"` (line 471) — both literal Czech, not run through `t()`. An English-locale screen-reader user hears "Odebrat <value>" and "Přidat" while every other control around them is announced in English.
- **Root cause**: `ChipEditor` was written as a small local helper and its `aria-label`s were filled in with the obvious Czech word rather than plumbed through the `T` table already used by its caller.
- **Impact**: Small blast radius (two labels, one component) but a genuine, provable accessibility/locale inconsistency in a file that otherwise fully localizes — not a "maybe someone meant it," it's inconsistent with the surrounding code in the same function.
- **Fix sketch**: Add `removeAria: "Odebrat {v}"/"Remove {v}"` and `addAria: "Přidat"/"Add"` keys to the `T` object in `OnboardingModule.tsx`, thread `t` (or the two resolved strings) into `ChipEditor`'s props, and replace the two literals with the translated values.

## 5. The create-project trio sits flat in `components/app/` while the sibling `overview/` folder already shows the intended pattern

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/app/CreateProjectForm.tsx:1-32`
- **Scenario**: `CreateProjectForm.tsx` imports its two co-located helper modules via relative paths (`./create-project-packages`, `./create-project-shared`, lines 31-32) — three files that only make sense together (the matrix UI, the package/status model, and the shared draft-state + fields). In the same directory, `overview/` already groups exactly this shape of relationship — `PortfolioCompare.tsx`, `LocationsOverviewSection.tsx` and `compare.ts` (the type/logic module the two components share) — into their own subfolder. The create-project trio is the same pattern (one composing component + helper modules) but wasn't given the same treatment, so `components/app/` mixes flat single-purpose components (`ProjectSwitcher.tsx`, `SampleDataNote.tsx`, `DismissOnboarding.tsx`) with a naming-prefix convention (`create-project-*`) that a folder would express more directly.
- **Root cause**: The `overview/` grouping was likely introduced after `create-project-*` already existed with its filename-prefix convention, and the two were never reconciled.
- **Impact**: Purely discoverability/consistency — no runtime cost. Low risk to fix, but also low urgency; worth doing opportunistically (e.g. next time one of these three files is touched for something else) rather than as a standalone change.
- **Fix sketch**: Move `CreateProjectForm.tsx`, `create-project-packages.ts` and `create-project-shared.tsx` into a new `src/components/app/create-project/` folder (keeping filenames, or trimming the now-redundant `create-project-` prefix once inside the folder), update the two external importers (`ProjectsHome.tsx`'s `import CreateProjectForm from "@/components/app/CreateProjectForm"`) to the new path, and keep the two internal relative imports (`./create-project-packages`, `./create-project-shared`) as-is since they move together.
