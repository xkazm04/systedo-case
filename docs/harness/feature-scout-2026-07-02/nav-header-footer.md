# Feature Scout — Header & Footer Navigation (systedo-case, 2026-07-02)

> Total: 5 ideas
> Context files: src/components/site/Nav.tsx, src/components/site/Footer.tsx, src/components/site/TaskPager.tsx, src/components/site/ThemeToggle.tsx, src/lib/nav.ts

## 1. Show journey position in the TaskPager ("Úkol 2 ze 4" + progress dots)
- **Impact**: 6/10
- **Effort**: 2/10
- **Risk**: 1/10
- **Flags**: none
- **Category**: user_benefit
- **File**: `src/components/site/TaskPager.tsx:64`
- **Opportunity**: The pager already computes the full ordered `sequence` and the current `index` (lines 51-52) but throws that information away — the kicker line only says "Pokračujte případovou studií" with no sense of how far along the reviewer is or how much remains. Docs-style pagers (the pattern this component explicitly imitates) normally show step position.
- **Why valuable**: A hiring reviewer deciding whether to keep reading needs to know the journey is short ("2 ze 4, jen dva kroky zbývají") — visible progress measurably reduces mid-journey abandonment, and the mobile menu already frames pages as "Úkol N", so the vocabulary exists.
- **Build sketch**: In the same server component, render "Úkol {index} ze {sequence.length - 1}" (excluding task 0/Přehled to match the assignment framing and the mobile menu's `messages.nav.task` badge) plus a row of small filled/empty dots derived from `sequence`. Add the two label keys to the existing `T` cs/en dict resolved via `getT`. Pure server render, no state, no build-mode concerns; sequence/index are already there.

## 2. Let the theme toggle return to "follow the system" (three-state cycle) and localize its label
- **Impact**: 5/10
- **Effort**: 2/10
- **Risk**: 2/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/site/ThemeToggle.tsx:14-26`
- **Opportunity**: The theme system is deliberately three-state — the layout's no-flash script (layout.tsx:54-57) documents "absence of a stored choice means follow the system" — but the toggle only ever writes `light`/`dark`. After one click the visitor is pinned forever; there is no UI path back to system-follow (`localStorage.removeItem` is never called). Separately, the button's aria-label/title is hard-coded Czech ("Přepnout světlý a tmavý režim") while every sibling control in the header localizes via `messages.nav.*`.
- **Why valuable**: Users who toggle once to peek at the other palette can never re-sync with their OS schedule (auto dark at night) — a silent, permanent downgrade of a feature the code already supports. The untranslated label is the only en-locale leak left in the header chrome.
- **Build sketch**: Cycle light → dark → system: the system step does `delete root.dataset.theme` + `localStorage.removeItem("theme")`, letting the existing `prefers-color-scheme` CSS take over (the pure-CSS icon swap already handles the unset state). Read the current mode exactly as `toggle()` does today (DOM-driven, no React state, so no hydration risk). Pull the label from `useLocale().messages.nav` (ThemeToggle is already `"use client"`; add `themeToggle` keys to `Messages.nav` in both locales), and have title/aria announce the mode the next click activates. Wave must run a full `next build` per the client-component rule.

## 3. Add a Cmd/Ctrl+K quick-nav palette driven by the typed nav model
- **Impact**: 7/10
- **Effort**: 5/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: feature
- **File**: `src/components/site/Nav.tsx:65` (actions cluster) + `src/lib/nav.ts:57`
- **Opportunity**: The site now has 11+ destinations (5 journey pages, 5 footer meta pages, `/clanek/vykon`, plus `/app` when authed) but the only ways to move are the 5-item header, the footer, and the linear pager. Nothing in the codebase offers keyboard-first navigation (only the dev-only DevInspector listens for keys). The typed nav model (`NAV_ITEMS` + `FOOTER_META_PAGES` + localized labels/blurbs) is exactly the registry a palette needs — it already guarantees the entries can't drift.
- **Why valuable**: For a portfolio whose audience is technical reviewers, a polished ⌘K palette is both a genuine speed feature (jump from `/kampane` to `/design-system` in two keystrokes) and a credibility signal — it demonstrates product craft using the site's own "single source of truth" architecture.
- **Build sketch**: Step 1: pure, framework-free `navSearchTargets(locale, authed)` + `matchNavTargets(query, targets)` in `src/lib/nav.ts`, merging `localizedNavItems` (label + blurb as search text) with `FOOTER_META_PAGES` (labels via `getMessages(locale).footer.links[key]`) and `/app` when authed; reuse the NFD diacritics-strip from `slugify` (nav.ts:93-99) for "clanek" → "Článek" matching; unit-test in `test-unit/` per convention. Step 2: a hand-rolled (no new dep) `"use client"` dialog island mounted in Nav with a global Cmd/Ctrl+K listener, arrow-key selection, `router.push`, and a `⌘K` hint chip in the desktop header. Mind LANDMINE 2: no `ref.current` reads in render, lazy `useState(() => …)` for once-at-mount values; full `next build` required.

## 4. Remember the reviewer's place and offer "Pokračovat" resume in the mobile menu
- **Impact**: 5/10
- **Effort**: 4/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: user_benefit
- **File**: `src/components/site/Nav.tsx:104-123` (mobile menu) + `src/components/site/TaskPager.tsx:44`
- **Opportunity**: The journey is designed to be walked in order across what is often more than one sitting, but the site has no memory: a reviewer who left at Úkol 3 returns to the overview and must reconstruct where they were. The theme system already establishes the localStorage-persistence pattern; nothing persists journey state.
- **Why valuable**: Hiring reviewers skim in fragments (a recruiter forwards, an engineer returns later); a one-tap "Pokračovat: Úkol 3 — AI asistent" resume link plus visited checkmarks turns a restart into a continuation and quietly shows the reviewer how much they've already covered.
- **Build sketch**: TaskPager renders a tiny null-UI `"use client"` beacon child that writes `localStorage["journey:visited"]` (append `current`) and `journey:last` in a mount effect (server shell + tiny client child is the house convention). In Nav's mobile menu — which only renders post-interaction, so reading localStorage there cannot cause a hydration mismatch — read the visited set in a lazy `useState(() => …)` initializer (LANDMINE 2 pattern), render a check glyph next to visited items' existing "Úkol N" badge, and a top "Pokračovat" row linking to the first unvisited task page. Localize the two new strings via `messages.nav`. Full `next build` required.

## 5. Navigate the case study with arrow keys (docs-pager hotkeys)
- **Impact**: 4/10
- **Effort**: 3/10
- **Risk**: 3/10
- **Flags**: [CLIENT]
- **Category**: functionality
- **File**: `src/components/site/TaskPager.tsx:59-72`
- **Opportunity**: The pager already emits semantic `rel="prev"/"next"` links (line 108) and imitates Stripe/Docusaurus — but the keyboard half of that pattern (←/→ to move between pages) is missing. The prev/next hrefs are computed server-side and simply discarded for keyboard users.
- **Why valuable**: Reviewers who commit to reading the whole study can flip through it like documentation without reaching for the mouse; combined with idea 1 it completes the "guided tour" feel the component's own comment aspires to.
- **Build sketch**: Have the server TaskPager render a null-UI `"use client"` `<PagerHotkeys prevHref nextHref />` child that adds a window keydown listener: on ArrowLeft/ArrowRight call `router.push`, bailing when any modifier is held or `event.target` is an input/textarea/select/contentEditable (the `/ai-asistent` and `/kampane` pages host forms). Show discreet `<kbd>←</kbd>/<kbd>→</kbd>` glyphs inside the existing PagerLink kicker rows so the affordance is discoverable. If idea 4 ships, the same island can host both effects. Full `next build` required.
