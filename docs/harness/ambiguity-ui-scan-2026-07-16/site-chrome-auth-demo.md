# Site Chrome, Auth & Demo Shell — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 4 medium / 0 low)

## 1. Command palette dialog has no focus trap and never restores focus on close
- **Severity**: High
- **Lens**: ui
- **Category**: modal-focus-management
- **File**: src/components/site/CommandPalette.tsx:120
- **Scenario**: A keyboard user opens the ⌘K palette and presses Tab: the option buttons are `tabIndex={-1}`, so focus jumps out of the `aria-modal="true"` dialog onto the page content hidden behind the backdrop (which is scroll-locked, so the focused element may not even be visible). Closing with Esc unmounts the input and drops focus to `<body>`, not back to the header trigger button.
- **Root cause**: The hand-rolled APG combobox implements arrow-key/activedescendant behavior but skips the other two modal requirements: containing Tab within the dialog and returning focus to the invoking element on close.
- **Impact**: Screen-reader and keyboard users escape into content that `aria-modal` claims is inert, and after closing they must re-tab from the top of the document — the two most user-visible modal a11y failures.
- **Fix sketch**: On Tab inside the dialog, `preventDefault()` (the only tabbable element is the input, so trapping is one line); in `close()`, refocus the trigger (`useRef` on the header button, or `document.activeElement` snapshot at open). Both fit the existing no-dependency approach.

## 2. Demo skeleton rail is 40px narrower than the real shell — guaranteed layout shift
- **Severity**: Medium
- **Lens**: ui
- **Category**: skeleton-frame-mismatch
- **File**: src/components/demo/DemoShellSkeleton.tsx:8
- **Scenario**: First load of /dashboard shows the Suspense skeleton (`w-64` = 256px rail), then the streamed DemoShell replaces it with a `w-[296px]` rail — the entire content column and topbar jump 40px left on every cold visit to the demo.
- **Root cause**: The skeleton's stated contract is "Mirrors DemoShell's frame so the paint is stable" (its own doc comment), but the two widths were edited independently with no shared constant.
- **Impact**: Visible CLS on the flagship public demo page — the exact flicker the skeleton exists to prevent, and the doc comment now lies to the next editor.
- **Fix sketch**: Use the same width literal in both files (or export `const DEMO_RAIL_W = "w-[296px]"` from DemoShell and import it in the skeleton). Also mirror the topbar's missing `justify-between`/actions block if pixel-stability matters there.

## 3. UsageMeter tooltip is hardcoded Czech in a fully bilingual chrome
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: i18n-drift
- **File**: src/components/usage/UsageMeter.tsx:51
- **Scenario**: An EN-locale signed-in user hovers the header quota chip and gets `AI vyhodnocení dnes: … · plán … · zbývá … Klikněte pro navýšení limitu.` — the only untranslated string in a header where every sibling (Nav, AuthButton, DemoShell) routes text through `useT`/`messages`. Nav.tsx:53 has the same problem with the hardcoded `aria-label="Adamant — domů"`.
- **Root cause**: The tooltip was written as a template literal instead of a `T = { cs, en }` table like AuthButton's; the aria-label predates localization.
- **Impact**: Undermines the locale switcher's promise, and since the chip's visible text is just `AI 3/10`, the tooltip is the only explanation of what the number means — EN users get none.
- **Fix sketch**: Move the tooltip into a local `T` table consumed via `useT` (pattern already in AuthButton.tsx:6); localize the Nav home-link aria-label via `messages.nav`.

## 4. UsageMeter fetches quota once per session and never revalidates
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: stale-data-contract
- **File**: src/components/usage/UsageMeter.tsx:19
- **Scenario**: The chip's stated purpose is to surface "the otherwise-invisible per-user plan limits", but the effect runs only when `status` flips to `authenticated`. A user runs several AI evaluations in /kampane or /ai-asistent; the header still shows the count from page load. They only discover they're out of quota when an action fails — the exact dead-end the meter was built to prevent.
- **Root cause**: One-shot fetch with no revalidation trigger — no interval, no focus refetch, no event from the AI actions that consume quota, and no cross-page freshness beyond full navigations (the chrome persists across client-side route changes).
- **Impact**: The meter is trustworthy only at the moment of page load; the warn thresholds (`ratio >= 0.8`, `remaining === 0`) fire late or never within a session.
- **Fix sketch**: Cheapest: refetch on `visibilitychange`/window focus and after route changes (`usePathname` dep). Better: have AI-eval call sites dispatch a `usage:changed` CustomEvent (or return updated usage in their responses) that the meter listens for.

## 5. Demo Account page renders sign-out/revoke buttons wired to a silent server no-op
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: silent-noop-affordance
- **File**: src/components/demo/DemoModule.tsx:123
- **Scenario**: A prospect exploring the public /dashboard demo opens the "Účet" module and clicks "sign out" or "sign out everywhere" (rendered with a claimed `sessionCount: 2`). `demoAccountAction` is an empty `"use server"` function — nothing happens: no navigation, no toast, no disabled state.
- **Root cause**: The comment documents the intent ("the buttons are shown for the tour") but the decision to leave them enabled-and-dead — rather than disabled with a "demo" explanation — is invisible to the visitor and to AccountSecurity, which renders them as fully live controls.
- **Impact**: In a hiring-pitch/demo context, a dead primary action on a security surface reads as a bug, not a tour; it is the one place in the demo where clicking produces literally zero feedback.
- **Fix sketch**: Pass a demo flag into AccountSecurity to render the actions disabled with a tooltip ("V ukázce nedostupné"), or have `demoAccountAction` redirect back with a `?demo-noop` toast param. Either makes the no-op an explained state instead of a silent one.
