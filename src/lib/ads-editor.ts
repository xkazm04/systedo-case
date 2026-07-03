/** Google Ads Editor import shape for a generated RSA — pure row builders.
 *
 *  The generic ad export (Type/Text/CharCount listing) is fine for a
 *  spreadsheet but importable nowhere: Ads Editor (and the Ads UI bulk upload)
 *  expects ONE row per ad with `Campaign / Ad group / Headline 1..15 /
 *  Description 1..4 / Path 1 / Final URL` columns, plus a separate keyword
 *  sheet. These builders transpose an AdResult into exactly that, so
 *  "download → import → launch" replaces hand-transposing the listing.
 *
 *  Column headers stay in English regardless of UI locale — they are the
 *  identifiers Ads Editor's import mapping recognizes, not display copy.
 *  Framework-free; pair with toCsv/downloadText from ./export. */
import type { AdResult } from "@/lib/ai-types";

/** RSA slot counts per Google's spec. */
export const ADS_EDITOR_MAX_HEADLINES = 15;
export const ADS_EDITOR_MAX_DESCRIPTIONS = 4;

export interface AdsEditorSeed {
  campaign: string;
  adGroup: string;
  /** display-path segment (already slugified by the caller) */
  path1: string;
  finalUrl: string;
}

export interface AdsEditorSheet {
  headers: string[];
  rows: (string | number)[][];
}

/** Non-empty, trimmed assets in original order, capped to the slot count. */
const takeSlots = (values: readonly string[], max: number): string[] =>
  values
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);

/** One wide "Responsive search ad" row: headlines spread into Headline 1..15,
 *  descriptions into Description 1..4 (blank cells pad unused slots, so the
 *  column set is always complete and mappable). */
export function buildAdsEditorAdSheet(
  ad: Pick<AdResult, "headlines" | "descriptions">,
  seed: AdsEditorSeed
): AdsEditorSheet {
  const headlines = takeSlots(ad.headlines, ADS_EDITOR_MAX_HEADLINES);
  const descriptions = takeSlots(ad.descriptions, ADS_EDITOR_MAX_DESCRIPTIONS);
  const headers = [
    "Campaign",
    "Ad group",
    "Ad type",
    ...Array.from({ length: ADS_EDITOR_MAX_HEADLINES }, (_, i) => `Headline ${i + 1}`),
    ...Array.from({ length: ADS_EDITOR_MAX_DESCRIPTIONS }, (_, i) => `Description ${i + 1}`),
    "Path 1",
    "Final URL",
  ];
  const row: (string | number)[] = [
    seed.campaign,
    seed.adGroup,
    "Responsive search ad",
    ...Array.from({ length: ADS_EDITOR_MAX_HEADLINES }, (_, i) => headlines[i] ?? ""),
    ...Array.from({ length: ADS_EDITOR_MAX_DESCRIPTIONS }, (_, i) => descriptions[i] ?? ""),
    seed.path1,
    seed.finalUrl,
  ];
  return { headers, rows: [row] };
}

/** The companion keyword sheet: one row per generated keyword, broad match by
 *  default (the safest starting point to then narrow inside Ads Editor). */
export function buildAdsEditorKeywordSheet(
  keywords: readonly string[],
  seed: Pick<AdsEditorSeed, "campaign" | "adGroup">,
  matchType = "Broad"
): AdsEditorSheet {
  const headers = ["Campaign", "Ad group", "Keyword", "Match type"];
  const rows = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k): (string | number)[] => [seed.campaign, seed.adGroup, k, matchType]);
  return { headers, rows };
}
