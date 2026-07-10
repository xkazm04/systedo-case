# Public marketing & demo pages

> Total: 5
> Critical: 0 · High: 1 · Medium: 2 · Low: 2
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Tenant microsites index fabricated KPIs as a real client's "proof"

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/app/m/[slug]/page.tsx:60`
- **Scenario**: `/m/[slug]` decides indexing purely on `config.illustrative`: `robots: config.illustrative ? { index: false } : { index: true, follow: true }` (page.tsx:60), and shows the "Ilustrativní ukázková data" disclaimer only when `config.illustrative` is truthy (page.tsx:133). But the **only** way a real agency creates a microsite is `POST /api/microsite` → `enableMicrosite()` (`src/lib/microsite.ts:109-127`), which builds the config **without ever setting `illustrative`** — so it is `undefined` (falsy). Meanwhile `buildMicrositeView()` (`microsite.ts:137-157`) **always** renders `scaledDataset(seedScale(config.slug))` — synthetic case-study numbers scaled by a hash of the slug — because the promised "tenant with a connected Ads source can replace the scaled base" path (microsite.ts:9-12) does not exist in code. Net result: every tenant-published microsite is `index:true`, carries **no** illustrative disclaimer, and publishes invented revenue/cost/conversion figures attributed by name to a real client (`clientName`/`brandName`) as continuously-fresh, search-findable "results."
- **Root cause**: The guard that was meant to stop demo numbers from being indexed keys off a single `illustrative` flag that only the built-in `DEMO_MICROSITE` ever sets (verified: no other assignment of `illustrative` exists in `src/`), while the data layer was never actually wired to real synced series — so "real tenant" and "synthetic data" are not mutually exclusive as the flag assumes.
- **Impact**: Fabricated marketing performance numbers get indexed by Google under a real client's brand — a reputational/trust and arguably legal exposure (false advertising of results), and the exact failure the `illustrative`→noindex design exists to prevent.
- **Fix sketch**: In `enableMicrosite()` set `illustrative: true` for any config whose data still comes from `scaledDataset` (i.e. until a real-data source is wired), so tenant microsites default to `noindex` + disclaimer; flip it to `false` only on the code path that actually substitutes synced series. Alternatively gate `index:true` on `config.illustrative === false && hasRealData(config)` at page.tsx:60 rather than treating "not explicitly illustrative" as "real."

## 2. White-label shared report leaks the vendor name "Adamant" in the page title

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/report/[token]/page.tsx:56`
- **Scenario**: The shared client report goes to great lengths to stay white-label: `brand = shared.brandName || shared.accountName || "Report"` with the explicit comment "Never fall back to the vendor name on a client-facing report" (page.tsx:78-80), the logo/accent are tenant-captured, and `ReportView … clientSafe` is used. But the page exports a **static** `export const metadata: Metadata = { robots: … }` (page.tsx:56-57) that sets **only** robots — no `title`. Next.js therefore falls back to the root layout's `title.default = "Adamant — AI ad intelligence"` (`src/app/layout.tsx:21-24`). So the browser tab, the bookmark label, and any Slack/Teams/link-unfurl title of a link handed to a client read "Adamant — AI ad intelligence" — the vendor product name the rest of the page deliberately hides.
- **Root cause**: Author assumed a static metadata object with just `robots` is inert for the title, not realizing the layout's `title.default` template fills the gap; the per-report brand (only known after `getSharedReport(token)`) was never plumbed into metadata.
- **Impact**: Defeats the white-label promise at the most visible surface (tab + share unfurl); a client learns the agency's tooling vendor, contradicting the file's own stated rule.
- **Fix sketch**: Replace the static export with `export async function generateMetadata({ params })` that fetches the shared report and returns `{ title: shared.accountName /* or brandName */, robots: { index:false, follow:false } }`. (`getSharedReport` is called again in the body, so wrap it in React `cache()` to avoid a second Firestore read.)

