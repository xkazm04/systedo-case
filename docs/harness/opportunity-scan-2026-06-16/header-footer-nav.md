# Header & Footer Navigation — Opportunity Scan

> Total: 5 findings (Critical: 0, High: 2, Medium: 2, Low: 1)
> Lenses: Business Visionary + Feature Scout

## 1. TaskPager stops short of a guided "next task" call-to-action
- **Severity**: High
- **Lens**: Both
- **Category**: user_benefit
- **File**: src/components/site/TaskPager.tsx, src/lib/nav.ts
- **Opportunity**: The pager already orders the journey by `NAV_ITEMS[].task` (0→4) and renders prev/next cards, but the last task (`/kampane`, task 4) shows only a "Předchozí" card and the first (`/`, task 0) doesn't render the pager at all — so a reviewer who reaches the bonus page hits a dead end with no closing prompt (recap, "back to Mapa", contact/CTA). For a case study whose entire purpose is to convert a hiring reviewer, the final step is the highest-leverage moment and it currently fizzles.
- **Value**: This app is a sales pitch for a candidate. A strong terminal CTA ("Viděli jste všech 5 úkolů — zpět na Přehled / systedo.cz / kontakt") turns a passive end-of-scroll into a directed next action, which is exactly the differentiation a portfolio piece needs.
- **Effort**: S
- **Fix sketch**: When `next` is undefined in `TaskPager`, render a closing card instead of leaving the grid half-empty — point `prev` to the neighbour and add a synthesized "Zpět na Přehled" / `/mapa` card using `navLabel("/")`; optionally surface `item.task` ("Úkol 4 z 4") so progress is legible.

## 2. Header has no progress/scroll cue tying the case study together
- **Severity**: Medium
- **Lens**: Feature Scout
- **Category**: feature
- **File**: src/components/site/Nav.tsx
- **Opportunity**: The header is `sticky` and the nav already knows ordered `task` numbers via `NAV_ITEMS`, yet there is no "task N of 5" indicator or top reading-progress bar. The mobile menu hints at this (it prints `Úkol {item.task}`) but desktop and the active state give no sense of position in the documentation-style journey the TaskPager establishes.
- **Value**: A lightweight progress affordance (step counter or a 2px scroll-progress bar on the sticky header) reinforces the "five-task narrative" story, increases scroll-through, and signals product polish — cheap retention/engagement lift with no new data model.
- **Effort**: S
- **Fix sketch**: In `Nav`, derive the active item's `task` from `NAV_ITEMS` via the existing `isActive` match and render a subtle "Úkol {task}/4" pill next to the logo; or add a client scroll-progress bar absolutely positioned at the bottom edge of the `<header>`.

## 3. Footer "Stránky" and "O projektu" omit the bonus campaign value story
- **Severity**: Medium
- **Lens**: Business Visionary
- **Category**: differentiation
- **File**: src/components/site/Footer.tsx, src/lib/site.ts
- **Opportunity**: The footer lists every `NAV_ITEMS` page and four `STACK_FACTS`, but it never surfaces what the product actually *demonstrates* — the Google Ads console, AI campaign evaluation, or SQLite persistence as outcomes. Meta-pages that prove depth (`/clanek/vykon` data report, `/design-system`) are buried in the tiny bottom bar next to the copyright rather than presented as deliverables. The footer is prime real estate a reviewer always reaches, and it currently reads as a stack résumé, not a value proposition.
- **Value**: Reframing one footer column around capabilities/outcomes ("AI vyhodnocení kampaní", "datový report z dashboardu") tells a hiring reviewer *why the work matters*, not just *what framework was used* — direct differentiation in a portfolio context.
- **Effort**: S
- **Fix sketch**: Promote `/clanek/vykon` and `/design-system` from the bottom-bar strip into a proper "Ukázky / deliverables" footer column, and add an outcome-framed entry to `STACK_FACTS` (or a sibling `CAPABILITY_FACTS` array) in `src/lib/site.ts` so it stays single-sourced.

## 4. Header omits a cs/en language switch despite shipped localization
- **Severity**: High
- **Lens**: Both
- **Category**: feature
- **File**: src/components/site/Nav.tsx, src/lib/nav.ts
- **Opportunity**: The codebase already advertises bilingual support (`LocaleShowcase.tsx`, the design-system page blurb "lokalizace (cs/en)", `format.ts` locale handling), and the header is built around a typed `NAV_ITEMS` model — but there is no language toggle beside the `ThemeToggle`, and `NAV_ITEMS` labels/blurbs are Czech-only string literals. The localization capability is built but unwired at the navigation level, so an international (or non-Czech-speaking) reviewer cannot read the case study.
- **Value**: A digital-marketing agency case study aimed at a hiring audience benefits enormously from an English path; exposing the existing locale machinery via a header switch widens the addressable reviewer audience and showcases i18n competence as a selling point.
- **Effort**: M
- **Fix sketch**: Add a `LocaleToggle` next to `ThemeToggle` in `Nav` mirroring the cookie/`data-`-driven, no-flash pattern of `ThemeToggle`, and extend `NavItem` in `nav.ts` with `label`/`blurb` keyed by locale (or a `labels: Record<"cs"|"en", ...>`) so header, footer, pager and Mapa stay single-sourced.

## 5. ThemeToggle gives no signal that it follows the system by default
- **Severity**: Low
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/components/site/ThemeToggle.tsx
- **Opportunity**: The toggle is a clean two-state (light/dark) control, but its own docs note an implicit third state — "unset `data-theme` = follow system." A user can pin a choice but can never get back to "auto" without clearing storage, and there is no visual indication of which mode is currently effective vs. explicitly chosen. This is a small but real power-user/accessibility gap in an otherwise meticulous component.
- **Value**: Respecting a "system" option is an accessibility and trust signal (users who change OS theme expect the site to follow); a tri-state control demonstrates attention to detail that fits this project's "důraz na UX" positioning. Low effort, visible polish.
- **Effort**: S
- **Fix sketch**: Make `toggle` cycle light → dark → system (the latter deletes `data-theme` and removes the `localStorage` key) and reflect the active state via `aria-pressed`/title text; the existing CSS icon-swap can add a third "auto" glyph keyed off the absence of `data-theme`.
