# App Shell & Shared Chrome — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. AppShellSkeleton no longer mirrors the real sidebar — 40px layout shift on reveal, stale doc comment
- **Severity**: High
- **Lens**: ambiguity
- **Category**: skeleton-geometry-drift
- **File**: src/components/app/AppShellSkeleton.tsx:8,12 (vs src/components/app/AppSidebar.tsx:106)
- **Scenario**: Any authed navigation into a project renders the Suspense skeleton first. The skeleton rail is `w-64` (256px) and shaped as a single flat column, but the real sidebar is `w-[296px]` with a two-level rail+panel layout (SectionRailNav). When the real shell resolves, the whole content column jumps 40px left and the sidebar silhouette changes shape.
- **Root cause**: The sidebar was redesigned to the 296px "Variant B" rail+panel, but the skeleton — whose own doc comment still promises "Mirrors AppShell's rail geometry (w-64) … so revealing the real shell doesn't shift layout" — was never updated. The comment now actively asserts the opposite of reality.
- **Impact**: Visible CLS on every project entry, defeating the skeleton's stated purpose; the misleading comment will steer the next developer to trust `w-64` as the canonical rail width.
- **Fix sketch**: Rebuild the skeleton as `w-[296px]` with a `w-[74px]` icon-rail strip + item panel matching SectionRailNav's silhouette, and either extract a shared `RAIL_WIDTH` token or add a comment in both files pointing at each other so they can't drift silently again.

## 2. Modal claims `aria-modal` but has no focus trap and never restores focus on close
- **Severity**: High
- **Lens**: ui
- **Category**: modal-focus-management
- **File**: src/components/app/Modal.tsx:47-61,74-76
- **Scenario**: A keyboard or screen-reader user opens any Modal (the app's only reusable dialog, used for table → detail/add flows). Tab walks straight out of the dialog into the scroll-locked page behind the backdrop; on close, focus is dropped on `<body>` instead of returning to the triggering button.
- **Root cause**: The effect moves initial focus into the panel (`panelRef.current?.focus()`) but implements neither Tab/Shift+Tab cycling within the panel nor storage/restore of `document.activeElement`. `aria-modal="true"` tells AT the background is inert, but nothing actually makes it inert.
- **Impact**: WCAG 2.4.3 failure in the shared primitive — every current and future modal in the app inherits it. Keyboard users can activate invisible controls behind the backdrop; screen-reader users lose their place after closing.
- **Fix sketch**: In the same effect, capture `document.activeElement` and refocus it in cleanup; add a keydown Tab handler that wraps focus among the panel's focusable elements (or `inert` the sibling app root while open).

## 3. Topbar page title ignores locale — contradicts its own "same as the sidebar" contract
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: i18n-label-divergence
- **File**: src/components/app/AppTopbar.tsx:28 (vs src/components/app/nav/SectionRailNav.tsx:153)
- **Scenario**: A user switches the app to English. The sidebar renders module names via `moduleLabel(module, locale)`, but the topbar `<h1>` returns `active?.label` — the raw (Czech default) registry field. The heading and the highlighted nav item now name the same page in two languages.
- **Root cause**: `useActiveModuleLabel` was written against the registry's plain `label` and never updated when locale-aware `moduleLabel()` became the accessor, despite the comment above it promising "the topbar names the page the same way the sidebar does (single source of truth = the module registry)".
- **Impact**: Mixed-language chrome for every non-Czech user on every module page; the comment misleads future readers into believing parity is guaranteed.
- **Fix sketch**: Use `useLocale()` and return `active ? moduleLabel(active, locale) : project.name` in `useActiveModuleLabel`.

## 4. Headerless Modal has no visible close affordance
- **Severity**: Medium
- **Lens**: ui
- **Category**: missing-close-affordance
- **File**: src/components/app/Modal.tsx:80-95
- **Scenario**: A caller renders `<Modal open onClose={…}>` without `title`/`description` (both optional). The entire header row — including the only X button — is skipped, so the dialog can only be dismissed via Escape or clicking the backdrop, neither of which is discoverable, and the backdrop is unreachable on `size="full"` at narrow widths where the panel nearly fills the viewport.
- **Root cause**: The close button lives inside the `(title || description) &&` conditional block, coupling the dismiss control to optional header content.
- **Impact**: Touch users (no Escape key) can get functionally stuck in headerless dialogs; also removes the accessible name (`aria-label` derives from `title`), leaving an unlabeled `role="dialog"`.
- **Fix sketch**: Always render the X button — absolutely positioned in the panel's top-right corner when there is no header row — and require either `title` or an explicit `ariaLabel` prop so the dialog is always named.

## 5. Mobile drawer: no Escape-to-close, no focus move, and 300px vs 296px width drift
- **Severity**: Medium
- **Lens**: ui
- **Category**: drawer-interaction-gaps
- **File**: src/components/app/AppSidebar.tsx:111-123
- **Scenario**: On mobile, tapping the hamburger opens the drawer. Escape does nothing (unlike Modal and CommandPalette); focus stays on the now-obscured hamburger button, so a keyboard/AT user is left behind a `backdrop-blur` overlay with no announcement; and the drawer is `w-[300px]` while the desktop rail is `w-[296px]` — a magic-number near-duplicate with no comment explaining whether the 4px difference is intentional.
- **Root cause**: The drawer is hand-rolled conditional JSX rather than reusing the overlay behaviors Modal already centralizes (Escape handler, scroll lock, initial focus), and the two widths were typed independently.
- **Impact**: Inconsistent dismissal model across the app's overlays; keyboard users must Tab blindly to find the invisible full-screen close button; background page still scrolls under the open drawer (no body-scroll lock).
- **Fix sketch**: Add an Escape keydown listener + body-scroll lock gated on `mobileOpen`, move focus to the drawer (`tabIndex={-1}` + focus on open, restore on close), and unify the width via one shared constant/class with a comment if 300 vs 296 is deliberate.
