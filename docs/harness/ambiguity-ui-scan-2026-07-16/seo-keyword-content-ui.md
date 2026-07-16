# SEO, Keyword & Content Workspace — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Click-only table rows lock keyboard/AT users out of core actions
- **Severity**: High
- **Lens**: ui
- **Category**: row-click-no-keyboard-access
- **File**: src/components/app/modules/ContentEngine.tsx:311, src/components/app/modules/ContentEngine.tsx:371, src/components/app/modules/OrganicChannels.tsx:351
- **Scenario**: A keyboard or screen-reader user tabs through the Topic clusters table, the Decaying content table, or the Organic channels table. The rows are plain `<tr onClick={...}>` with `cursor-pointer` — no `role`, no `tabIndex`, no key handler, no focusable child that triggers the action.
- **Root cause**: The "row opens a modal" pattern was implemented three times as a bare `onClick` on `<tr>`, and these rows are the ONLY path to the cluster detail modal, the decay-refresh workspace, and the channel playbook (including its status setter and "Create content" button).
- **Impact**: Entire workflows (cluster briefs, content refresh, channel playbooks) are unreachable without a mouse; the rows are also invisible to assistive tech as interactive elements. Violates WCAG 2.1.1 on a primary navigation surface.
- **Fix sketch**: Extract one shared accessible clickable-row pattern: render the primary cell's label as a full-cell `<button>` (or give the row `role="button"`, `tabIndex={0}`, Enter/Space handler and an `aria-label`). Reuse it across all three tables — it's the same repeated pattern.

## 2. Scheduling into a full calendar silently strands the post in an unreachable state
- **Severity**: High
- **Lens**: ambiguity
- **Category**: calendar-overflow-unreachable-post
- **File**: src/components/app/modules/ContentSchedule.tsx:235, src/lib/content-schedule/compute.ts:39
- **Scenario**: All 28 days already hold 2 posts (capacity in `nextFreeDay`). The user clicks "Naplánovat" on another idea. `nextFreeDay` returns `WINDOW_DAYS - 1` (day 27) as a silent fallback, making it the 3rd post on that day — but the calendar renders only `cell.slice(0, 2)` and a non-interactive "+{n} další" label.
- **Root cause**: The compute helper's "returns the last day if the window is full" fallback is not surfaced anywhere in the UI, and the overflow indicator has no expansion affordance. The chip buttons are the only way to publish/unschedule a post.
- **Impact**: The post is persisted as `scheduled` (whole-board PUT) yet cannot be seen, published, or returned to the idea queue from the UI — silent data limbo. The user gets zero feedback that the calendar was full.
- **Fix sketch**: Either disable "Naplánovat" (with a tooltip) when `nextFreeDay` would overflow capacity, or make the "+{n} další" label a button that expands the day cell to show all posts. Also have `nextFreeDay` return `null` when full instead of a lying index, forcing callers to handle it.

## 3. "Napsat text" buttons on other posts silently no-op while one draft is running
- **Severity**: Medium
- **Lens**: ui
- **Category**: silent-noop-single-flight
- **File**: src/components/app/modules/ContentSchedule.tsx:121, src/components/app/modules/ContentSchedule.tsx:205
- **Scenario**: The user starts drafting copy for post A (a multi-second AI call), then clicks "Napsat text" on post B. `draftCopy` bails out at `if (draftingId) return`, but B's button is only disabled when `draftingId === p.id` — so it looks fully enabled and clicking it does nothing.
- **Root cause**: A global single-flight lock (`draftingId`) paired with per-post `disabled` logic — the disabled condition doesn't match the lock condition.
- **Impact**: Clicks vanish without feedback; users assume the feature is broken and re-click. Classic dead-button UX during exactly the moment (a slow AI call) when users are most likely to wander.
- **Fix sketch**: Change both buttons to `disabled={draftingId !== null}` (keeping the per-post "Píšu…" label on the active one), or drop the global lock and allow per-post concurrent drafting — `postsRef` already makes concurrent `setBody` safe.

## 4. Hardcoded Czech fallback strings leak past i18n into English UI and brief seeds
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: i18n-bypass-hardcoded-czech
- **File**: src/components/app/modules/ContentEngine.tsx:216, src/components/app/modules/OrganicChannels.tsx:231
- **Scenario**: (a) An EN-locale user arrives at the content engine via a session-storage handoff whose seed has an empty `topic` — the workspace modal title falls back to `T.cs.wsSeeded` ("Obsahový brief"), reaching directly into the Czech dict despite `t` being in scope. (b) An EN user clicks "Create content for this channel" on a channel without `contentAngle` — the brief topic becomes `` `${channel.name}: příspěvek pro ${project.name}` ``, a Czech string hardwired outside any `T` dict, which then seeds the AI brief.
- **Root cause**: Fallback branches were written after the happy path and bypassed the established `useT` pattern the rest of both files follow scrupulously.
- **Impact**: English users see Czech UI text, and worse, case (b) feeds a Czech topic into the AI content pipeline, skewing the generated draft's language. Future developers auditing i18n coverage via the `T` dicts won't find these strings.
- **Fix sketch**: Add `wsSeeded`-style keys to both dicts' fallback paths: `setWs({ ..., title: seed.topic || t("wsSeeded") })` (compute `t` before the effect or move the fallback into render), and a `defaultTopic: "{channel}: post for {brand}"` key in OrganicChannels resolved via `t(...)`.

## 5. Cluster → brief handoff discards the real keyword volumes it was built from
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: handoff-drops-grounding-data
- **File**: src/components/app/modules/ClusterBuilder.tsx:128
- **Scenario**: The user builds clusters from a saved list — `build()` deliberately sends each keyword's real `avgMonthlySearches` and classified intent so "the model groups by demand" (line 107 comment). Then "Vytvořit brief" runs `briefFromCluster`, which maps every supporting keyword to `{ keyword, volume: 0, competition: "" }` — even though the true volume/intent still sit in `selected.keywords` one closure away.
- **Root cause**: The seed shape was copy-pasted from CompareSeoTable's `onCreateFromOutline` (where criteria genuinely have no volume) instead of joining the cluster's supporting keywords back to the source list.
- **Impact**: The content brief downstream believes all supporting keywords have zero demand, undermining any volume-aware prioritization in the brief tool and contradicting the module's own selling point ("grounded in real keyword research"). Silent data degradation — nothing looks broken.
- **Fix sketch**: In `briefFromCluster`, look each `cluster.supporting` entry up in `selected.keywords` (case-insensitive match on `keyword`) and carry `volume: match?.avgMonthlySearches ?? 0` and the intent label as `competition`, falling back to 0 only for keywords the model invented.
