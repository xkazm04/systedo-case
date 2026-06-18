# Feature Scout — Produktová kreativa (`/app/[projectId]/produktova-kreativa`)

> Module: src/components/app/modules/CatalogModule.tsx
> Project type: eshop
> Total: 5 ideas

## 1. Napojit AI generátor textů na asset group (mode "ads")
- **Category**: feature
- **Impact**: 9
- **Effort**: 4
- **Risk**: 3
- **Gap today**: `CatalogModule.tsx:38` builds the asset group only via the deterministic `buildAssetGroup(product)` (generate.ts). The fully-built `ads` AI tool (`src/lib/ai/tools/ads.ts`, route `mode: "ads"`, hook `useAiTool`) is wired nowhere — `grep` for `mode: "ads"` returns 0 hits. The footer copy at `CatalogModule.tsx:109-110` even tells the user to "napojte AI generátor (/api/ai)", i.e. it is documented-but-unimplemented. `buildAdPrompt` already accepts product/benefits/audience/platform/tone.
- **Proposal**: Add a "Generovat AI texty" button per selected SKU. Convert the module to a client component, call `useAiTool<AdResult>("ads")` with `{ product: product.title, benefits: product.usps.join(", "), audience, platform: "google", tone }`. Render the returned headlines/longHeadline/descriptions/callouts/keywords in the existing `AssetSection`/`AssetChip` layout, with the deterministic `buildAssetGroup` output as the offline/loading fallback. Reuse `AI_TIMEOUT_MS` + localStorage persistence already in the hook.
- **User value**: On-brand, varied Czech ad copy that covers multiple angles instead of templated strings — the difference between a demo and a usable PMax asset group.
- **Fit**: Directly delivers the registry promise ("generujte inzeráty"), uses the project's single LLM seam (`/api/ai`), and matches the established AI-tool pattern used elsewhere. Closes a built-but-unwired feature.

## 2. Import produktového feedu (GMC / XML / CSV) místo hardcoded SAMPLE_PRODUCTS
- **Category**: functionality
- **Impact**: 8
- **Effort**: 6
- **Risk**: 4
- **Gap today**: The feed is hardcoded — `page.tsx:15` passes `SAMPLE_PRODUCTS`, and `sample.ts:3-4` explicitly marks the "Real-integration seam: replace with the Merchant Center / e-shop product feed." There is no upload/paste/URL path, so a user can only ever see the 6 fictional Mionelo SKUs.
- **Proposal**: Add a feed-import affordance to the left feed column (`CatalogModule.tsx:45-75`): paste a Google Merchant Center XML / Google Shopping CSV, or a feed URL, parsed server-side into the `Product` shape (`sku/title/category/price/stock/usps`). Map standard feed fields (`g:title`, `g:price`, `g:availability`, `g:product_type`, `g:custom_label`) to USPs. Keep `SAMPLE_PRODUCTS` as the seeded demo. Store parsed feed JSON-in-repo per the project's data convention.
- **User value**: Generate creative for a user's real catalog, turning the module from a fixed demo into a tool they can run against their own shop.
- **Fit**: The eshop project type is feed-centric; this is the literal "z produktového feedu" half of the blurb, and the seam is already documented in `sample.ts`.

## 3. Export asset group do Google Ads (CSV editor / google-ads.csv)
- **Category**: feature
- **Impact**: 7
- **Effort**: 4
- **Risk**: 3
- **Gap today**: The assembled group is display-only (`CatalogModule.tsx:100-106` just renders chips). There is no copy/download/export — the user cannot get the headlines and descriptions out of the screen and into Google Ads.
- **Proposal**: Add "Kopírovat vše" and "Exportovat" actions in the asset-group header (next to the `PMax / RSA` pill, `CatalogModule.tsx:94-97`). Generate a Google Ads Editor–compatible CSV (one row per asset with columns: Campaign, Asset group, Asset type [Headline/Long headline/Description], Asset text, Final URL using `group.finalUrl`) plus a plain-text "copy all" for quick paste into the RSA builder. Pure client-side blob download — no new backend.
- **User value**: Removes the manual retype step; the generated group becomes immediately actionable inside Google Ads.
- **Fit**: Completes the "sestavte PMax asset group" promise — assembling without an export is a dead end. Low risk, high leverage on existing data.

## 4. A/B varianty inzerátů + výběr nejlepších assetů
- **Category**: feature
- **Impact**: 6
- **Effort**: 5
- **Risk**: 3
- **Gap today**: `buildAssetGroup` returns exactly one fixed set (`generate.ts:49-80`); `clampList` de-dupes and caps but never produces alternatives. There is no way to generate a second variant, compare, or curate which assets ship — RSA/PMax reward asset diversity, which the module can't express.
- **Proposal**: Add a "Vygenerovat variantu B" action that calls the `ads` tool again (idea #1) with a varied `tone` and merges into a candidate pool. Make each `AssetChip` selectable (checkbox/pin), with a counter enforcing Google Ads slot caps (15 headlines / 4 descriptions). Highlight angle coverage (benefit / audience / CTA / trust) using the categories already described in `AD_SYSTEM`. Export (idea #3) ships only the selected assets.
- **User value**: Power users get more candidate copy and control over the final asset mix instead of a single take-it-or-leave-it set.
- **Fit**: Asset diversity is core to PMax performance; this turns a static preview into a curation workflow and deepens the #1/#3 chain.

## 5. Kontrola kvality feedu a Google Ads disapproval rizik
- **Category**: user_benefit
- **Impact**: 6
- **Effort**: 4
- **Risk**: 2
- **Gap today**: The only validation present is per-asset char overflow (`AssetChip` flags `a.len > a.max`, `CatalogModule.tsx:11`). The `ads` tool's `lenViolations`/`validateAds` logic (`ads.ts:77-89`) and the `AD_SYSTEM` policy rules (no superlatives, no unsubstantiated claims, no ALL-CAPS/emoji) are server-only and never surfaced. Feed completeness (missing title/USPs, zero/low stock at `CatalogModule.tsx:51,70`) is not checked as a creative blocker.
- **Proposal**: Add a "Kvalita feedu & rizika" panel for the selected SKU that scores: missing/short fields (no USPs, title too long for any headline angle), out-of-stock SKUs that shouldn't be advertised (reuse `inStock` from `generate.ts:47`), and policy red flags in generated copy (ALL-CAPS, banned superlatives, char overflow) by porting the existing `validateAds` rules to a shared client-safe checker. Show pass/warn pills using the existing `Pill` tones.
- **User value**: Catches the reasons Google Ads disapproves assets before submission — saving the user a rejection cycle.
- **Fit**: An eshop feed's quality directly gates creative quality; this reuses validation logic the codebase already wrote (server-side) and the module's existing overflow concept.
