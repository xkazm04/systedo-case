# Organic Visibility, Content Distribution & Brand Voice

> Total: 5
> Critical: 0 · High: 0 · Medium: 2 · Low: 3
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

_Note on prior report: findings #1 (branding luminance dup) and #2 (organic-channels PRNG dup) have since been FIXED in source (`branding/compute.ts` now delegates to `design-tokens-color`; `sample.ts` now imports `mulberry32`/`hashStr` from `@/lib/demo/prng.mjs`). Findings #3 (dead sparkline), #4 (Facebook triple entry), #5 (META_MAX dup) are still present and are NOT restated below._

## 1. Seeded channel plan leaks the "(demo)"/"(ukázka)" project-name marker into rationale, first-actions and the content-engine handoff

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/organic-channels/sample.ts:484`
- **Scenario**: `channelPlanForProject` builds the fill context as `baseChannelPlan(project.type, { brand: project.name, ...ctx }, project.id)` — passing the **raw** `project.name`. The seed templates carry ~15 `{brand}` placeholders (e.g. `sample.ts:48` `"Bezplatný firemní profil {brand}…"`, `:56`/`:107` `contentAngle: "Newsletter {brand}: …"`), and `fill()` (`sample.ts:437`) substitutes them verbatim. For a demo/sample project named `"Dentalis (demo)"`, the Kanály module then renders "Bezplatný firemní profil **Dentalis (demo)** …" in every channel's rationale/firstActions, and the `contentAngle` string ("Newsletter Dentalis (demo): …") is what the "Vytvořit obsah" button hands off to the content/social AI tools — poisoning the generated public copy with the test-account marker.
- **Root cause**: the sibling name→content boundary `brand/context.ts:66` deliberately runs `promptSafeName(project.name)` to strip the `(demo)/(ukázka)/(sample)` marker (UAT finding L1-19), but this parallel boundary was never wired to the same helper and uses the raw name. (The component fallback `OrganicChannels.tsx:231` `příspěvek pro ${project.name}` has the identical raw-name leak.)
- **Impact**: user-visible test-account marker across the whole Kanály plan for any demo/sample project, and — worse — that marker flows into AI-generated captions/articles via the content-engine handoff, exactly the leak `promptSafeName` exists to prevent.
- **Fix sketch**: wrap the name at the boundary — `{ brand: promptSafeName(project.name), ...ctx }` in `channelPlanForProject` (import from `@/lib/projects/name`), and fix the `OrganicChannels.tsx:231` fallback the same way.

## 2. Brand price band pools prices across all offerings but labels them with a single arbitrary currency

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/brand/context.ts:48`
- **Scenario**: `deriveBrandContext` computes `prices = active.map(o => o.price).filter(p > 0).sort()` across **every** active offering regardless of its `currency`, then picks `currency = active.find(o => o.currency)?.currency || "Kč"` — which, since `OfferingBase.currency` is a required string, is simply `active[0].currency`. `band = \`${prices[0]}–${prices[last]} ${currency}\``. A catalog that mixes currencies (e.g. a `feed`/`merchant-center`-imported EUR plan alongside CZK products) produces a band like `"50–2000 EUR"` where the `2000` is actually a CZK price — the min and max can come from offerings in different currencies while the label reflects only the first offering's. This block is joined into the public-facing brand grounding sent to the content & social AI tools.
- **Root cause**: the helper assumes one uniform currency for the whole catalogue (the `price` doc-comment says "CZK"), but `currency` is a per-offering free string with importable non-CZK sources, so the single-currency assumption can be false.
- **Impact**: wrong/misleading price range grounded into AI captions & articles — the model can state a price band that mixes magnitudes across currencies, i.e. a money-wrong public claim.
- **Fix sketch**: derive the band per-currency — group `active` by `currency`, build the band only from the dominant-currency subset (or emit one band per currency present), and drop the band entirely when offerings span currencies. Consider `formatMoney`-style thousands formatting while there.

