# Performance Dashboard & Reporting — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

## 1. Load-bearing explanations live only in native `title` tooltips — invisible on touch
- **Severity**: High
- **Lens**: ui
- **Category**: tooltip-only-critical-info
- **File**: src/components/dashboard/DeltaBadge.tsx:98 (also GoalPacing.tsx:219,225,232,262,318; PnoGauge.tsx:61; AlertsPanel.tsx:127,135; ChannelTable.tsx:106,180)
- **Scenario**: A client opens the dashboard on a phone or tablet (the layout is explicitly responsive: `min-[480px]:grid-cols-2`, scrollable Segmented). Every honesty mechanism the dashboard is built around — DeltaBadge's "· weak signal / · statistically insignificant / · orientational (no significance test)" suffix, GoalPacing's required-pace prescription ("≈ +X Kč/day of extra spend"), the goal/plan tick markers and the P10–P90 CI band values, AlertsPanel's impact/gained definitions — is delivered exclusively via the HTML `title` attribute, which never fires on touch and is unreliable for keyboard/screen-reader users.
- **Root cause**: Native `title` used as the sole channel for semantically essential text rather than as a redundant enhancement; no visible affordance (info icon, tap target, footnote) that the extra context exists.
- **Impact**: On touch, a "noise" delta pill looks identical to a real trend minus its explanation, gauge tick marks are unlabeled mystery lines, and the CI band is an unexplained gray bar — the product's core "never oversell noise" promise silently degrades for a large slice of users. Sighted desktop users also get zero discoverability cue that hovering reveals anything.
- **Fix sketch**: For the significance suffix, render it as visible microcopy (the muted pill already does this for "noise" — extend the pattern: a small "slabý signál" text or dot). For gauges, add a compact visible legend line (GoalPacing already has `gaugeNote` — reuse that pattern in PnoGauge/CI band and include the values). Keep `title` as a bonus, never the only carrier.

## 2. Segmented control claims the ARIA tabs pattern but implements none of it
- **Severity**: High
- **Lens**: ui
- **Category**: aria-tabs-misuse
- **File**: src/components/dashboard/vykon/Segmented.tsx:35-56
- **Scenario**: A screen-reader or keyboard user reaches the period / baseline / chart-metric selector. The container announces "tab list" and each option "tab, selected/not selected", so the user tries the tabs interaction contract: arrow keys to move between tabs, Tab to leave the widget. Arrows do nothing; every option is a separate Tab stop; there is no `aria-controls`/`tabpanel`, no roving `tabindex`.
- **Root cause**: `role="tablist"`/`role="tab"`/`aria-selected` were applied for the visual "sliding pill tabs" metaphor, but the widget is really a value selector (radiogroup semantics) and the required keyboard behavior of the tabs pattern was never implemented. The disabled yoy option compounds it: its only explanation is a `title` on a `disabled` button — unreachable by keyboard and touch entirely.
- **Impact**: Assistive-tech users get a widget that lies about how to operate it, on the three controls that drive the entire dashboard's state. Disabled yoy reads as arbitrarily broken because its "not enough history" reason is unreachable.
- **Fix sketch**: Switch to `role="radiogroup"` + `role="radio"`/`aria-checked` (or plain buttons with `aria-pressed`), or keep tabs semantics and add roving tabindex + ArrowLeft/ArrowRight handling. For disabled yoy, use `aria-disabled="true"` (keeps it focusable so the tooltip/label is announced) and surface the reason as an `aria-describedby` visually-hidden text.

## 3. ReportChat: a bucket switch without remount shows the old project's transcript and silently stops persisting
- **Severity**: High
- **Lens**: ambiguity
- **Category**: stale-state-on-prop-change
- **File**: src/components/dashboard/ReportChat.tsx:77-96
- **Scenario**: The `bucket`/`projectId` props change without the component remounting (a project switcher above this component that doesn't `key` it). `messages` was loaded once via the lazy initializer from bucket A; `loadedBucket.current !== bucket` now makes the persist effect return forever.
- **Root cause**: The guard (line 88-89) was added to prevent cross-bucket *writes*, but the read side has no corresponding reload: state initialization is one-shot, and nothing re-syncs `messages`/`loadedBucket` when `bucket` changes. The code comment explicitly anticipates "a later bucket change (project switch without a remount)" yet only half-handles it — the assumption "parent always remounts per project" is load-bearing and undocumented at any call site.
- **Impact**: The user sees project A's conversation while new questions are grounded server-side on project B (`projectId` is sent live in the POST body) — a cross-project data mixup in the UI — and every turn from that point is lost on reload because persistence is permanently skipped.
- **Fix sketch**: Either (a) document and enforce the contract by having ReportChat key itself internally (`<Inner key={bucket} …/>`), or (b) on bucket change, reload: `if (loadedBucket.current !== bucket) { loadedBucket.current = bucket; setMessages(loadStoredMessages(bucket)); }` in an effect before the persist effect.

## 4. ReportChat error messages are hardcoded Czech, bypassing the component's own i18n table
- **Severity**: Medium
- **Lens**: ui
- **Category**: i18n-gap
- **File**: src/components/dashboard/ReportChat.tsx:110,115
- **Scenario**: An English-locale user's chat POST fails (network drop, 500). Everything else on the surface is localized via `useT(T)`, but the error banner shows `"Nepodařilo se odeslat zprávu."` or the bare fallback `"Chyba"`.
- **Root cause**: `useReportChat` is a plain hook without access to the component's `T` table, so its two failure strings were inlined in Czech; the server's `data?.error` is also passed through verbatim with a Czech fallback.
- **Impact**: The one moment the user most needs clear guidance (failure + the Retry affordance next to it) breaks language consistency; for non-Czech users the message is unreadable. Also the only strings in the file exempt from the translation pattern — a trap for the next locale.
- **Fix sketch**: Add `errorSend`/`errorGeneric` keys to `T`, pass `t` (or the strings) into `useReportChat`, and use them as the fallbacks.

## 5. CSV export filenames hardcode the client brand "adamant" as a magic string
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-string-branding
- **File**: src/components/dashboard/vykon/ChannelsSection.tsx:105 (also vykon/TrendCard.tsx:117)
- **Scenario**: Any user on any surface — the public demo or the authed app on *their own* project (DashboardClient is explicitly "shared by the demo and the authed app", ReportChat tenancy-checks `projectId`) — clicks CSV. The file downloads as `adamant-kanaly-90d.csv` / `adamant-vyvoj-90d.csv`.
- **Root cause**: The original single-client demo name was baked into two independent template literals instead of a shared, project-aware filename helper; nothing documents that "adamant" is a legacy client label rather than a product term.
- **Impact**: Exports handed to other clients carry a different company's name — unprofessional at best, confusing/leaky at worst — and the duplication means a future rename will predictably fix one file and miss the other. The filename also omits the baseline (yoy vs previous) even though the exported comparison columns differ, so two exports of the "same" period can silently contain different comparisons.
- **Fix sketch**: One `exportFilename(kind, period, baseline, projectSlug?)` helper in `@/lib/export` used by both call sites; default the prefix to the product or the active project's slug, and fold the baseline key into the name (`vyvoj-90d-yoy.csv`).
