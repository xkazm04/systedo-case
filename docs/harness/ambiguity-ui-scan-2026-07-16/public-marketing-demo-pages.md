# Public marketing & demo pages — ambiguity+ui scan

> Total: 5 findings (0 critical / 1 high / 4 medium / 0 low)

## 1. Shared client report silently renders 0 for any KPI tile whose metric key drifts from the snapshot
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-fallback-on-client-facing-data
- **File**: src/app/report/[token]/page.tsx:271 (also 115–118, 272)
- **Scenario**: A shared report link carries a persisted `SharedMonthlyReport` payload created at share time. `MonthlyReportPrimary` renders each tile via `snap.current[spec.metric as ReportMetric] ?? 0` — a double leap of faith: the string is cast to `ReportMetric` unchecked, and any miss (renamed metric, a tile spec added after old links were created, a payload from a newer/older schema) coalesces to a hard `0`. Same pattern for deltas. Separately, `shared.period as CampaignPeriod` is validated with an inline magic membership object `period in { "7d": 1, "30d": 1, "90d": 1 }` duplicating the `CampaignPeriod` union by hand.
- **Root cause**: The persisted payload is treated as trusted and schema-stable, but it is written once and read forever (links can outlive schema changes — the file even documents "backward tolerance" for pre-feature links, yet the tile/metric contract itself has no tolerance path). The `?? 0` masks the mismatch instead of skipping the tile.
- **Impact**: A client (non-marketer, per the page's own comments) opens a read-only money report showing "Náklady 0 Kč" or "ROAS 0×" with full confidence styling — actively misleading data on the most trust-sensitive surface in the app, and nothing logs the drift.
- **Fix sketch**: Skip (don't zero) tiles whose `spec.metric` is not a key of `snap.current` (`if (!(spec.metric in snap.current)) return null;`), derive the period whitelist from the `CampaignPeriod` source (e.g. an exported `CAMPAIGN_PERIODS` array with `.includes`), and drop both `as` casts in favor of a narrowing guard.

## 2. /kvalita-modelu abandons the Container system for a bespoke `w-4/5` shell
- **Severity**: Medium
- **Lens**: ui
- **Category**: layout-token-violation
- **File**: src/app/kvalita-modelu/page.tsx:40
- **Scenario**: Every other public page wraps content in `<Container>` (max-width + fixed horizontal padding). This page uses `mx-auto w-4/5`: on a 360 px phone the content column is 288 px with no padding floor (cramped vs the consistent gutters everywhere else); on a 2560 px+ monitor there is no max-width, so the intro paragraph (`text-lg`, no `max-w-*`) runs ~2000 px lines — far past readable measure — and the page edge aligns with nothing else on the site (header/footer use Container).
- **Root cause**: The comment says the 80% width was chosen so intro/scorecard/matrix "share one edge", solving an internal alignment problem by stepping outside the design system instead of using a wider Container variant.
- **Impact**: Visually inconsistent page edges against the sitewide chrome, unreadable line lengths on large screens, tighter-than-standard mobile margins — on the page whose whole job is signaling craft/quality.
- **Fix sketch**: Use `<Container className="max-w-5xl">` (or add a `wide` Container size token) so all three sections still share one edge but inherit the site's padding floor and max-width; give the intro `max-w-3xl`.

## 3. /cena ships English metadata (and Czech-only mailto subjects) on a locale-aware page
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: i18n-boundary-inconsistency
- **File**: src/app/cena/page.tsx:10-14 (also 190-191)
- **Scenario**: The page body is fully localized via `getT`/`getServerLocale`, but `metadata` is a static export hardcoded in English ("Pricing — Adamant", English description). A Czech user sharing the pricing link gets an English social/search snippet; sibling pages (kampane, knihovna, socialni) hardcode Czech metadata instead — three different conventions across one route group with no comment explaining which is intended. Meanwhile both paid-tier CTAs open mailto links whose subjects are hardcoded Czech ("Zájem o Adamant Pro") even for `en` visitors.
- **Root cause**: Next metadata is static here while the body went dynamic during i18n work; the metadata layer was never migrated (or the "en metadata is deliberate" decision was never written down), and the mailto subjects sit outside the `T` table.
- **Impact**: Locale-inconsistent SERP/share cards for the page most likely to be shared (pricing), English-speaking leads sending Czech-subject emails, and future developers unable to tell which metadata language convention to copy.
- **Fix sketch**: Convert to `generateMetadata()` reading `getServerLocale()` and reuse the `T` table for title/description; move the two mailto subjects into `T` and `encodeURIComponent` them per locale. Document the site-wide rule (or apply it) on the Czech-hardcoded siblings.

## 4. JSON-LD `</script>`-escape hardening applied on one page but not its three siblings
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: inconsistent-security-pattern
- **File**: src/app/clanek/page.tsx:165-167 (also src/app/mapa/page.tsx:94-97, src/app/clanek/vykon/page.tsx:96-99; contrast src/app/m/[slug]/page.tsx:108-113)
- **Scenario**: /m/[slug] carefully escapes `<` in its JSON-LD (`JSON.stringify(jsonLd).replace(/</g, "\\u003c")`) with a comment explaining tenant-controlled fields could inject `</script>`. The three other pages injecting JSON-LD via `dangerouslySetInnerHTML` (/clanek, /mapa, /clanek/vykon) stringify raw. They are safe today only because their inputs are static/validated singletons — but nothing marks that boundary, and /clanek/vykon's article is *generated* from a data pipeline (`snapshotToArticle(performance…)`), the exact shape that later grows a dynamic source.
- **Root cause**: The escaping was added point-fix at the one page where the risk was noticed, instead of centralizing the JSON-LD `<script>` emission; the safety precondition ("inputs must be static") on the other pages is undocumented.
- **Impact**: The first developer who feeds user/tenant/CMS data into any of the three unescaped pages (most plausibly the report-article pipeline) introduces stored XSS on a public page, with an in-repo example suggesting raw `JSON.stringify` is fine.
- **Fix sketch**: Extract a tiny `<JsonLd data={…} />` component that always applies the `<` escape (it is loss-free for static data) and use it on all four pages; delete the per-page inline scripts.

## 5. FAQ accordion duplicated in /clanek/vykon with silently degraded behavior
- **Severity**: Medium
- **Lens**: ui
- **Category**: repeated-pattern-should-be-component
- **File**: src/app/clanek/vykon/page.tsx:156-179 (source pattern: src/app/clanek/page.tsx:246-288)
- **Scenario**: /clanek's FAQ section is a hand-rolled `<details>` accordion with deep-link `id`s (`faqItemId`), `FaqPermalink`, `FaqHashOpen` (hash auto-open + scroll), `scroll-mt-24`, `print:break-inside-avoid`, `PrintExpand` (open all disclosures while printing), and rich inline rendering (bold/links). /clanek/vykon copy-pastes the accordion markup but drops every one of those: `key={i}`, no ids/permalinks, no hash handling, no print handling, answers flattened to plain text via `inlineToText` — even though its JSON-LD FAQPage is emitted the same way (minus the per-question `url` the sibling adds).
- **Root cause**: The accordion was cloned before the sibling accrued its accessibility/deep-link/print upgrades; with no shared `<FaqSection>` component, the two copies diverge invisibly on every improvement.
- **Impact**: On the report page, printing/PDF loses all collapsed FAQ answers, FAQ rich-result deep links can't land on a question, and links inside answers are stripped to bare text — an inconsistent, quietly worse experience for what looks like the identical UI.
- **Fix sketch**: Extract the /clanek FAQ block into a shared `FaqSection` component (props: `faq`, optional `withPermalinks`) that always includes ids, `FaqHashOpen`, `scroll-mt`, print handling, and inline-node rendering; both pages consume it.
