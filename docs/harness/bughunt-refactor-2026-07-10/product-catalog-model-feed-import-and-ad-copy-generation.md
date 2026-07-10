# Product Catalog: Model, Feed Import & Ad-Copy Generation

> Total: 5
> Critical: 1 · High: 1 · Medium: 2 · Low: 1
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

_Note: prior report items #1 (`productOfferingsFor`), #4 (`Locality.gbpPlaceId`) and #5 (catalog `csvField`) are already resolved in the current tree (resolve.ts no longer exports it, `Locality` has no `gbpPlaceId`, and `export.ts` now imports the shared `csvCell`). Prior items #2 (store JSON-decode duplication) and #3 (seed/starter `base` literals) still stand verbatim — deliberately NOT restated here._

## 1. IPv4-mapped IPv6 literal in hex form bypasses the SSRF block-list and reaches cloud metadata / loopback

- **Severity**: Critical
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/catalog/feed-fetch.ts:65`
- **Scenario**: `isPublicIp` only normalizes v4-mapped IPv6 addresses written in the **dotted** form (`::ffff:169.254.169.254`) via the regex on line 65. The equivalent **hex** form of the same address — `::ffff:a9fe:a9fe` (cloud metadata) or `::ffff:7f00:1` (127.0.0.1) — does not match that regex, so it falls through to `BLOCK.check(ip, "ipv6")` on line 67. None of the block-list's IPv6 subnets cover the `::ffff:0:0/96` mapped range, so `BLOCK.check` returns `false` and `isPublicIp` returns `true`. An authed project owner posts `{ "url": "http://[::ffff:a9fe:a9fe]/latest/meta-data/iam/security-credentials/" }` to the feed-import route; `validateFeedUrl` (line 86) sees `net.isIP(host) && !isPublicIp(host)` = `true && !true` = `false`, so it does not throw, and because the host is an IP literal the `guardedLookup` DNS check is bypassed entirely — the socket connects the mapped address straight to the IPv4 metadata endpoint.
- **Root cause**: the guard assumes v4-mapped addresses only ever arrive in the human-readable dotted notation, but `net.isIP` accepts (and the kernel routes) the fully-hex `::ffff:h:h` notation too; the block-list was built for real IPv6 ranges and never included the mapped-v4 compatibility range.
- **Impact**: security — full SSRF to 169.254.169.254 (cloud IAM credential theft) and any RFC-1918 / loopback service, defeating the module's central threat model.
- **Fix sketch**: in `isPublicIp`, before the block-list check, detect the mapped range generically: if `fam === 6` and the address lower-cases to a `::ffff:` prefix, extract the embedded 32 bits (handle BOTH the dotted tail and the two hex groups) and recurse on the reconstructed dotted IPv4; alternatively add `BLOCK.addSubnet("::ffff:0:0", 96, "ipv6")` AND normalize before checking. Also reject any `::ffff:*` host outright in `validateFeedUrl`.

## 2. Re-importing an availability-less feed silently re-activates every product the user paused

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/catalog/import.ts:57`
- **Scenario**: `feedItemsToOfferings` (feed.ts:275) sets `active: it.inStock ?? true` — so when a feed carries **no** availability field (a Heureka item with no `DELIVERY_DATE`, a Google item with no `g:availability`, or any CSV without an availability column), the incoming product is `active: true`. `overlay` then does `active: incoming.active` (import.ts:57) unconditionally, overwriting the stored value. A user who manually paused/deactivated SKUs (or whose feed simply omits availability) has all of them flipped back to `active: true` on the next routine price/feed refresh. Note the careful asymmetry two lines below: `stock` treats `0` as "unknown" and preserves the existing count (`incoming.stock > 0 ? incoming.stock : existing.stock`), and `margin`/`dailyVelocity` are only taken from authoritative warehouse sources — but `active` gets no such "unknown" guard.
- **Root cause**: "unknown availability" and "in stock / active" are conflated into one boolean at parse time (`?? true`), so the merge layer cannot distinguish "the feed says this is live" from "the feed said nothing", and it treats availability as always feed-owned.
- **Impact**: state corruption / money — paused (e.g. discontinued, out-of-margin, seasonal) products silently go live again into ads and inventory pacing after any feed re-import; the user's deliberate deactivation is lost with no diff signal beyond a generic "updated".
- **Fix sketch**: make availability tri-state — have `feedItemsToOfferings` emit `active: it.inStock` (leave `undefined` when the feed is silent) and in `overlay` use `active: incoming.active ?? existing.active`, mirroring the `stock`/`gtin` preserve-on-unknown pattern already in the file. Requires widening `ProductOffering.active` handling at the feed boundary only (the store type stays `boolean`).

