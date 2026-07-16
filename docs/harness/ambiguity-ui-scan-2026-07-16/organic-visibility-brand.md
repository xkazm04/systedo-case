# Organic Visibility, Content Distribution & Brand Voice — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Brand grounding block mislabels how/what the brand sells — first-offering nature + single-currency price band
- **Severity**: High
- **Lens**: ambiguity
- **Category**: brand-context-misgrounding
- **File**: src/lib/brand/context.ts:48-50, 65
- **Scenario**: A hybrid catalogue (some offerings `online`, some `local`) or a mixed-currency one (Kč plans + EUR add-on). `deriveBrandContext` takes `nature` from `active[0]` — whichever offering happens to sort first in the unordered catalogue — and the price band takes min/max across ALL active offerings but the currency from the FIRST offering that has one (`active.find(o => o.currency)?.currency || "Kč"`).
- **Root cause**: Two whole-catalogue facts are derived from a single arbitrary element; no aggregation (majority nature / per-currency banding) and no comment admitting the shortcut.
- **Impact**: The block exists precisely to stop the model inventing facts ("nikde nevidím, že by nástroj věděl, co prodávám"), yet it can assert "Prodává online." for a business that mostly sells in person, or emit a band like "290–4900 Kč" that silently merges EUR and CZK amounts. Every caption/article/newsletter generated downstream inherits the wrong claim — the exact failure C1 was built to prevent.
- **Fix sketch**: Nature = most frequent nature across active offerings (reuse `topBy`), with "hybrid" when mixed; price band computed per-currency (or restricted to the dominant currency, noting the count of others). One-line comment stating the aggregation rule.

## 2. Store hiccup silently demotes a pinned AI plan to the sample — inviting a save that clobbers real state
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-fallback-data-loss
- **File**: src/lib/organic-channels/resolve.ts:28-36
- **Scenario**: Firestore/sqlite read throws (network blip, cold creds, corrupted JSON row — `store.local.ts:19` and `store.firestore.ts:19` also swallow parse errors into `null`). `resolveOrganicChannels` catches, returns `{channels: sample, statuses: {}, source: "sample"}` — indistinguishable from "user never tracked anything".
- **Root cause**: A transient read failure and the legitimate empty state collapse into the same return shape; the caller/UI has no `degraded` flag to distinguish them.
- **Impact**: The user opens Kanály, sees the generic seeded plan with every checklist reset, assumes their work is gone (or worse, re-ticks a status — the persistence route then SAVES a fresh state blob without the pinned `plan`, permanently overwriting the real one once the store recovers). Silent, self-amplifying data loss.
- **Fix sketch**: Add `degraded: boolean` (or `source: "sample" | "ai" | "error"`) to `ResolvedChannels` when the catch fires; UI shows a read-only "nepodařilo se načíst uložený plán" banner and disables status writes until a successful re-read.

## 3. Deterministic repurpose() still ships hardcoded parenting hashtags and ignores the article body
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: stale-de-hardcoding
- **File**: src/lib/distribution/generate.ts:52 (also 40, 46, 58)
- **Scenario**: Any non-parenting project (e-shop, SaaS, local service) uses the deterministic fallback variants (no LLM). The Instagram variant ends with `#rodicovstvi #miminko #tipy #blog`; every channel's body is a fixed generic paragraph that never reads `a.body`.
- **Root cause**: BM-L1-04 de-hardcoded the SAMPLE article (`sample.ts:24` explicitly says "so the demo isn't tied to a single unrelated niche" and added `body` "so the repurpose tool has actual substance"), but `repurpose()` was never updated — it still carries the old niche's hashtags and works from the headline only.
- **Impact**: One copy-paste from the "Kopírovat" action and a dental clinic posts baby hashtags to Instagram. The module also contradicts its own recorded design intent, so the next developer can't tell which of the two files states the current rule.
- **Fix sketch**: Drop or derive the hashtag line (e.g. from the project's catalog categories via the brand context), and pull the first `a.body` paragraph into the Newsletter/LinkedIn variants (truncated to `CHANNEL_LIMITS`) so the deterministic output uses the substance the seam already provides.

## 4. Content-schedule day semantics undefined — "published" posts land on future days and a full calendar silently overbooks day 27
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: undefined-time-semantics
- **File**: src/lib/content-schedule/sample.ts:60; src/lib/content-schedule/compute.ts:34-40
- **Scenario**: `initialPosts` rolls status and day independently: a post can be `published` with `day = 26` (published in the future?) while a `scheduled` post sits on day 0. Nothing documents whether day 0 is "today", the window start, or purely ordinal. Separately, `nextFreeDay` returns `WINDOW_DAYS - 1` when every day is at capacity — the caller drops the next idea onto day 27 regardless, breaching the very `capacity` the function enforces, with no signal.
- **Root cause**: `status` and `day` are sampled from independent seeds with no cross-constraint, and the day axis has no anchored meaning; `nextFreeDay`'s "full" case is an escape hatch instead of a distinguishable result.
- **Impact**: The calendar renders internally-contradictory demo data (published items ahead of scheduled ones), and heavy schedulers pile unlimited posts on the last cell — both read as bugs to the user evaluating the board, and any future "real" integration will inherit the ambiguous day-0 anchor.
- **Fix sketch**: Constrain seeding (`published` → day < scheduled days, e.g. first half of the window), document "day 0 = window start (this Monday)" on `ContentPost.day`, and make `nextFreeDay` return `number | null` (null = window full) so the UI can say "kalendář je plný" instead of overbooking.

## 5. SERP pixel-width table misses common Czech accented glyphs, so Czech titles are systematically under-measured
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: locale-blind-approximation
- **File**: src/lib/content/seo-score.ts:31-56
- **Scenario**: A Czech title like "Údržba É-shopu: Šetřte Čas" — `á é ý ů ú ó ť ď ň` and every UPPERCASE diacritic (Č Š Ž Ř Á É Ú…) are absent from `CHAR_EM`, so they fall to `AVG_CHAR_EM = 0.55`. Uppercase Czech letters really advance ~0.67–0.78em, an ~0.15–0.25em under-count per glyph.
- **Root cause**: The table was sampled for ASCII plus a handful of lowercase Czech letters (í, ř, ž, š, č, ě); the fallback constant is tuned to lowercase. For a Czech-language product this hits the majority of real titles, not an edge case.
- **Impact**: The tool's whole value is "flags clipping that character counts miss" — but on accented/uppercase-heavy Czech titles it reports "fits" for titles Google actually truncates, i.e. it fails confidently in exactly its advertised direction. (Adjacent UI nit in the same file: line 241 renders "1 bodů osnovy" / "2 bodů" — Czech needs bod/body/bodů forms.)
- **Fix sketch**: Cheapest correct move: map any character to its NFD base letter before the `CHAR_EM` lookup (`"Á" → "A"`, `"ů" → "u"`) — diacritics barely change Arial advance widths — and keep `AVG_CHAR_EM` only for genuinely unknown glyphs. Add the three-form Czech plural for the outline-points hint.
