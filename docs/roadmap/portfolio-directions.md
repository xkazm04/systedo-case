# Portfolio directions — per-type killer modules

Goal: differentiate the service portfolio so each **project type** (e-shop / app / lead-gen /
content) ships a distinct, high-value set of modules. Each direction below becomes a **module**
in the app shell (an entry in `src/lib/projects/modules.ts`, available only for its type), built
in the house pattern: a framework-free **lib** (`types` + deterministic **sample** provider + pure
**compute**), an optional **API route**, a **client module** component, and a **route page** under
`src/app/app/[projectId]/<key>`. Everything works in demo mode on seeded/illustrative data with a
clearly-marked **real-integration seam** (mirroring how campaigns use `sampleProvider` +
`googleAdsProvider`).

Status legend: ☐ planned · ◐ in progress · ☑ shipped

---

## 🛍️ E-shop (Phase 1)

| Module | key | section | gist |
|---|---|---|---|
| **Zisk (POAS)** ☑ | `zisk` | insights | Margin/COGS-aware: optimize **profit on ad spend**, not ROAS. |
| **Produktová kreativa** ☑ | `produktova-kreativa` | studio | Catalog → AI creative + RSAs → PMax asset groups. |
| **Sklad & sezónnost** ☑ | `sklad-sezonnost` | growth | Seasonality + stock-aware budget pacing & low-stock pauses. |

- **Zisk / POAS** — per-channel & per-category **margin model** (sample, editable live). Computes
  gross profit = revenue·margin, **net profit** = grossProfit − adSpend, **POAS** = grossProfit/cost,
  **break-even ROAS** = 1/margin; flags channels profitable on ROAS but **losing money after margin**.
  Seam: pull COGS/margin from Merchant Center / ERP. Builds on `metrics/channels`.
- **Produktová kreativa** — sample product **feed** (SKU, title, price, image, category). Pick a
  product → generate RSA copy (existing `/api/ai` ads mode, product-grounded) + creative brief, group
  into a PMax **asset group**. Seam: Merchant Center feed + Creative Studio image gen.
- **Sklad & sezónnost** — `weekdayWeights`/seasonality + sample **stock** levels → pacing
  recommendations (lean into forecast peaks), **pause low-stock SKUs**, promo-calendar pre-load. Seam:
  inventory feed + Ads budget mutations (existing control-plane).

## 📱 App / SaaS (Phase 2)

| Module | key | section | gist |
|---|---|---|---|
| **CAC → LTV** ☐ | `ltv` | insights | Cohort activation/retention; optimize payback, not signups. |
| **LP experimenty** ☐ | `experimenty-lp` | studio | Auto-generate + A/B test landing pages/microsites per keyword cluster. |
| **Srovnání & SEO** ☐ | `srovnani-seo` | growth | Programmatic "alternative / vs / pricing" high-intent content. |

- **CAC→LTV** — sample acquisition **cohorts** (signups → activated → retained → revenue); compute
  **CAC, payback period, LTV:CAC, blended vs paid**. Seam: product-analytics events (Segment/PostHog).
- **LP experimenty** — generate landing variants (reuse content/microsite) per keyword cluster, run
  A/B (existing experiments engine), rank by signup CVR. Seam: real traffic split + analytics.
- **Srovnání & SEO** — keyword intent → programmatic comparison/alternative pages (keywords + brief +
  article + patterns). Seam: publish to CMS / microsites.

## 📨 Lead-gen / Services (Phase 3)

| Module | key | section | gist |
|---|---|---|---|
| **Kvalita leadů** ☐ | `kvalita-leadu` | insights | CRM outcome feedback → optimize for *qualified* leads. |
| **Rychlá reakce** ☐ | `rychla-reakce` | studio | Instant AI-drafted reply + qualification + routing. |
| **Lokální dominance** ☐ | `lokalni` | growth | Service×area landing pages + local SEO + reviews + call tracking. |

- **Kvalita leadů** — sample **leads** with CRM outcomes (new → qualified → won, value); score lead
  quality, surface **cost-per-qualified-lead** by source, feed back to bidding. Seam: CRM webhook.
- **Rychlá reakce** — inbound lead inbox (reuse social-inbox pattern) with AI-drafted replies +
  qualification questions + routing/SLA timer. Seam: form/call/email intake + send.
- **Lokální dominance** — per service×area **microsites** + local keyword coverage + sample
  reviews/reputation + call-tracking numbers. Seam: GBP + call-tracking provider.

## 📰 Content / Media (Phase 4)

| Module | key | section | gist |
|---|---|---|---|
| **Obsahový engine** ☐ | `obsahovy-engine` | growth | Topic-cluster planning + content-decay refresh. |
| **Distribuce** ☐ | `distribuce` | studio | One article → social/short-form/microsite, scheduled, attributed. |
| **Publikum & výnos** ☐ | `publikum` | insights | Traffic → subscribers → segments → RPM/sponsorship revenue. |

- **Obsahový engine** — keyword → **topic clusters** (pillar + supporting) with internal-link map;
  detect **decaying** posts and queue refreshes (keywords + brief + article + patterns). Seam: CMS +
  Search Console.
- **Distribuce** — take one article → AI-repurpose into social variants (existing social) + short-form
  + microsite; schedule + **per-channel attribution**. Seam: social/scheduler APIs.
- **Publikum & výnos** — sample **subscriber** funnel + segments + **RPM/sponsorship** dashboard. Seam:
  ESP (newsletter) + ad/sponsorship data.

---

## Phase plan

- **Phase 1 — E-shop trio** (`zisk`, `produktova-kreativa`, `sklad-sezonnost`) ☑ shipped
- **Phase 2 — App/SaaS trio** (`ltv`, `experimenty-lp`, `srovnani-seo`)
- **Phase 3 — Lead-gen trio** (`kvalita-leadu`, `rychla-reakce`, `lokalni`)
- **Phase 4 — Content trio** (`obsahovy-engine`, `distribuce`, `publikum`)

Each phase: add icons + registry entries, build the three modules (lib + sample + compute + client +
page), wire into the type's sidebar, then typecheck/lint and commit. Modules degrade to demo data and
document their live-integration seam, consistent with the rest of the app.
