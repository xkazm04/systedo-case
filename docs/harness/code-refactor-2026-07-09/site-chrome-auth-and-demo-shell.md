# Site Chrome, Auth & Demo Shell

> Context #12 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 15

## 1. Two independent route matchers for "is this the /app or /dashboard product surface" have drifted, so the marketing fade plays on a nested demo route it's meant to skip

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/site/ChromeGate.tsx:12`
- **Scenario**: `ChromeGate` hides the header/footer for the authed `/app` workspace and the public `/dashboard` demo, matching both the bare route and any nested path: `pathname === "/app" || pathname.startsWith("/app/") || pathname === "/dashboard" || pathname.startsWith("/dashboard/")`. `src/app/template.tsx:17` (not in this context, but the sibling matcher) reimplements the same "is this a data-tool surface" test independently: `const fade = !pathname.startsWith("/app") && pathname !== "/dashboard";` — it never checks for a `/dashboard/`-prefixed path. The gap is reachable: `src/app/dashboard/report/page.tsx` is a real nested route (`DemoModule`'s "vykon" case links to it via `reportHref="/dashboard/report"`) that renders `DemoShell` exactly like `/dashboard` itself. `ChromeGate` correctly keeps chrome hidden there, but `template.tsx` computes `fade = true` for `/dashboard/report`, wrapping it in `animate-fade-in` — the same 0.4s opacity fade the file's own comment says "reads as lag, not polish" on data tools. A reviewer clicking "Datový report" from the demo dashboard gets a fade-in stutter every other module click doesn't have.
- **Root cause**: the "is this a data-tool route" predicate was hand-copied into two files instead of shared, and only one copy was updated when the nested `/dashboard/report` route was added.
- **Impact**: a visible, inconsistent transition on a real, linked-to route; the next new nested route under `/app/*` or `/dashboard/*` is equally likely to silently inherit the same mismatch since there's no single source of truth to update.
- **Fix sketch**: extract a shared `isProductSurfacePath(pathname: string): boolean` (ChromeGate's, more-correct, version) into a small pure helper — e.g. `src/lib/nav.ts` alongside the other route helpers (`navSearchTargets`, `localizedNavItems`) already imported by this context's `Nav.tsx`/`CommandPalette.tsx`. Have both `ChromeGate.tsx` and `template.tsx` import and call it instead of each inlining the check.

## 2. The `/dashboard` loading skeleton's rail width has drifted from the real shell it's meant to mirror, causing a layout shift on first paint

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/demo/DemoShellSkeleton.tsx:8`
- **Scenario**: `DemoShellSkeleton`'s own doc comment says it "Mirrors DemoShell's frame so the paint is stable," but its desktop rail is `w-64` (256px) while the real shell it mirrors, `src/components/demo/DemoShell.tsx:144`, renders `w-[296px]` (296px). `src/app/dashboard/page.tsx` uses this skeleton as the `Suspense` fallback for every `/dashboard` load, so first paint shows a 256px rail that snaps to 296px the instant `DemoWorkspace` resolves — a visible ~40px content-jump on the very moment the skeleton exists to prevent. This is not a one-off typo: the sibling pattern for the authed app has the identical drift — `src/components/app/AppShellSkeleton.tsx:8,12` explicitly claims to mirror "AppShell's rail geometry (w-64, md-and-up)" but the real rail, `src/components/app/AppSidebar.tsx:106`, is also `w-[296px]`. Both skeletons were written against an older 256px rail width and never updated when the real shells were widened to 296px.
- **Root cause**: the skeleton hardcodes a dimension copied from the real shell at authoring time instead of sharing a single source (constant or the same class); the real shell's width later changed and neither skeleton followed.
- **Impact**: a real, reproducible CLS-style layout jump on every cold `/dashboard` load (and, in the sibling `/app` skeleton, every cold `/app` load) — exactly the flicker the skeleton was built to avoid.
- **Fix sketch**: change `w-64` → `w-[296px]` on `DemoShellSkeleton.tsx:8` to match `DemoShell.tsx:144`. Since this exact drift now exists in two independent files (this one and the out-of-context `AppShellSkeleton.tsx`), consider a shared constant (e.g. `RAIL_WIDTH_CLASS = "w-[296px]"` exported from a small shared module) that both skeletons and both real shells import, so a future rail-width change can't silently desync the fallback again.

## 3. The Google "G" glyph SVG is hand-duplicated between the two sign-in entry points instead of using the shared icon barrel

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/auth/AuthButton.tsx:69-78`
- **Scenario**: `AuthButton.tsx` defines a private `GoogleGlyph()` with a 4-path, 4-color Google "G" logo (`width={15} height={15}`). The exact same path data and fill colors are hand-copied into `src/components/app/AppSignInGate.tsx:97-106`'s own private `GoogleGlyph()`, differing only in `width={16} height={16}`. Both files already import shared icons (`Search`/`Close`/`Logo`/`Menu`/`Check`/`ArrowRight`/`External`/`Bolt`, all defined in `src/components/icons.tsx`) for everything else — the Google glyph is the one icon that bypassed that shared barrel.
- **Root cause**: each sign-in button was built independently and the author copy-pasted the SVG rather than adding it to the existing icon barrel.
- **Impact**: any future brand-guideline tweak to the Google mark (or fixing the already-diverged 15px/16px sizing) means editing two files in sync; the size mismatch present today is a small preview of that drift risk.
- **Fix sketch**: move the SVG into `src/components/icons.tsx` as an exported `Google` icon (matching the existing icon components' `width`/`height` prop signature), then have `AuthButton.tsx` and `AppSignInGate.tsx` both `import { Google } from "@/components/icons"` and delete their local `GoogleGlyph` functions.

## 4. `DemoModule.tsx` is a single 653-line switch dispatching ~40 module keys, each with its own bespoke data-prep block

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/demo/DemoModule.tsx:140-652`
- **Scenario**: every public-demo module — from `vykon` through `aktivita` — is one `case` in a single giant `switch` inside one file, each case pulling in its own sample-data helpers (profit, catalog, LTV, SEO-compare, local, mappack, twin, distribution, content-schedule, audience, …). The file's own header comment defends keeping it in one place ("so the 22 real module pages under /app/[projectId]/* stay untouched"), which is a reasonable call, but the result is a 650+-line file mixing unrelated domains (inventory seasonality math, LTV cohorts, monthly-report snapshot building) that all have to be scrolled past to find or touch any one module's demo wiring.
- **Root cause**: new demo modules were appended to the same switch as the product grew, rather than being split the way the equivalent authed modules already are (one file per module under `src/components/app/modules/`).
- **Impact**: no correctness risk today, but every new module case (this file has grown to ~40) makes the single file harder to navigate and raises the odds of an unrelated merge conflict when two modules are edited in the same PR.
- **Fix sketch**: split along the file's own section comments (`Overview` / `Acquisition` / `Studio` / `Insights` / `System`) into a handful of sibling files under `src/components/demo/modules/` (e.g. `acquisition.tsx`, `studio.tsx`, `insights.tsx`, `system.tsx`), each exporting a `render(moduleKey, project, warehouse)` function for its cases; `DemoModule.tsx` becomes a thin dispatcher that tries each section's map in turn before falling through to the default `ProjectOverview`. Pure move-and-wire — no data-prep logic needs to change.

## 5. Two near-identical "keyboard hint chip" components live uncombined in the same directory

- **Severity**: Low
- **Category**: duplication
- **File**: `src/components/site/CommandPalette.tsx:10-16`
- **Scenario**: `CommandPalette.tsx` defines a private `Kbd` (`rounded border ... px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted`, always visible) to render the `⌘K`/`Ctrl K` and `Esc` hints. `src/components/site/TaskPager.tsx:136-145` defines a near-twin `PagerKbd` (`rounded border ... px-1 py-px text-[10px] font-medium normal-case leading-none text-muted`, `aria-hidden`, shown only via `[@media(hover:hover)]:inline-block`) for the `←`/`→` pager hints. No third copy exists anywhere else in `src/` — this is fully contained within files this context owns.
- **Root cause**: both were built independently for their own affordance rather than sharing one small chip primitive with a size/visibility variant.
- **Impact**: cosmetic only today (both are private, single-use), but any future styling pass on "the keyboard-hint chip look" (border-radius, font, padding) has to be applied twice and re-verified twice to stay consistent.
- **Fix sketch**: extract a single `KeyChip({ children, hoverOnly, size }: ...)` into a small shared file (e.g. `src/components/site/KeyChip.tsx`), with `size="sm"` (`text-[11px]`, always visible) for `CommandPalette` and `size="xs" hoverOnly` (`text-[10px]`, `aria-hidden`, the `[@media(hover:hover)]` gate) for `TaskPager`; both call sites import it instead of defining their own local component.
