/** Pure helpers for turning an applied onboarding scan into the app's real data —
 *  today, the keyword-list seed. Framework-free (no I/O) so the apply route can lean
 *  on it while staying thin, and so the idempotency + payload-shaping logic carries a
 *  unit test. The route resolves the tenant + persists; everything decidable without
 *  a store lives here. */
import { classifyIntent, type SavedKeyword } from "@/lib/keywords/types";

/** Sentinel `seed` value stamped on the keyword list an onboarding scan creates.
 *  It is the idempotency key: a tenant is considered "already seeded" when any of
 *  its lists carries this seed, so re-applying a scan never duplicates the list.
 *  (A saved list has no dedicated tag field; the `seed` field is the honest marker
 *  — it names where the list came from.) */
export const SCAN_LIST_SEED = "onboarding-scan";

/** The default cs name for the seeded list (cs is the primary locale; the apply
 *  route has no request locale to key an en variant off). */
export const SCAN_LIST_NAME = "Klíčová slova ze skenu webu";

/** Max keywords to persist from a scan — the scan op returns a handful (4–8); this
 *  is a defensive upper bound matching the onboarding sanitizer's own keyword cap. */
const MAX_KEYWORDS = 12;

/** Convert a scan's plain keyword strings into SavedKeywords. A scan carries no
 *  volume/CPC metrics — it's the user's own site vocabulary, a research SEED rather
 *  than a measured pull — so those numbers are zeroed and competition defaults to
 *  the coarse "medium"; every keyword is tagged `core` (they describe the business
 *  itself). Intent is classified deterministically (brand-aware). Trimmed, deduped
 *  case-insensitively, empties dropped, bounded. Pure. */
export function scanKeywordsToSaved(keywords: readonly string[], brand?: string): SavedKeyword[] {
  const seen = new Set<string>();
  const out: SavedKeyword[] = [];
  for (const raw of keywords) {
    const kw = typeof raw === "string" ? raw.trim() : "";
    if (!kw) continue;
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      keyword: kw,
      intent: classifyIntent(kw, brand),
      opportunity: 0,
      avgMonthlySearches: 0,
      competition: "medium",
      tag: "core",
    });
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/** Whether an onboarding scan should seed a keyword list: only when there are
 *  keywords to save AND the tenant has no scan-originated list yet (idempotent
 *  re-apply). `existingSeeds` is the `seed` field of every current list. Pure. */
export function shouldSeedScanList(existingSeeds: readonly string[], keywordCount: number): boolean {
  if (keywordCount <= 0) return false;
  return !existingSeeds.includes(SCAN_LIST_SEED);
}