## 3. Whole-brand "sells online/local/hybrid" claim is taken from a single arbitrary offering

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/brand/context.ts:65`
- **Scenario**: `nature = active[0]?.nature ?? "online"` — the brand-wide sentence `Prodává ${NATURE_CS[nature]}` / `Sold ${NATURE_EN[nature]}` is derived from the **first** active offering only. A catalogue with, say, an online e-shop product listed first and a location-bound service second is grounded as purely `"online"`, asserting a false fact about how the brand sells. Unlike `cats`/`points`/`channels` (aggregated via `topBy`), `nature` is not aggregated at all.
- **Root cause**: assumes every offering shares the first one's `nature`; `OfferingNature` is per-offering and a real catalogue can be mixed (the whole app hangs on the online/local axis, so mixed is expected, not exotic).
- **Impact**: the AI grounding block states a single sell-mode that can contradict the actual catalogue, so generated copy may omit the local/online half of the business.
- **Fix sketch**: aggregate — if the active set contains both online-only and local-only natures (or any `hybrid`), ground it as `hybrid`; otherwise use the shared value. A `topBy(active, o => o.nature, 1)` majority, or an explicit online∪local → hybrid rollup.

## 4. `statusCounts` silently yields NaN for any post status outside the three-key record

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/content-schedule/compute.ts:11`
- **Scenario**: `statusCounts` seeds `{ idea: 0, scheduled: 0, published: 0 }` and does `for (const p of posts) c[p.status]++`. The board is persisted through the generic state route (`/api/projects/[id]/state/content-schedule`), which stores `body.data` **unvalidated** (only size-capped, `state/[key]/route.ts`) and re-hydrates it as `ContentPost[]` with no runtime check (`obsah-plan/page.tsx:20`). Any post whose `status` is not one of the three known keys (a crafted PUT from the authenticated owner, or a future `PostStatus` value added to the union but not to this record) makes `c[unknown]` be `undefined`, `undefined++` → `NaN`, and the counts header renders `NaN` with no error — classic success-theater.
- **Root cause**: an exhaustive-looking hardcoded counter that does not default-initialize per encountered key and trusts that persisted data always matches the current enum.
- **Impact**: a single bad/legacy row turns the whole status summary into `NaN`; degradation is silent (no throw, no log).
- **Fix sketch**: guard the increment — `if (p.status in c) c[p.status]++;` (skip unknowns), or build counts from `CHANNEL_STATUSES`-style known-keys iteration. Pairs well with sanitizing the content-schedule payload in the state route.

## 5. Organic-channels stores write an `updated_at` column/field nothing ever reads; the `types.ts` comment misdescribes who stamps it

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: dead-code
- **File**: `src/lib/organic-channels/store.local.ts:24`
- **Scenario**: `store.local.saveOrganicChannels` writes an `updated_at` **column** and `store.firestore.saveOrganicChannels:27` writes an `updatedAt` **doc field**, each stamped with their own `new Date().toISOString()`. A repo-wide grep shows neither is ever SELECTed / read back — the timestamp that `resolveOrganicChannels` actually surfaces (`resolve.ts:42` `updatedAt: state.updatedAt`) lives **inside the JSON blob**, stamped by the route (`organic-channels/route.ts:20` `{ ...state, updatedAt: … }`). So each store performs a write-only timestamp that no code consumes, and `types.ts:127-128`'s comment — "Returns the blob without `updatedAt` (**the store stamps that**)" — is wrong: the *route* stamps the blob; the store stamps a separate, dead value. (Not in the 2026-07-09 report, which covered branding-luminance, PRNG, sparkline, Facebook and META_MAX only.)
- **Root cause**: the store-trio was mirrored from `local-signals`' `{meta, updated_at}` shape, but here the consumed timestamp was moved into the blob by the route, leaving the store-level stamp orphaned and the sanitizer comment stale.
- **Impact**: dead writes plus a misleading comment — a maintainer who trusts "the store stamps that" and drops the route's `updatedAt` stamp would silently break the last-saved timestamp shown in the Kanály UI, because the store-level value they'd rely on is never read.
- **Fix sketch**: either read the column/field (have `getOrganicChannels` merge `updated_at` into the returned state and drop the route's blob-stamp), or delete the dead `updated_at`/`updatedAt` writes and correct the `types.ts:127` comment to say the *route* stamps the blob. Pick one owner for the timestamp.
