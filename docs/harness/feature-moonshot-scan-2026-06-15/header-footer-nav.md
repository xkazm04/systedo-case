# Feature + Moonshot Scan — Header & Footer Navigation

> Context: ctx_1781547850475_nnjkipw
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Task-progress indicator wired into the nav model

- **Severity**: High
- **Lens**: feature-scout
- **Category**: user_benefit
- **Effort**: M (1-3d)
- **File**: `src/lib/nav.ts:NavItem` + `src/components/site/Nav.tsx` (desktop list) + `src/components/site/TaskPager.tsx`
- **Scenario**: This is a job-application case study. A reviewer (hiring manager) lands on `/` and has no idea the study is a structured 5-stop tour (`task: 0…4`) — the `task` field already encodes a journey but it is only surfaced as a tiny "Úkol N" label in the *mobile* menu (`Nav.tsx:94-96`). Desktop reviewers see five flat tabs with no sense of "where am I / how much is left."
- **Opportunity**: Promote the existing `task` ordering into a visible progress affordance. Add a slim "Úkol 2 / 4" caption + a 5-segment progress rail under the header on case-study pages, derived purely from `NAV_ITEMS.sort((a,b)=>a.task-b.task)` (the exact sequence `TaskPager` already computes). Mark visited stops using `localStorage` (same storage pattern `ThemeToggle` already uses). The TaskPager footer then reads "Hotovo 3 z 5 úkolů."
- **Impact**: Turns a flat link bar into a guided, completion-driven tour — the single most persuasive UX signal for a reviewer evaluating *product thinking*, which is exactly what the role tests. Zero new data model; reuses `task`.
- **Implementation sketch**: Add `export function taskSequence()` and `taskProgress(current)` helpers to `nav.ts` returning `{index, total, visited}`. New `src/components/site/TourProgress.tsx` (client, reads/writes `localStorage["visited"]`) rendered by `Nav` when `pathname` is a case-study route. Reuse the `bg-brand-500` underline token from `Nav.tsx:49` for filled segments.

## 2. Single-source-of-truth audit: kill the hard-coded footer "O projektu" facts

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: S (<1d)
- **File**: `src/components/site/Footer.tsx:57-62` (and `src/lib/nav.ts` as the SoT)
- **Scenario**: The whole context's thesis is "one typed navigation model so links never drift" (`nav.ts:1-2`). Yet the footer hard-codes stack facts — `"LLM · claude-sonnet (dev) · gemini-3-flash-preview (prod)"`, `"JSON persistence (bez DB)"` — while the home page reasoning, layout metadata (`layout.tsx:23 keywords`), and the kampane blurb (`nav.ts:46` "uložením do SQLite") describe the *same* stack. These already conflict: the footer says "bez DB / JSON persistence" but the Kampaně blurb says data is saved "do SQLite." A drift bug in a study whose whole point is no-drift.
- **Opportunity**: Extract a typed `STACK_FACTS` (and matching `PROJECT_META`) constant alongside `NAV_ITEMS` in `nav.ts`/`site.ts`, and render the footer column + layout keywords from it. Resolve the JSON-vs-SQLite contradiction in one place.
- **Impact**: Makes the codebase practice what the context preaches; eliminates an embarrassing factual contradiction a sharp reviewer *will* notice; future stack edits touch one file.
- **Implementation sketch**: Add `export const STACK_FACTS: string[]` to `src/lib/site.ts` (already imported by `layout.tsx`). Map it in `Footer.tsx:57-62`. Reconcile the SQLite claim with the Kampaně page's actual persistence; update `nav.ts:46` blurb to match.

## 3. Theme toggle → explicit tri-state (Light · Dark · System) with status reflection

- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: feature
- **Effort**: M (1-3d)
- **File**: `src/components/site/ThemeToggle.tsx` + `src/app/layout.tsx:44 themeScript`
- **Scenario**: The toggle is binary (`ThemeToggle.tsx:14-26`): the *first* click silently pins a choice and there is no way back to "follow the system" — once `localStorage["theme"]` is set, the elegant `prefers-color-scheme` fallback (`layout.tsx:43`) is dead forever. A reviewer who toggles to test it can never restore system-following without clearing storage. The button also gives no indication of the *current* mode beyond the icon.
- **Opportunity**: Make the toggle a 3-state cycle Light → Dark → System (System = `delete root.dataset.theme; localStorage.removeItem("theme")`), with the `aria-label`/`title` reflecting the active state ("Aktuálně: tmavý — kliknutím systémový"). Optionally a small dropdown instead of a cycle.
- **Impact**: Restores the carefully-built system-follow path, demonstrates accessible state communication (a11y is a stated project value, per the footer's `Footer.tsx:74`), and shows polish on the one interactive header control.
- **Implementation sketch**: Refactor `toggle()` in `ThemeToggle.tsx` into a 3-way cycle reading `localStorage.getItem("theme")` as `"light"|"dark"|null`. Add a tiny `data-theme-pref` reflection for CSS. The `themeScript` already no-ops on missing key, so System needs no script change.

## 4. URL-driven, deep-linkable section navigation ("scrollspy") generated from page anchors

- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: integration
- **Effort**: L (>3d)
- **File**: `src/lib/nav.ts` (extend the model) + `src/components/site/Nav.tsx` (sub-nav) + `TaskPager.tsx`
- **Scenario**: Each case-study page (Dashboard, Článek, AI asistent, Kampaně) is long and multi-section, but navigation stops at the *page* level — `NavItem` has no concept of in-page sections. A reviewer cannot deep-link to "the PNO chart" or "the SEO brief tool," and there's no active-section highlight. The header `isActive` logic (`Nav.tsx:10-12`) already does prefix matching, hinting the model could go one level deeper.
- **Opportunity**: Extend `NavItem` with an optional `sections: {id, label}[]`, then render a sticky secondary rail (sub-nav under the header on long pages) plus a scrollspy that updates the active section and the URL hash. The `TaskPager` "Pokračujte" footer becomes section-aware (jump to next *section*, then next *page*). One typed model now drives header tabs, sub-nav, scrollspy, deep links, and the pager — a true documentation-grade IA (the Stripe/Docusaurus pattern the `TaskPager` docstring `TaskPager.tsx:5-9` already aspires to).
- **Impact**: Elevates the study from "5 pages" to "navigable product docs," dramatically improving reviewer scannability and shareability of specific proof points (deep-link a single chart in a follow-up email). It's the kind of force-multiplier feature that makes the navigation model itself look like a product.
- **Implementation sketch**: Add `sections?` to `NavItem` in `nav.ts`; populate for `/dashboard`, `/ai-asistent`, `/kampane`. New `src/components/site/SectionRail.tsx` (client, `IntersectionObserver` for scrollspy, `history.replaceState` for hash sync). Wire each page's section wrappers to the declared `id`s. Extend `TaskPager` to consume `sections`.

## 5. Self-documenting "site map / IA" page and JSON-LD SiteNavigation from the one nav model

- **Severity**: Critical
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: M (1-3d)
- **File**: `src/lib/nav.ts:NAV_ITEMS` (source) + new `/mapa` route + `src/app/layout.tsx` (JSON-LD)
- **Scenario**: `NAV_ITEMS` already carries `href`, `label`, `blurb`, and `task` — enough to *fully describe the information architecture* — but that richness is only partially exposed (footer shows labels only; home cards show blurbs). Nothing emits machine-readable navigation, no `sitemap.xml`, and the case study never explicitly *shows* its own IA as a deliverable, even though "clean IA / one nav model" is its whole pitch (`nav.ts:1-2`, `Footer.tsx:74`).
- **Opportunity**: Generate three artifacts from the single model: (a) a `/mapa` ("Mapa případové studie") page rendering the task-ordered journey with blurbs as a visual IA diagram — turning the navigation model into a *presented deliverable* that says "I think in systems"; (b) `app/sitemap.ts` built by mapping `NAV_ITEMS`; (c) a `SiteNavigationElement` / `BreadcrumbList`-style JSON-LD block in `layout.tsx` derived from the same array (the `Breadcrumbs`/`Crumb` plumbing in `article/Breadcrumbs.tsx` shows the JSON-LD-from-typed-model pattern is already an established convention here).
- **Impact**: The strongest "category-defining" move for a *portfolio* artifact: the navigation model stops being plumbing and becomes the headline proof of systems thinking + SEO/structured-data competence — exactly the skills the AI Vibecoder role evaluates. Near-zero marginal data; pure derivation. This is the moonshot where the infrastructure *is* the product story.
- **Implementation sketch**: Add `export function sitemapEntries()` to `nav.ts`. New `src/app/sitemap.ts` (Next.js metadata route) mapping it. New `src/app/mapa/page.tsx` rendering the task-sorted journey (reuse `TaskPager`'s `[...NAV_ITEMS].sort((a,b)=>a.task-b.task)` and the home-card styling). Emit `SiteNavigationElement` JSON-LD in `layout.tsx` next to the existing metadata. Add `/mapa` link to `Footer.tsx`'s bottom bar beside "Design system."
