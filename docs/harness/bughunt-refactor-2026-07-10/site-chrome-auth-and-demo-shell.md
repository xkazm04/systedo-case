# Site Chrome, Auth & Demo Shell

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. The mobile "Pokračovat" resume link is permanently pinned to Dashboard and the journey can never reach "finished"

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/site/Nav.tsx:48`
- **Scenario**: A reviewer walks the case study, visits `/clanek`, `/ai-asistent`, and `/kampane`, then opens the mobile menu on `/kampane`. The "Pokračovat — Úkol 1 — Dashboard" banner is still shown, pointing *backward* to a task they saw long ago, and the Dashboard row never shows its visited checkmark. The journey never presents a "complete" state in the menu.
- **Root cause**: The visited set is written **only** by `TaskPager`'s `JourneyBeacon` (`markVisited`), and `TaskPager` is rendered on just three routes — `/clanek`, `/ai-asistent`, `/kampane` (verified: no other `TaskPager` call sites). But `/dashboard` is `task: 1` in `NAV_ITEMS` and its page (`src/app/dashboard/page.tsx`) renders `DemoShell`, which has **no** `TaskPager`/beacon. So `/dashboard` is never added to `visited`, and `firstUnvisited(navItems, visited)` — which walks task-ordered pages and returns the first not in `visited` — returns `/dashboard` on every journey page forever (`resumeTarget.href !== pathname` is always true off `/dashboard`, where chrome is hidden).
- **Impact**: The guided-tour resume affordance — a prominent CTA on the flagship hiring case study — is visibly and persistently wrong: it always advertises the earliest stop and never advances, and the Dashboard row's "visited" mark is unreachable. Degrades the primary deliverable's navigation UX.
- **Fix sketch**: Emit a beacon for the demo stop too — render `<JourneyBeacon current="/dashboard" />` from `DemoShell` (or `dashboard/page.tsx`) on mount — so `/dashboard` enters the visited set like every other task page; alternatively exclude non-beaconed task hrefs from `firstUnvisited`'s candidate set.

## 2. The entire Cmd/Ctrl+K command palette is dead code — the feature does not exist in the running app

- **Severity**: Medium
- **Lens**: code-refactor
- **Category**: dead-code
- **File**: `src/components/site/CommandPalette.tsx:25`
- **Scenario**: The manifest and file header describe a "Cmd/Ctrl+K quick-nav palette … the global shortcut works everywhere." A repo-wide search shows `CommandPalette` is imported/rendered **nowhere**: the only references are its own file, a passing mention in `Modal.tsx`'s comment, the scan manifest, and the prior harness docs. The root layout (`src/app/layout.tsx`) mounts `Nav`/`Footer` via `ChromeGate` but never the palette. Pressing Cmd/Ctrl+K in the live app does nothing.
- **Root cause**: The component (184 lines) was built and never wired into any layout or page. Its exclusive consumers `navSearchTargets` and `matchNavTargets` in `src/lib/nav.ts` are, in turn, referenced only by this dead component plus `test-unit/nav-search.test.mjs` — i.e. they are kept alive only by a unit test, not by any runtime path.
- **Impact**: A whole advertised feature is absent while looking present in docs/manifest; ~184 LOC of unused UI plus two transitively test-only `nav.ts` exports carry maintenance weight. Note this also undercuts the prior report's finding #5 (extract a shared `KeyChip` from `CommandPalette`'s `Kbd`), since that half of the duplication is dead.
- **Fix sketch**: Either mount `<CommandPalette authed={…} />` in `layout.tsx` (behind `ChromeGate`, wiring the `authed` prop from the session) to make the feature real, or delete `CommandPalette.tsx` and prune the now-orphaned `navSearchTargets`/`matchNavTargets` (and their test). This is a NEW finding — the prior code_refactor pass treated `CommandPalette` as a live component.

## 3. The header AI-quota chip is fetched once and never refreshed, so it silently shows a wrong remaining count for the whole session

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/usage/UsageMeter.tsx:19`
- **Scenario**: A signed-in user loads the app (chip fetches `/api/usage`, shows "AI 0/25"), then runs several AI evaluations. The chip still reads "AI 0/25" — `Nav` lives in the root layout and never unmounts across client navigations, and the fetch effect depends only on `[status]`, which flips to `authenticated` exactly once. The user believes they have full quota; approaching the cap they are blocked while the chip still implies headroom (or, conversely, shows "out" after a page that reset).
- **Root cause**: The meter treats daily quota as a mount-time constant. There is no refetch on route change, focus, or after an AI call completes, and no cross-component signal from the AI tools back to the chip.
- **Impact**: "Success theater" — the quota indicator lies for the remainder of the session after the first metered operation. The one piece of UI whose job is to surface the otherwise-invisible per-user limit is the piece most likely to be stale.
- **Fix sketch**: Refetch on a lightweight trigger — e.g. `refetchOnWindowFocus`-style listener, a `router`-pathname dependency, or a shared event/`storage` ping the AI tools emit after `consume()` — so the chip reconciles with the server counter instead of showing a frozen value.

## 4. The quota-chip tooltip is hard-coded Czech in an explicitly bilingual (cs/en) app

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/usage/UsageMeter.tsx:51`
- **Scenario**: An English-locale user hovers the header AI chip and gets a fully Czech tooltip: `AI vyhodnocení dnes: 3/25 · plán free · zbývá 22. Klikněte pro navýšení limitu.` Every other chrome string in this context flows through the `messages`/`useT` dictionaries, but this `title` (and the surrounding component) bypasses i18n entirely.
- **Root cause**: The tooltip string was inlined in Czech rather than sourced from the locale dictionary the rest of the header uses.
- **Impact**: Visibly untranslated UI for EN visitors on a case study that markets its bilingual support; minor but certain correctness gap.
- **Fix sketch**: Move the tooltip copy into the `nav`/usage message dictionary with `{used}/{limit}/{plan}/{remaining}` placeholders and render it via `useT`, matching `AuthButton`/`ThemeToggle`/`LocaleSwitcher`.

## 5. The signed-in Google avatar has no `referrerPolicy`, so it intermittently renders as a broken image

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/auth/AuthButton.tsx:33`
- **Scenario**: A signed-in user's `session.user.image` points at `lh3.googleusercontent.com`. Google frequently rejects avatar requests that carry a cross-origin `Referer` (or rate-limits them with 429), returning no image. Because the `<img>` sets neither `referrerPolicy="no-referrer"` nor an `onError` fallback and uses `alt=""`, the header shows the browser's empty/broken-image box instead of the intended avatar.
- **Root cause**: The Google-hosted avatar is embedded as a plain `<img>` without the `referrerPolicy="no-referrer"` that Google's user-content CDN expects, and with no graceful fallback to the initial-letter badge the component already renders when `image` is absent.
- **Impact**: Intermittent broken-image glyph in the authed header — cosmetic degradation, no functional loss.
- **Fix sketch**: Add `referrerPolicy="no-referrer"` to the `<img>`, and on `onError` fall back to the existing initials `<span>` (the same branch used when `image` is null).
