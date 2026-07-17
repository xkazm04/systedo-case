# Fixes — Wave 19 (module-clustered tail: catalog, inventory, catalog/inventory UI, onboarding/integrations/growth)

Branch: `vibeman/ambiguity-ui-2026-07-16`. Scope: the four reports' remaining High →
Medium → Low findings not closed by earlier waves. **15 findings addressed, 15 fixed
(2 High + 12 Medium + 1 Low), 0 deferred.** tsc 0 · `npm run test:unit` **1750/1750**
(baseline 1737; +13 net new tests) · 0 regressions.

## Commits

| # | Report / finding | Sev | Commit | Scope |
|---|------------------|-----|--------|-------|
| 1 | product-catalog #1 | High | `fix(catalog): stop the deterministic ad-copy floor from fabricating shop promises` | catalog/generate |
| 2 | catalog-inventory-ui #2 | High | `fix(distribution): guard the attribution table against an empty channel set` | DistributionModule |
| 3 | product-catalog #3, #4 | Med | `fix(catalog): correct Google sale-price precedence and cs dot-thousands price parsing` | catalog/feed |
| 4 | product-catalog #5 | Med | `fix(catalog): don't advertise available feed products as preorder from a stock-0 sentinel` | catalog/generate+offering+sample |
| 5 | catalog-inventory-ui #3 | Med | `fix(catalog-ui): export-all button counts products, not AI-copy SKUs` | CatalogModule |
| 6 | catalog-inventory-ui #4 | Med | `fix(catalog-ui): reset an orphaned kind filter when its option disappears` | CatalogManagerModule |
| 7 | catalog-inventory-ui #5 | Med | `fix(inventory-ui): serialize plan decision saves so one can't revert another` | InventoryBudgetActions |
| 8 | inventory-warehouse-sync #3 | Med | `fix(inventory): make an undecryptable warehouse token diagnosable, not a phantom no-token` | token-crypto + sync route + route-utils |
| 9 | inventory-warehouse-sync #4 | Med | `fix(inventory): localize sync failure codes instead of persisting raw machine tokens` | inventory/sync + cron route |
| 10 | inventory-warehouse-sync #5 | Med | `fix(inventory): drop budget moves with a missing donor instead of fabricating context` | inventory/action-plan |
| 11 | onboarding-integrations-growth #2 | Med | `fix(onboarding): don't un-dismiss the card when the state read transiently fails` | onboarding/progress + card + demo |
| 12 | onboarding-integrations-growth #3 | Med | `fix(lead-signals): clamp the funnel invariant after scaling to a small lead target` | lead-signals/summary |
| 13 | onboarding-integrations-growth #4 | Med | `fix(lead-quality): return roi null for unpaid sources instead of the Infinity sentinel` | lead-quality/compute + module |
| 14 | onboarding-integrations-growth #5 | Low | `fix(onboarding): decode HTML entities in one pass, fixing double-decode and astral/hex cases` | onboarding/site-fetch |

(product-catalog #3 and #4 share one commit — same file, intertwined test additions.)

## Narratives

- **#1 fabricated floor copy** — `buildAssetGroup` hardcoded free-shipping/rating/dispatch/
  return promises (demo copy promoted to the universal fallback). Now an optional
  `FloorClaims` param supplies each promise; a claim line is emitted only when its value
  is present. Claim-free copy is grounded in title/category/price/USPs. No caller passes
  claims yet, so today the floor asserts *no* promotional claim — the safe default.
- **#2 empty-attribution crash** — reduce seeded with `attribution[0]!` + unconditional
  `best.channel` threw on `[]`. `best` is null-guarded, pill renders only when present,
  empty table row added. (InventorySeasonModule's same `season[0]!` pattern is safe by
  construction — the seasonality array always has 12 entries — left untouched.)
- **#3/#4 feed parsing** — sale_price now wins over price (Merchant Center rule);
  parseFeedPrice reads a lone dot/comma grouping in exact 3s with no decimals as
  thousands ("1.299 Kč" → 1299) while leaving genuine 2-decimal prices alone.
- **#5 feed availability** — `Product.available` (optional) is set by `toProduct` from the
  offering's `active` for feed/merchant-center sources; `buildAssetGroup` prefers it over
  `stock > 0`, so an in-stock feed product with an unknown (0) count no longer reads as a
  preorder. Pacing (stock-driven) is a separate, larger concern — see below.
- **#7 decision-save race** — single `busy` flag serializes all decision buttons; failure
  rolls back only the affected key via a functional updater.
- **#8 token rotation** — `looksEncrypted` distinguishes a stored-but-undecryptable blob
  from no-token; the sync route returns a clear "re-enter your token" (`token-undecryptable`,
  422); module header documents the secret-precedence rotation hazard.
- **#10 fabricated donor** — moves whose donor SKU is absent from the stock snapshot are
  filtered out (of the plan and the guardrail check) instead of inventing `"low"`/0.
- **#11 onboarding flap** — the state read is a tagged result exposing `stateUnknown`; the
  always-visible card hides on unknown rather than resurfacing a dismissed card.

## Behavior changes needing sign-off

1. **Deterministic ad-copy floor no longer emits any shipping/rating/return/dispatch
   claim** (until a caller supplies `FloorClaims`). This is the intended honesty fix, but
   it narrows the fallback copy (product B floor: 8 → ~5 headlines). The claims plumbing
   from project/brand context is a follow-up (`buildAssetGroup` is ready for it).
2. **Google feed price precedence flipped to sale_price** — discounted SKUs now import at
   the sale price. Correct per Merchant Center, but re-imports will "update" prices
   downward for shops that previously ran with the base price.
3. **Warehouse failure text is now localized** — the connection badge / failure email show
   cs sentences instead of raw codes; `token-undecryptable` is a new API error code.

## Deferred (documented, not skipped)

- **product-catalog #5 pacing half** — the deep fix (feed in-stock products landing with
  `stock 0` also alarming the Sklad/pacing modules) needs `ProductOffering.stock` to become
  optional, a larger cross-cutting change the finding itself flags as such. Only the ad-copy
  contradiction (the finding's stated minimum) is fixed this wave.

## Patterns

- Two findings in one file with intertwined test hunks → one commit citing both refs
  (product-catalog #3/#4), rather than fighting non-interactive `git add -p`.
- Render-time state reconciliation (setState-during-render) reused for the orphaned kind
  filter, matching the existing pagination-window pattern.
- `null` (not `Infinity`, not a magic 0) as the "no meaningful value" sentinel — aligns
  roi with the codebase's `relDelta`/`Velocity` convention and survives JSON serialization.
- Tagged `{ok, value}` result to separate "read failed" from "empty" where the two carry
  different UX meaning (onboarding persisted intent).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — 1750 pass / 0 fail (baseline 1737).
- `git status` — the four untracked `uat/driver/*.mjs` remain untracked (never staged).
