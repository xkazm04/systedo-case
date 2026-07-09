# App Shell & Shared Chrome

> Context #0 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 2, Medium: 2, Low: 1)
> Files read: 17

## 1. AppShellSkeleton's rail width no longer matches AppSidebar's

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/AppShellSkeleton.tsx:9-15`
- **Scenario**: `AppShellSkeleton`'s own docstring says it "Mirrors AppShell's rail geometry (w-64, md-and-up) so revealing the real shell doesn't shift layout," and renders `<aside className="... w-64 ...">` (256px). But the real rail it's supposed to mirror, `AppSidebar.tsx:106`, renders `<aside className="... w-[296px] ...">` (296px). Every time a user opens `/app/[projectId]` and the Cache-Components Suspense boundary in `src/app/app/[projectId]/layout.tsx:27` swaps this skeleton for the real `AppShell`, the sidebar visibly jumps 40px — exactly the layout shift the component exists to prevent.
- **Root cause**: The two widths are independent hardcoded literals; `AppSidebar`'s rail width was presumably widened (296px, likely to fit the two-level rail nav content) after the skeleton was authored, and the skeleton's copy was never updated to match.
- **Impact**: A visible, reproducible CLS regression on the most common navigation path into the product (every fresh project entry with a cold Suspense boundary), directly contradicting the component's documented contract.
- **Fix sketch**: Change `AppShellSkeleton.tsx:12` from `w-64` to `w-[296px]` (matching `AppSidebar.tsx:106`). Better: hoist the literal into a single exported constant (e.g. `RAIL_WIDTH_PX` or a shared Tailwind class string) in `shell-context.tsx` or a small `rail-geometry.ts`, imported by both `AppSidebar.tsx` and `AppShellSkeleton.tsx`, so the two can't drift again.

## 2. Active-module-key is derived twice, two different ways, in sibling shell components

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/AppSidebar.tsx:40-44`
- **Scenario**: `AppSidebar`'s `SidebarBody` computes the active module key as `pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split("/")[0]! : ""`. `AppTopbar.tsx:24-27` (`useActiveModuleLabel`) computes the *same* value independently as `pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : ""` then `.split("/")[0]`. Both exist solely to answer "which module is the current route on" — the sidebar uses it to highlight the active nav item, the topbar to resolve the page title — but they're two hand-written, subtly different parsers of the same URL shape living in the same folder.
- **Root cause**: No shared "current module" primitive exists, so each component that needed the active key wrote its own pathname-slicing logic.
- **Impact**: Two independent implementations of navigation-critical logic have to be kept in sync by hand. They happen to agree today only because `base` is always the exact prefix of `pathname` for these routes; any future routing change (catch-all segments, trailing slashes, a `/app/[projectId]/settings/[tab]` split) is a bug waiting to land in only one of the two call sites, causing the sidebar highlight and topbar title to disagree.
- **Fix sketch**: Extract a single `useActiveModuleKey(project.id)` hook (e.g. in `shell-context.tsx`, which both `AppSidebar.tsx` and `AppTopbar.tsx` already import from) that both components call instead of re-deriving the key inline.

