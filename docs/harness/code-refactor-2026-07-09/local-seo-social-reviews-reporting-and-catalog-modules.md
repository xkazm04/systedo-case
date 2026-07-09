# Local SEO, social, reviews, reporting & catalog modules

> Context #34 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 1, Medium: 3, Low: 1)
> Files read: 27

## 1. Three (really four) hand-copied re-implementations of "reference now"

- **Severity**: High
- **Category**: duplication
- **File**: `src/app/app/[projectId]/katalog/page.tsx:17-18`
- **Scenario**: The exact two lines `const lastDate = data.daily.at(-1)?.date; const now = lastDate ? new Date(\`${lastDate}T00:00:00Z\`) : new Date();` are retyped verbatim in `src/app/app/[projectId]/mesicni-report/page.tsx:38-39` and `src/app/app/[projectId]/sklad-sezonnost/page.tsx:21-24`, plus a fourth copy outside this context in `src/lib/insights/aggregate.ts:66-67`. katalog's own comment says this exists so restock ETAs are deterministic "(matches the Sklad module)" — the two are meant to stay in lockstep, but nothing enforces it beyond eyeballing.
- **Root cause**: Each server page independently re-derives a deterministic "now" from the dataset's last day (so server-rendered stockout/budget/report projections don't depend on `Date.now()`), instead of calling one shared helper.
- **Impact**: A future change to the anchor rule (timezone fix, switching the anchor point, DST handling) must be applied by hand in 3-4 places. Miss one and katalog's product ETAs, sklad-sezonnost's stockout dates, and mesicni-report's projections silently disagree — exactly the "matches the Sklad module" invariant the code comments call out as important.
- **Fix sketch**: Add `export function datasetNow(data: PerformanceData): Date { const lastDate = data.daily.at(-1)?.date; return lastDate ? new Date(\`${lastDate}T00:00:00Z\`) : new Date(); }` to `src/lib/project-data/dataset.ts` (already the shared home of `getProjectDataset`), and replace the inline duplicate in the three owned pages (and optionally `lib/insights/aggregate.ts`) with a call to it.

## 2. sklad-sezonnost's whole computation pipeline is re-implemented in DemoModule

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/sklad-sezonnost/page.tsx:20-42`
- **Scenario**: The season → now → products → stock → aggregate-days-of-cover → budgetPlan → changeSet pipeline is reproduced near-verbatim in `src/components/demo/DemoModule.tsx`'s `"sklad-sezonnost"` case (lines 211-249), down to the identical median-days-of-cover one-liner `covers.length > 0 ? covers[Math.floor(covers.length / 2)]! : Infinity`.
- **Root cause**: The public demo walkthrough (`DemoModule.tsx`) re-derives each module's server logic inline rather than sharing the pure parts with the authed page — the two implementations agree today only because someone kept them in sync by hand.
- **Impact**: If the days-of-cover capping rule or budget-plan wiring changes (e.g. switching the aggregate stat, or changing how `RESTOCK_HORIZON_DAYS` factors in), the fix has to be hand-copied into `DemoModule.tsx` or the public demo silently shows seasonal-budget behavior that no longer matches the real module — a credibility risk since the demo is the sales-facing surface.
- **Fix sketch**: Extract the pure part — `aggregateDaysOfCover(stock: StockRow[]): number` — into `src/lib/inventory/compute.ts`, right next to `stockRows`/`seasonalBudgetPlan` which it already composes with, and call it from both `sklad-sezonnost/page.tsx` and `DemoModule.tsx`. Leave the differing data-fetching (`loadProductsFor` vs. the sample `productsFor`) untouched — only the pure median/aggregation math moves.

## 3. report/page.tsx's chat wiring is copy-pasted into the demo report page

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/app/app/[projectId]/report/page.tsx:15-27`
- **Scenario**: The `period`/`data`/`report`/`chips`/`subtitle` wiring — `const period = "90d" as const; const data = getProjectDataset(project); <ReportChat report={reportFor(period, data)} period={period} chips={reportChips(period, locale, data)} ... subtitle={analysisPeriodLabel(period, locale)} .../>` — is duplicated token-for-token in `src/app/dashboard/report/page.tsx:19-33`, differing only in how `project` is resolved and in `backHref`/the outer shell.
- **Root cause**: Same demo/authed split as finding 2 — the public demo report page reconstructs the authed page's props instead of sharing them.
- **Impact**: Lower bug cost than finding 2 (both call the same pure `reportFor`/`reportChips`), but the hardcoded `period = "90d"` and the full prop list have to be kept in sync by hand across two files whenever the report surface changes (new chip, period selector, etc.).
- **Fix sketch**: Factor the shared props/JSX into a small helper, e.g. `buildReportChatProps(project, locale)` in `src/lib/report-chat.ts` (which already owns `reportFor`/`reportChips`), or a `<ReportChatPanel project backHref>` wrapper next to `src/components/dashboard/ReportChat.tsx`; have both pages call it, passing only the `backHref`/shell that legitimately differs.

