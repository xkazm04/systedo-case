# App Shell & Shared Chrome

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Sign-in gate hardcodes `callbackUrl: "/app"`, silently dropping the deep-link destination

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/app/AppSignInGate.tsx:78`
- **Scenario**: `src/app/app/layout.tsx:30` gates *every* `/app/*` route — including deep links like `/app/{projectId}/kampane` or a shared/bookmarked module URL — behind `AppSignInGate` for any anonymous visitor. When that visitor clicks "Sign in with Google", the button calls `signIn("google", { callbackUrl: "/app" })` with a **hardcoded** `/app`. After the OAuth round-trip they land on the bare `/app` root (project picker), never on the project/module they actually followed the link to.
- **Root cause**: The gate assumes it is only ever mounted at `/app`, so it hardcodes the return path instead of reading where the user actually is. But the same gate component is rendered for the whole authed subtree (`layout.tsx` is the root of `/app/[projectId]/...`), so the assumption is false for every deep link.
- **Impact**: User-visibly broken auth flow on the primary conversion path. Anyone opening a shared client link, a bookmark, or "resume where you left off" URL while logged out is dumped at a generic screen after login and must re-navigate — worst for exactly the high-intent traffic (shared reports, project links) the funnel most wants to convert.
- **Fix sketch**: Make the gate destination-aware: in `AppSignInGate` read `const pathname = usePathname()` (it is already a client component) and call `signIn("google", { callbackUrl: pathname || "/app" })`; or have `AuthGate` in `layout.tsx` pass the current path down as a prop. Include search params if module state lives there.

## 2. Modal's focus effect depends on `onClose`, re-running (and yanking focus) on every owner re-render

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/app/Modal.tsx:61`
- **Scenario**: The single open-lifetime effect has dependency array `[open, onClose]` and, on each run, calls `panelRef.current?.focus()` (line 55). All three call sites pass an inline arrow — `onClose={() => setCluster(null)}`, `onClose={() => setWs(null)}`, `onClose={() => setBuilderOpen(false)}` in `ContentEngine.tsx:408,433,438`, and likewise in `OrganicChannels.tsx` / `ArticleDraftPanel.tsx` — so `onClose` gets a **new identity on every render of the owner**. Any time the owner re-renders while the modal is open (a context update, a timer, a sibling state change, streaming AI results into the same component), the effect tears down and re-runs, and `panelRef.focus()` fires again — pulling focus off whatever input/control the user is interacting with inside the dialog and back onto the panel `<div tabIndex={-1}>`.
- **Root cause**: `onClose` is in the dependency array (only `open` needs to be), and the one-time "focus into the dialog on open" behavior is placed in an effect that re-runs on that unstable dep instead of firing once per open transition. The Escape `keydown` listener is also needlessly detached/reattached each cycle.
- **Impact**: Mid-interaction focus theft and dropped keystrokes in the brief→draft workspace and other in-modal forms whenever the owner happens to re-render; today the blast radius is limited only because the current call sites keep their form state inside child components, making this a booby-trap for the next caller who holds modal form state locally.
- **Fix sketch**: Drop `onClose` from the deps (read it via a ref, or split into two effects: `[open]` for focus + scroll-lock, and a stable Escape handler). Only call `panelRef.focus()` on the open transition, not on every effect run.

## 3. Modal claims `aria-modal` but has no focus trap and never restores focus on close

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/Modal.tsx:75`
- **Scenario**: The panel renders `role="dialog" aria-modal="true"`, but nothing constrains Tab order. A keyboard or screen-reader user who opens any modal (e.g. the `full` brief→draft workspace) and presses Tab past the last control walks straight out of the dialog into the still-rendered page behind the backdrop. On close, focus is never returned to the element that opened the dialog — it is left on `document.body`, so keyboard users lose their place entirely.
- **Root cause**: The dialog implements the *visual* modality (backdrop, scroll lock, Escape) and the initial focus-in, but not the *interaction* modality (`aria-modal="true"` promises the rest of the page is inert, which is untrue) — there is no Tab-cycle trap and no "restore focus to the trigger" on unmount.
- **Impact**: Accessibility failure / degraded UX for keyboard and AT users on every dialog in the app (the component is the app's only shared overlay), and an `aria-modal` value that lies to assistive tech.
- **Fix sketch**: Trap Tab within the panel (cycle first/last focusable, or a small `useFocusTrap`), and capture `document.activeElement` on open to `.focus()` it back in the cleanup. Consider `inert` on the app root while open.

## 4. Mobile drawer neither locks body scroll nor closes on Escape

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/components/app/AppSidebar.tsx:111`
- **Scenario**: When the mobile drawer is open (`mobileOpen`), the backdrop button (line 113-118) is the *only* dismissal affordance. Unlike `Modal`, the drawer does not set `document.body.style.overflow = "hidden"`, so the page behind the `bg-onyx/40` overlay scrolls freely under the user's finger while the nav is open, and there is no `Escape`-to-close key handler. The public twin `DemoShell.tsx:149-167` has the identical gap. (The authed drawer at least closes on route change via the `usePathname` effect at `AppSidebar.tsx:99-101`; `DemoShell` navigates by `?m=` query so `pathname` never changes and even that safety net is absent there.)
- **Root cause**: The drawer overlay was built as bespoke markup rather than reusing `Modal`'s overlay primitive (scroll-lock + Escape + focus handling), so it inherited none of those behaviors.
- **Impact**: On touch devices the background bleeds/scrolls behind the menu (janky, easy to mis-tap the wrong content); keyboard users can't dismiss the drawer with Escape. Low severity but a real mobile-UX rough edge on the primary nav.
- **Fix sketch**: Lock body scroll while `mobileOpen` and add an `Escape` keydown handler that calls `setMobileOpen(false)` — ideally by extracting the shared `MobileDrawer` primitive the prior report's finding #4 already proposed, so both `AppSidebar` and `DemoShell` get it.

## 5. The topbar header shell is duplicated between AppTopbar and DemoShell

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/app/AppTopbar.tsx:37`
- **Scenario**: `AppTopbar.tsx:37-56` and `DemoShell.tsx:171-199` render a byte-identical topbar frame: the same `<header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">`, the same `md:hidden` hamburger button (`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-navy-700 hover:bg-navy-50`), the same truncated `<h1 className="truncate text-[17px] font-semibold tracking-tight text-navy-800">` title, and the same right-hand `LocaleSwitcher` + `ThemeToggle` cluster. The prior code-refactor report (2026-07-09) called out the *sidebar* chrome duplication between `AppSidebar` and `DemoShell` (its finding #4) and the active-key derivation shared by `AppSidebar`/`AppTopbar` (its finding #2), but the **topbar header shell** duplication between `AppTopbar` and `DemoShell` is not named anywhere in it.
- **Root cause**: `DemoShell` was written as a hand-copied "visual twin" of the authed shell; the sidebar body was factored into the shared `SectionRailNav`, but the topbar was inlined into both `AppTopbar` and `DemoShell` rather than extracted.
- **Impact**: Two copies of the topbar's exact layout/height/blur/z-index to keep in sync by hand; a change to topbar height or sticky offset (which the sibling `AppSidebar`/`SectionRailNav` geometry already depends on) has to be mirrored in two files or the demo drifts from the product.
- **Fix sketch**: Extract an `AppTopbarShell({ title, badge?, leading?, actions })` presentational component under `src/components/app/` and have both `AppTopbar` and `DemoShell` render it, each supplying its own title source, hamburger handler, and right-side actions.
