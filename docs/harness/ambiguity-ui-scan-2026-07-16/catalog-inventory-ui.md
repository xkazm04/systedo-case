# Catalog, Inventory, Audience & Distribution — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Revenue goal ETA is computed and labeled with the SUBSCRIBER growth rate
- **Severity**: High
- **Lens**: ambiguity
- **Category**: misleading-metric
- **File**: src/components/app/modules/AudienceModule.tsx:243-244, 567
- **Scenario**: A user sets both a subscriber goal and a monthly-revenue goal. The goals card shows "est. N mo. at +X% growth" under BOTH goals, but `goalProgress(funnel, s, goals, subGrowth)` is fed only the subscriber MoM growth (`subTrend?.momGrowth ?? 0`), and line 567 interpolates the same `subGrowth` into the `goalEta` string for the revenue row too.
- **Root cause**: One growth rate is threaded through for two different series; RPM/revenue trend data (`rpmTrend`) is computed a few lines above but never used for the revenue goal's ETA or label. The `?? 0` fallback is also silently load-bearing ("falls back to 0" only in a comment).
- **Impact**: The revenue ETA is wrong whenever revenue and subscriber growth diverge (the normal case — RPM changes independently), and the displayed "at +X%" actively misattributes which growth the estimate assumes. Users may plan sponsorship pricing/budget on a fabricated timeline.
- **Fix sketch**: Compute a revenue growth rate (from `rpmTrend`/revenue history or `s.monthlyRevenue` series) and pass a per-goal growth into `goalProgress`; render each goal's own growth in `goalEta`. If revenue history is unavailable, show `goalNoEta` for the revenue row instead of borrowing subscriber growth.

## 2. DistributionModule crashes on an empty attribution array
- **Severity**: High
- **Lens**: ambiguity
- **Category**: empty-state-crash
- **File**: src/components/app/modules/DistributionModule.tsx:165, 209
- **Scenario**: `attribution: ChannelPerf[]` arrives empty (a project with no channel data yet — the type permits it, and this module is positioned to move off sample data). `attribution.reduce((a, b) => ..., attribution[0]!)` returns `undefined` for `[]`, then `best.channel` at line 209 throws and the whole module unmounts with a client error.
- **Root cause**: Non-null assertion (`attribution[0]!`) papers over the empty case; there is no empty state for the attribution table or the LearningsPanel header pill. Same pattern exists in InventorySeasonModule.tsx:160 (`season[0]!`, `season[nextIndex]!`), currently saved only by the seasonality array always having 12 entries.
- **Impact**: Blank/broken page for the first real (non-sample) project instead of a graceful "no data yet" — the exact moment the "Seam: connect analytics" promise is redeemed.
- **Fix sketch**: Guard `attribution.length === 0` with a dashed-border empty card (the codebase already has this pattern in CatalogManagerModule) and drop the `!` assertions; render the variants section regardless.

## 3. "Export all (N)" count does not match what the export contains
- **Severity**: Medium
- **Lens**: ui
- **Category**: mislabeled-action
- **File**: src/components/app/modules/CatalogModule.tsx:389-393, 405-411
- **Scenario**: The feed header button reads "Exportovat vše (3)" where 3 = `persisted?.items.length` (SKUs with saved AI copy), but `exportAll()` calls `composeCatalogAdCopy(products, ...)` — the CSV contains EVERY product (AI copy where saved, deterministic feed copy otherwise). A user with 40 products and 3 AI generations reads the button as "export 3" and gets 40 rows, or worse, thinks 37 products aren't covered and batch-generates unnecessarily (burning daily quota the UI itself warns about).
- **Root cause**: The count chosen for the label is the AI-copy count, not the export row count. Tellingly, a translation key that explains the split — `exportAllHint: "{ai} with AI copy, {floor} from feed"` (lines 92/142) — exists in both locales but is never rendered; the clarifying UI was designed and then dropped.
- **Impact**: The action's scope is misrepresented at the exact point of a quota-relevant decision; dead i18n keys also mislead future developers about what the UI shows.
- **Fix sketch**: Label the button with `products.length` and render the existing `exportAllHint` (`{ai}` = aiCount, `{floor}` = products.length − aiCount) as the subtitle/tooltip — the strings are already translated.

## 4. Kind filter can silently stay active after its button disappears
- **Severity**: Medium
- **Lens**: ui
- **Category**: orphaned-filter-state
- **File**: src/components/app/modules/CatalogManagerModule.tsx:506-508, 568-581, 585-589
- **Scenario**: User filters to "Produkty", then removes the last product (or a Replace import swaps the catalog to plans-only). `filterKinds` is derived from current `items`, so the "Produkty" filter button vanishes — but `kindFilter` still holds `"product"`. The list shows "Žádné položky neodpovídají hledání." with no visible active filter and no way to see why, since the segmented control now only renders "Vše" + surviving kinds (none pressed).
- **Root cause**: Filter state is not reconciled when the option set it references disappears; the reset-on-change trick used for pagination (`filterKey`/`lastFilterKey`) covers query/filter changes but not item-set changes.
- **Impact**: A confusing dead-end — the user sees an empty catalog they know has items, and the escape hatch (the "Vše" button) doesn't look related to the problem. Import-Replace makes this reachable in one click.
- **Fix sketch**: During render, if `kindFilter !== "all" && !filterKinds.includes(kindFilter)` reset it to `"all"` (same render-time-adjustment pattern already used for `visibleCount`); optionally extend the `noMatches` message with a "clear filter" action.

## 5. Concurrent accept/dismiss saves can silently revert an earlier decision
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: optimistic-update-race
- **File**: src/components/app/modules/InventoryBudgetActions.tsx:137-166
- **Scenario**: The plan lists several moves; buttons are disabled only for the row being saved (`busyKey === k`), so the user can Accept move A and immediately Dismiss move B. Each `setMove` snapshots `const prev = states` at call time and POSTs ALL moves. If B's request fails (or resolves after A's but was built from a pre-A snapshot in a fast double-click), `setStates(prev)` rolls the UI back to a state that discards A's already-persisted acceptance — UI and server now disagree, with only a generic "Uložení se nezdařilo."
- **Root cause**: Per-row busy tracking with whole-plan optimistic snapshots: the rollback target and the POST payload are both captured from a moment that other in-flight rows have since changed.
- **Impact**: A persisted decision appears to un-happen (or the reverse: the UI shows "proposed" while the server holds "accepted"), on the feature whose whole pitch is honest, durable decision tracking; the digest-guarded reload then resurfaces the server's version, confusing the team.
- **Fix sketch**: Serialize saves (a single `busy` flag disabling all decision buttons, or a queue), roll back only the affected key (`setStates(s => ({ ...s, [key]: prevValueOfKey }))`), and build the POST payload from the functional-updater's current state rather than a closure snapshot.