## 4. `reviewsForProject` means two different things depending which module you import

- **Severity**: Medium
- **Category**: structure
- **File**: `src/app/app/[projectId]/lokalni/page.tsx:6-10`
- **Scenario**: `lokalni/page.tsx` imports `reviewsForProject` from `@/lib/local/sample` (returns `ReviewProfile[]` — aggregate per-service star counts for the Local Dominance panel). The sibling page `src/app/app/[projectId]/recenze/page.tsx:9` imports a completely different function, also named `reviewsForProject`, from `@/lib/reviews/sample` (returns `ReviewItem[]` — individual dated reviews for the Review Inbox). Two unrelated functions share one name across two modules that get edited side-by-side.
- **Root cause**: `reviews/sample.ts`'s own header says it exists as "a fuller dataset than the Lokální module's four-review reputation panel" — it was added later, deliberately as a richer sibling of `local/sample.ts`'s helper, but was given the exact same export name instead of a distinguishing one.
- **Impact**: Editor auto-import and copy-paste between these two similar-sounding, adjacent pages routinely resolves to the wrong module. TypeScript does catch a straight swap (the return shapes differ, so the consuming component's props mismatch), but only after the dev writes the call and reads the type error — avoidable friction a distinct name would remove entirely.
- **Fix sketch**: Rename one export to state its shape, e.g. `reviewProfilesForProject` in `src/lib/local/sample.ts` (matches its `ReviewProfile[]` return), or `reviewInboxForProject` in `src/lib/reviews/sample.ts`; update the one call site in each of `lokalni/page.tsx` and `recenze/page.tsx` (and `src/components/demo/DemoModule.tsx`'s "recenze"/local cases, which import the same two functions).

## 5. Dead reassignment of `profitDelta` in the cost-model branch

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/app/app/[projectId]/mesicni-report/page.tsx:86-96`
- **Scenario**: `let profitDelta = s.delta.profit;` is set once, before the `if (costModel)` branch. Inside that branch (line 96), it is reassigned `profitDelta = s.delta.profit;` — the exact same value it already holds. The statement is a no-op in both branches of the `if`.
- **Root cause**: Reads like a placeholder from when the cost-model branch was expected to recompute a COGS-aware delta — the preceding comment ("Delta of net profit ≈ delta of gross contribution (fixed margin), a good proxy") explains why it was *decided* not to, but the pointless reassignment was left behind as if something still happened there.
- **Impact**: Harmless today (both branches produce the same `profitDelta`), but it misleads a reader into thinking the `costModel` branch does something special with the delta, obscuring that there is no COGS-aware delta calculation at all — the next person implementing one may wrongly assume this line already does it.
- **Fix sketch**: Delete the redundant `profitDelta = s.delta.profit;` on line 96. Optionally go further and drop the mutable `profitDelta` variable entirely, inlining `s.delta.profit` directly where `snaps[p]` is built (line ~125), since it never varies by branch.