## 3. Shared-report view counter is a Firestore write performed during render, inflated by every bot/prefetch

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/report/[token]/page.tsx:65`
- **Scenario**: Rendering the page calls `getSharedReport(token)` (page.tsx:65), which performs a mutating `ref.update({ views: FieldValue.increment(1) })` inside the fetch (`src/lib/campaigns/shared-report.ts:113-118`). Because this side-effect rides the render path of a GET route, `views` is incremented for **every** HTTP GET — Next.js `<Link>` prefetches, Slack/Teams/iMessage link-unfurl bots, uptime pingers, and any re-invocation of the server component — not just genuine client opens. The tenant's management list surfaces this exact number ("how many times the public page has been opened," shared-report.ts:31; rendered by `SharedReportsList`), so the count they read is systematically inflated.
- **Root cause**: Treating a page render as the place to record an analytics event assumes one render == one human view; server renders are neither one-per-human nor side-effect-safe.
- **Impact**: "Views" is a lie — a report shared into a chat app shows 1+ views before the client ever clicks; the metric the tenant relies on to know if a client engaged is untrustworthy.
- **Fix sketch**: Move the increment out of the render path — e.g. a tiny client `useEffect` beacon to `POST /api/report/[token]/view`, or wrap it in `after()` and filter obvious bots via user-agent — so only real, in-browser opens count. At minimum, dedupe prefetch (`purpose: prefetch` header) and known crawler UAs.

## 4. Microsite Dataset JSON-LD publishes money and ratios with no units

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/m/[slug]/page.tsx:95`
- **Scenario**: The indexed `/m/[slug]` page emits a schema.org `Dataset` whose `variableMeasured` PropertyValues carry bare numbers: `revenue`/`cost` as `Math.round(...)` CZK integers and `pno` as `Number(snapshot.current.pno.toFixed(4))` — a ratio like `0.2500` (page.tsx:95-100). None declare a unit: the currency values have no `unitCode` / currency indication and the ratio has no `unitText: "%"` or `×100`. A machine consumer or rich-result parser reading this structured data cannot tell 250000 is CZK (vs USD/EUR) or that 0.25 means 25%.
- **Root cause**: The values were lifted straight from the snapshot into JSON-LD without the currency/percent context that the human-facing formatters (`fmtCZK`/`fmtPct`) normally add.
- **Impact**: Published structured data is ambiguous/misleading to the very answer-engines the microsite is built to court — cost figures read as unit-less and the "cost ratio" reads as 0.25 rather than 25%.
- **Fix sketch**: Add `unitCode: "CZK"` (currency) to the revenue/cost PropertyValues and either publish `pno` as a percent with `unitText: "%"` (value `snapshot.current.pno * 100`) or rename it to make the ratio semantics explicit.

## 5. `/m/[slug]` fetches the config and rebuilds the whole article twice per request

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: structure
- **File**: `src/app/m/[slug]/page.tsx:47`
- **Scenario**: Both `generateMetadata` (page.tsx:47-51) and the page component (page.tsx:66-73) independently call `await getMicrosite(slug)` (a Firestore read) **and** `buildMicrositeView(config)` (which runs `scaledDataset` + `buildMetricsSnapshot` + `snapshotToArticle` — the full deterministic article build). So every request does two Firestore lookups and builds the article twice. Unlike `/clanek`, which builds its article once at module scope (`src/app/clanek/page.tsx:59`), the microsite recomputes per call site. (This is not in the 2026-07-09 report, which covered the JSON-LD escape on this file but not the double-fetch.)
- **Root cause**: Next.js invokes `generateMetadata` and the default export as separate functions; the shared prep wasn't memoized, so each re-derives it from scratch.
- **Impact**: Doubled Firestore reads and article-build CPU on a page designed to render on every request (and revalidated daily by cron); also a latent consistency seam if the two builds ever stop being deterministic.
- **Fix sketch**: Wrap `getMicrosite` (and ideally `buildMicrositeView`) in React `cache()`, or hoist a single `const view = cache(async (slug) => { const config = await getMicrosite(slug); return config && { config, ...buildMicrositeView(config) }; })` used by both functions — request-deduped, one read + one build per request.
