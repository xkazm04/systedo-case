# Product Catalog: Model, Feed Import & Ad-Copy Generation — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Fallback ad copy fabricates concrete brand promises for any shop
- **Severity**: High
- **Lens**: ambiguity
- **Category**: fabricated-claims-in-fallback-copy
- **File**: src/lib/catalog/generate.ts:83-90 (also 108, 112)
- **Scenario**: A user imports their real feed, opens Produktová kreativa without an AI key (or the AI call fails), and exports the deterministic "floor" asset group to the Google Ads Editor CSV. The headlines include "Doprava zdarma nad 1 500 Kč", "Hodnocení 4,8/5 ★", "expedice 24 h" and the description adds "vrácení do 30 dnů" — none of which come from the project, brand context, or feed. They are invented constants.
- **Root cause**: `buildAssetGroup` was written as demo copy for the Mionelo sample and later promoted to the universal deterministic fallback (BM-L1-02 made brand/domain configurable but left the promotional claims hardcoded). Nothing in the code or export flow distinguishes "generic filler" from "verifiable claim"; the export's `Source: Návrh z feedu` label says where the copy came from, not that it contains unverified promises.
- **Impact**: A real shop can bulk-import ads asserting a free-shipping threshold, star rating, dispatch SLA, and return window it doesn't offer — misleading advertising exposure and Google Ads misrepresentation-policy risk, with real budget behind it. The one-word Source column is the only guard, and it doesn't say *why* the copy needs review.
- **Fix sketch**: Split claim-bearing lines out of the deterministic builder: only emit shipping/rating/returns lines when the project's brand context actually supplies them (e.g. optional `claims: { freeShippingFrom?, rating?, returnDays?, dispatchHours? }` param, skip when absent — `clampList` already tolerates shorter input). At minimum, add a docstring warning plus an export-level notice that floor rows contain placeholder claims requiring verification before import.

## 2. Heureka DELIVERY_DATE > 0 is mapped to "out of stock", pausing sellable products
- **Severity**: High
- **Lens**: ambiguity
- **Category**: feed-semantics-mismatch
- **File**: src/lib/catalog/feed.ts:117
- **Scenario**: A Heureka/Zboží feed row carries `<DELIVERY_DATE>3</DELIVERY_DATE>` — per the Heureka spec, "ships in 3 days", a fully orderable product. `parseHeureka` sets `inStock: delivery === "0"` → `false`, which `feedItemsToOfferings` casts into `active: false`, and `mergeCatalog.overlay` treats an explicit `false` as authoritative ("Only an explicit feed availability value overrides" the user's state).
- **Root cause**: DELIVERY_DATE is a *dispatch-delay* field (0 = in stock now, N = days to dispatch, or a date), but the parser collapses it to a boolean where only the literal string "0" counts as available. The tri-state work carefully distinguished "feed said nothing" from "feed said out of stock", but every non-zero delay lands in the wrong bucket of that distinction.
- **Impact**: Whole catalogs of shops that ship in 1–3 days get silently deactivated on import — products vanish from the active catalog, ad copy generation, and inventory pacing, and the diff just reports them as "updated". The user's manual re-activation is then re-paused on every re-import.
- **Fix sketch**: Treat a small numeric delay as available: `inStock: delivery == null ? undefined : /^\d+$/.test(delivery) ? Number(delivery) <= N : false` with N ≈ 3 (or, safer, map only an explicit out-of-stock signal to `false` and everything else numeric to `true`). Document the chosen cutoff next to the Heureka spec reference.

## 3. Google feed price prefers g:price over g:sale_price, importing pre-discount prices
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: wrong-field-precedence
- **File**: src/lib/catalog/feed.ts:131
- **Scenario**: A Merchant Center feed row has `<g:price>499 CZK</g:price>` and `<g:sale_price>349 CZK</g:sale_price>` (an active sale). `first(tagText(b, "g:price"), tagText(b, "g:sale_price"))` picks 499.
- **Root cause**: `first()` implements "fallback" ordering, but for this pair Google's semantics are the opposite: when `sale_price` is present it *is* the current selling price; `price` is the crossed-out base. The sale_price was presumably added as a fallback for feeds missing `price`, inverting the precedence.
- **Impact**: Every discounted SKU imports at its non-sale price — the catalog, the generated headline `"${p.category} ${price}"`, and the exported RSA CSV all advertise a higher price than the shop actually charges, and each re-import "updates" the price back to the wrong value.
- **Fix sketch**: Swap the order — `parseFeedPrice(first(tagText(b, "g:sale_price"), tagText(b, "g:price")))` — with a one-line comment citing the Merchant Center rule (sale_price overrides price while active).

## 4. parseFeedPrice reads Czech dot-thousands ("1.299") as 1.299 CZK — 1000× off
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: locale-number-parsing
- **File**: src/lib/catalog/feed.ts:74-83
- **Scenario**: A CSV or XML feed formats prices Czech-style with a dot thousands separator and no decimals: `1.299 Kč`. Only when *both* separators appear ("1.299,00") is the dot treated as thousands; a lone dot is always treated as the decimal point, so `1.299` parses to `1.299` and the product imports at ~1 CZK.
- **Root cause**: The docstring's examples ("249.00", "1 299,00 Kč", "12.99 CZK") document the shapes that work, but the dominant ambiguous case for a cs-locale feed — dot as thousands with the decimal part omitted — is unhandled and undocumented. `x.replace(",", ".")` also only replaces the first comma, so "1,299,00" style inputs degrade further.
- **Impact**: Affected SKUs land with absurdly low prices that flow into ad headlines ("Ořechy 1 Kč"), margin math, and the export CSV. Because `differs()` counts price changes, the diff shows them as plausible "updated" rows rather than flagging anything.
- **Fix sketch**: Disambiguate a lone dot/comma by group shape: if exactly one separator is present and it's followed by exactly 3 digits at the end of a ≥4-digit number (`/^\d{1,3}(\.\d{3})+$/`), treat it as thousands. Add the "1.299" case to the docstring and a unit test either way the decision goes.

## 5. Brand-new in-stock feed products land with stock 0 + velocity 0, so inventory treats them as dead
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: unknown-vs-zero-conflation
- **File**: src/lib/catalog/feed.ts:295-296 (surfaced via import.ts:63)
- **Scenario**: A user's first import from a Heureka/Google feed (no stock counts — availability only). Every product arrives with `stock: 0, dailyVelocity: 0` even when the feed explicitly says in-stock. The "merge step keeps any existing warehouse count" comment covers re-imports over an existing catalog, but for a brand-new product there is nothing existing to keep.
- **Root cause**: The `active` field got a carefully engineered tri-state (undefined = "feed said nothing"), but `stock` collapses the same unknown into the sentinel 0, which downstream (`toProduct` → Sklad & sezónnost pacing, `buildAssetGroup`'s `inStock = p.stock > 0`) reads as a real count of zero.
- **Impact**: A feed-first user sees their whole active catalog rendered as out of stock: pacing/restock modules alarm on every SKU, and the deterministic ad copy picks the "Předobjednejte ihned" / "Naskladnění brzy" lines for products the feed just declared available — contradicting the feed on the very copy the tri-state work protected.
- **Fix sketch**: When `it.stock` is unknown but `it.inStock === true`, don't emit the 0 sentinel blindly — either make `ProductOffering.stock` optional (larger change) or set a documented "available, count unknown" convention (e.g. derive `inStock` in consumers from `active` when `source === "feed"`/`"merchant-center"` and stock is 0). At minimum, `buildAssetGroup` should not claim preorder purely from `stock === 0` for feed-sourced products.