## 3. Concurrent feed imports are a read-modify-write with last-write-wins — one import's rows are lost

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/lib/catalog/store.ts:18`
- **Scenario**: the import route does `current = await listOfferings(...)` → `mergeCatalog(current, incoming, ...)` → `await saveOfferings(uid, id, next)` (import/route.ts:78-85), and `saveOfferings` is a blind full-blob replace (store.ts:18 → both backends `set`/upsert the whole `Offering[]`). The per-user limiter allows 8 imports/min, so two overlapping `mode:"apply"` requests (double-click, or two tabs / a CSV + a URL import) both read the same `current`, each merge their own `incoming` against it, and the second `saveOfferings` overwrites the first — the first import's added/updated products vanish even though its response reported success.
- **Root cause**: catalog persistence has no optimistic-concurrency token or transactional read-merge-write; the merge is done in application code against a snapshot with no revalidation at write time, and the store API only exposes whole-catalog replace.
- **Impact**: data loss — silently dropped imported products; the "success theater" is that both HTTP responses return `applied:true` with plausible diffs.
- **Fix sketch**: add an `updatedAt`/version guard to `saveOfferings` (Firestore: a transaction that re-reads the doc and compares a stored `rev`; local sqlite: wrap the read-merge-write of the import in a single `IMMEDIATE` transaction or a `WHERE updated_at = ?` conditional update, retrying on mismatch). At minimum, serialize per-(user,project) imports.

## 4. Generated Final URL is not URL-encoded — SKUs with spaces/slashes produce invalid ad URLs

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/catalog/generate.ts:122`
- **Scenario**: `finalUrl: \`https://${domain || "www.example.com"}/p/${p.sku.toLowerCase()}\``. Feed-imported SKUs are arbitrary text (feed.ts derives `sku` from `it.id` sliced to 80 chars, never sanitized for URLs), so a real SKU like `"12 3/4"` or `"AB CD"` yields `.../p/12 3/4` — the space makes the exported Google Ads Editor Final URL invalid and the embedded `/` silently changes the path segment. The value flows into the RSA CSV (`assetGroupCsv` → `group.finalUrl`) that the user uploads to Google Ads, where the ad is then disapproved for an invalid final URL.
- **Root cause**: the URL is string-interpolated from an untrusted identifier on the assumption SKUs are URL-safe slugs; feed SKUs are not.
- **Impact**: user-visibly-broken export — disapproved ads / wrong landing paths for any shop whose SKUs contain spaces or `/`.
- **Fix sketch**: slugify or `encodeURIComponent` the SKU path segment (`/p/${encodeURIComponent(p.sku.toLowerCase())}` or a hyphenated slug), and ideally prefer the product's own `url` field from the feed when present rather than synthesizing one.

## 5. CSV stock count with a dot-thousands separator is parsed 1000× too small

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/catalog/feed.ts:216`
- **Scenario**: CSV stock is parsed as `Number(stockRaw.replace(/[^\d.-]/g, ""))`. Unlike `parseFeedPrice` (which deliberately handles Czech `1.299,00` thousands/decimal conventions), the stock path keeps the dot: a Czech-formatted quantity `"1.234"` (meaning 1234 units) becomes `Number("1.234")` = `1.234`, passes `Number.isFinite && >= 0`, and is stored as a fractional stock of ~1. Days-of-cover / restock pacing in the inventory module then treats a well-stocked SKU as nearly out of stock.
- **Root cause**: two number-parsers with divergent locale rules — the price parser is locale-aware, the stock parser is a naive `Number()` after stripping non-numerics, so it silently misreads the exact formatting the price parser was written to handle.
- **Impact**: wrong number — understated inventory → spurious "reorder / pause" recommendations for high-stock products (space-separated thousands `"1 234"` happen to survive; only dot-thousands break).
- **Fix sketch**: parse stock through an integer-aware helper that strips grouping separators (reuse the normalization logic from `parseFeedPrice`, then `Math.round`), or `Math.trunc(Number(stockRaw.replace(/[^\d-]/g, "")))` since stock is a whole-unit count and never has a real decimal.
