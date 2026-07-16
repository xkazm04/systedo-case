# Campaign performance & ads operations modules — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 3 medium / 1 low)

## 1. /vykon is hard-pinned to the sample dataset while /zisk and the report resolve live-over-sample — a live-synced tenant reads contradictory KPIs across surfaces
- **Severity**: High
- **Lens**: ambiguity
- **Category**: live-sample-split-brain
- **File**: src/app/app/[projectId]/vykon/page.tsx:12-17
- **Scenario**: A tenant with a live Ads sync opens Výkon (the flagship "performance dashboard") and sees seeded numbers (`getProjectDataset`, `sample` hardcoded `true`), then opens Zisk or the monthly report — both of which now go through `resolveReportDataset` (zisk/page.tsx:33, "one profit truth") — and sees their real channel mix. Spend/revenue on the two pages disagree.
- **Root cause**: The "Direction 2 — one profit truth" unification (resolveReportDataset) was applied to /zisk and the report but never to /vykon, which still reads the raw sample spine. The comment even acknowledges vykon "never [renders] live Ads data" without stating why the shared resolver wasn't used.
- **Impact**: The most-visited numeric surface contradicts its sibling modules for exactly the customers who paid for a live connection; the sample banner explains the numbers are illustrative but not why the profit page next door shows different, real ones. Erodes trust in every number in the app.
- **Fix sketch**: Route /vykon through the same `resolveReportDataset(project)` seam, pass `sample={!resolved.live}`, and let DashboardClient receive `resolved.data` — identical to the zisk pattern. If live shape is intentionally unsupported by DashboardClient yet, say so in the comment and add a visible "live data available on Zisk/Report" pointer instead of a bare sample banner.

## 2. Silent sample fallback conflates "no data yet" with "backend read failed" on Aktivita and Spotřeba
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: error-fallback-conflation
- **File**: src/app/app/[projectId]/aktivita/page.tsx:19 (also spotreba/page.tsx:16)
- **Scenario**: A tenant with months of real activity hits the page during a Firestore hiccup. `listActivity` (src/lib/campaigns/activity.ts:58-65) swallows the error and returns `[]`, so `isLive = live.length > 0` flips to false and the page renders **fabricated seeded events** about modules the tenant may never have touched, labeled only with the generic "illustrative sample" note.
- **Root cause**: The empty-array return is used both as the legitimate "fresh project" signal and as the error path; the page has no way to tell them apart, and the fallback intent ("local/dev, or a fresh project" per the file header) doesn't cover outages.
- **Impact**: During any backend degradation, live tenants see invented AI/module actions presented as their project's timeline (and invented LLM spend on Spotřeba). A user auditing "what did the AI do / spend" gets fiction at exactly the moment the system is unhealthy.
- **Fix sketch**: Make `listActivity`/`liveSpendForProject` distinguish failure (throw, or return `{ records, ok }`); on failure render an "activity temporarily unavailable" empty state instead of the sample, keeping the sample fallback only for genuinely-empty fresh projects.

## 3. Kampaně header interpolates the Czech-only `channelFocus` into the English description, bypassing the existing locale accessor
- **Severity**: Medium
- **Lens**: ui
- **Category**: i18n-mixed-language
- **File**: src/app/app/[projectId]/kampane/page.tsx:28
- **Scenario**: An `en`-locale user with a leadgen project opens Kampaně and reads: "Google Ads campaigns, triage, AI evaluation and budget shifts. Focus for this project type: **Search a kampaně pro generování poptávek**."
- **Root cause**: The page reads the raw `PROJECT_TYPE_META[project.type].channelFocus` (documented as "(cs)" in src/lib/projects/types.ts:53-55) even though a locale-aware accessor `projectTypeMeta(type, locale)` (types.ts:152) exists precisely to select `channelFocusEn`. The `T` map is bilingual, so the sentence around the placeholder is translated but the value is not.
- **Impact**: Visible mixed-language copy in the module header for every non-eshop project type on the English locale; undermines the otherwise careful cs/en parity of the `T`-map pattern.
- **Fix sketch**: `const { channelFocus } = projectTypeMeta(project.type, await getLocale())` (or have `getT` expose the locale) and interpolate that; delete the direct `PROJECT_TYPE_META` read.

## 4. The cost model is "an e-shop concept" on Kampaně but consumed unconditionally on Zisk — divergent undocumented assumption
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: undocumented-domain-assumption
- **File**: src/app/app/[projectId]/kampane/page.tsx:34 (vs zisk/page.tsx:46)
- **Scenario**: A leadgen/app tenant enters a cost model (margin, overhead) via the Zisk overhead panel ("apply to report", zisk/page.tsx:46 fetches `getCostModel` for every project type). They then open Kampaně expecting triage to judge campaigns against their margin-based break-even — but kampane gates the fetch to `project.type === "eshop"`, so `breakEven`/`marginPct` stay null and triage silently falls back to the blind portfolio target.
- **Root cause**: Two pages encode opposite answers to "which project types have a cost model": kampane's comment asserts "the model is an e-shop concept" while zisk persists and consumes one for all types. Neither cites the other; the tenant-facing contract is undefined.
- **Impact**: Margin-aware triage — the headline of Direction 1/2 in this very file — never activates for non-eshop tenants who provided the exact data it needs, with no signal that their input was ignored. Future developers can't tell which page is wrong.
- **Fix sketch**: Decide the contract once (e.g. in cost-model/store.ts's doc header). If the model is genuinely valid for any revenue-bearing type, drop the `eshop` gate in kampane; if it is e-shop-only, stop persisting/consuming it for other types on zisk and hide the entry panel there.

## 5. Two competing "this data is illustrative" labeling systems — and Správa kanálů has neither
- **Severity**: Low
- **Lens**: ui
- **Category**: provenance-labeling-inconsistency
- **File**: src/app/app/[projectId]/sprava-kanalu/page.tsx:20 (contrast kanaly/page.tsx:48, vykon/page.tsx:12)
- **Scenario**: A user hops between modules: numeric pages show the shared ModulePage gutter banner (`sample` prop → `SampleDataNote`); Kanály skips the gutter and instead renders its own source pill inside OrganicChannels (OrganicChannels.tsx:250-252, "sample"/"ai"); Správa kanálů receives `resolved.source` but TwinChannelsModule renders no provenance indicator at all, so seeded default channel/autonomy settings look like the tenant's own saved configuration.
- **Root cause**: The honesty-banner convention (ModulePage.tsx:24-28: "the banner every seeded-data module carries") was retrofitted per-module; the twin-flavored pages either invented a local pill or dropped labeling when threading `source` through.
- **Impact**: The same semantic (seeded vs user/AI data) has three presentations — banner, pill, nothing — so users can't build a reliable mental model of what is real; on Správa kanálů they may believe autonomy levels were already configured.
- **Fix sketch**: Pass `sample={resolved.source === "sample"}` (or the module-appropriate equivalent) to ModulePage on sprava-kanalu and kanaly so the shared gutter is the one system; keep the Kanály pill only as the sample→AI upgrade affordance, not as the sole provenance signal.