## 3. `moduleHref` is reimplemented, unexported, in two files

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/AppSidebar.tsx:22-24`
- **Scenario**: `AppSidebar.tsx` defines a private, unexported `function moduleHref(projectId, key) { return key ? \`/app/${projectId}/${key}\` : \`/app/${projectId}\`; }`. `src/components/app/ProjectOverview.tsx:198-200` (not in this context, but the other copy) independently defines a same-named local closure with byte-identical logic: `` (projectId, key) => (key ? `/app/${projectId}/${key}` : `/app/${projectId}`) ``. There is no shared canonical version anywhere in `src/lib/projects/` — both authors reinvented the same one-liner.
- **Root cause**: The href-building rule is trivial enough that it was inlined each time it was needed instead of being added to the module registry (`src/lib/projects/modules.ts`), which both files already import from.
- **Impact**: Low bug risk today (both copies agree), but it's the kind of "just three lines, I'll inline it" duplication that silently drifts — e.g. if the app ever needs query-string or hash preservation on module links, only one of the two copies would likely get updated.
- **Fix sketch**: Add `export function moduleHref(projectId: string, key: string): string { ... }` to `src/lib/projects/modules.ts` (pure, already imported by both a client component and server components, so no boundary risk), and update `AppSidebar.tsx` and `ProjectOverview.tsx` to import it instead of each defining their own.

## 4. AppSidebar's brand link, footer link, and mobile-drawer chrome are hand-copied from DemoShell

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/AppSidebar.tsx:60-90,110-123`
- **Scenario**: `AppSidebar`'s `SidebarBody` passes `SectionRailNav` a `railTop` brand link and `panelFooter` "back to website" link whose JSX is near-byte-identical to `src/components/demo/DemoShell.tsx:77-118`'s `SidebarBody` (same wrapper classes, same icon sizes, only the `href` and translated string differ). `AppSidebar.tsx:110-123`'s mobile-drawer markup (backdrop button + `animate-drop` sliding `<aside>`) is also duplicated verbatim in `DemoShell.tsx:148-167`, down to the exact Tailwind class strings (`fixed inset-0 z-40 bg-onyx/40 backdrop-blur-sm`, `animate-drop fixed inset-y-0 left-0 z-50 w-[300px] ...`). `SectionRailNav`'s own docstring already says it's "Shared by the authed AppSidebar and the public DemoShell — each supplies its own groups, link builder, active test and header/footer chrome," but the *chrome itself* (brand link, footer link, drawer shell) was never extracted the same way the nav body was.
- **Root cause**: `SectionRailNav` was factored out as the shared two-level nav, but the surrounding shell chrome (brand mark, footer link, mobile drawer wrapper) was copy-pasted into both `AppSidebar` and `DemoShell` instead of being extracted alongside it.
- **Impact**: Three separate blocks of pixel-identical markup to keep in sync by hand across two files whenever the drawer animation, backdrop opacity, or brand-mark styling changes (as already happened once for the rail width — see finding #1).
- **Fix sketch**: Extract a `MobileDrawer({ open, onClose, children, widthClassName })` primitive (own file under `src/components/app/nav/`) for the backdrop+sliding-aside pattern, and a small `BrandRailLink({ href, onClick })` component for the logo link; have both `AppSidebar.tsx` and `DemoShell.tsx` use them. The footer "back to website" link is short enough that extracting `MobileDrawer` and `BrandRailLink` captures most of the duplication; leave the two-line footer link as-is unless a third consumer appears.

## 5. Modal's `sm` size variant is dead code

- **Severity**: Low
- **Category**: dead-code
- **File**: `src/components/app/Modal.tsx:10-15`
- **Scenario**: `ModalSize` is `"sm" | "md" | "lg" | "full"`, and `SIZES.sm = "max-w-md"`. A repo-wide grep for every `<Modal` call site (`ArticleDraftPanel.tsx`, `OrganicChannels.tsx`, `ContentEngine.tsx` ×3) shows none pass `size="sm"`; the only explicit sizes used anywhere are `"lg"` and `"full"`, with the rest relying on the `"md"` default. `sm` has never been reachable since `Modal` was introduced (per its own docstring, it replaced several hand-rolled dialogs, none of which needed a narrower-than-`md` width).
- **Root cause**: The size scale was defined up front to match a generic modal-size convention rather than driven by an actual caller need.
- **Impact**: Minimal — one unreachable map entry and one unreachable union member. Not a maintenance burden, just unverified surface area in a shared primitive's public API.
- **Fix sketch**: Either drop `"sm"` from `ModalSize`/`SIZES` until a caller needs it, or leave it if the team considers a small-dialog size a near-term product need (it costs nothing to keep). Flagged for awareness rather than urgency.
