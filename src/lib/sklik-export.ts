/** Sklik (Seznam) import shape for a generated "kombinovaná reklama" (combined
 *  search ad) — pure row builders, the Sklik counterpart to `ads-editor.ts`.
 *
 *  WHY a separate exporter: `ads-editor.ts` produces a Google-Ads-Editor row
 *  (English headers, 15/4 RSA slots, "Broad" match type, "Responsive search ad")
 *  that a Czech advertiser on Sklik cannot import. Sklik is a Czech-only product
 *  with its own combined-ad shape, so a faithful export needs Czech column headers
 *  and Sklik's own slot/limit vocabulary.
 *
 *  SLOT COUNTS + CHARACTER LIMITS — source: Seznam's public Sklik help
 *  (napoveda.sklik.cz, "Kombinovaná reklama"): up to 15 titulků (headlines) of
 *  30 characters and up to 4 popisky (descriptions) of 90 characters. These are
 *  the SAME search limits Google RSA uses — which is exactly why the shared
 *  AD_LIMITS honesty holds (ad-strength.ts rates against "Google Ads / Sklik").
 *  They are declared here as Sklik's OWN constants (not re-exported from
 *  AD_LIMITS) so if Seznam ever diverges from Google, only this file changes and
 *  the Google export stays byte-identical.
 *
 *  IMPORT FORMAT CAVEAT: Sklik's machine bulk-import column spec is not published
 *  in a form verifiable offline. The Czech headers below mirror the Sklik web UI
 *  (Kampaň / Sestava / Titulek / Popisek / Zobrazovaná URL / Cílová URL) so the
 *  CSV is an unambiguous, hand-mappable import sheet rather than a guessed binary
 *  contract. Framework-free; pair with toCsv/downloadText from ./export. */
import type { AdResult } from "@/lib/ai-types";

/** Sklik kombinovaná reklama slot counts + hard character limits (see file doc). */
export const SKLIK_MAX_HEADLINES = 15;
export const SKLIK_MAX_DESCRIPTIONS = 4;
export const SKLIK_HEADLINE_LIMIT = 30;
export const SKLIK_DESCRIPTION_LIMIT = 90;

export interface SklikSeed {
  /** Kampaň */
  campaign: string;
  /** Sestava (ad group) */
  adGroup: string;
  /** Zobrazovaná URL (display URL shown in the ad) */
  displayUrl: string;
  /** Cílová URL (final landing URL) */
  finalUrl: string;
}

export interface SklikSheet {
  headers: string[];
  rows: (string | number)[][];
}

/** Non-empty, trimmed assets in original order, capped to the slot count, with
 *  any asset OVER Sklik's hard character limit OMITTED (not silently truncated).
 *  An over-limit asset only arises from a manual edit the UI already flags red;
 *  dropping it keeps the imported ad from shipping mangled copy the user never
 *  approved. Sklik's search limits equal Google's (30/90), so normal generated
 *  output never overflows and this filter is a no-op on it. */
const takeSklikSlots = (values: readonly string[], maxSlots: number, charLimit: number): string[] =>
  values
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= charLimit)
    .slice(0, maxSlots);

/** One wide "Kombinovaná reklama" row: titulky spread into Titulek 1..15, popisky
 *  into Popisek 1..4 (blank cells pad unused slots so the column set is always
 *  complete and mappable) — the Sklik analogue of buildAdsEditorAdSheet. */
export function buildSklikAdSheet(
  ad: Pick<AdResult, "headlines" | "descriptions">,
  seed: SklikSeed
): SklikSheet {
  const headlines = takeSklikSlots(ad.headlines, SKLIK_MAX_HEADLINES, SKLIK_HEADLINE_LIMIT);
  const descriptions = takeSklikSlots(ad.descriptions, SKLIK_MAX_DESCRIPTIONS, SKLIK_DESCRIPTION_LIMIT);
  const headers = [
    "Kampaň",
    "Sestava",
    "Typ reklamy",
    ...Array.from({ length: SKLIK_MAX_HEADLINES }, (_, i) => `Titulek ${i + 1}`),
    ...Array.from({ length: SKLIK_MAX_DESCRIPTIONS }, (_, i) => `Popisek ${i + 1}`),
    "Zobrazovaná URL",
    "Cílová URL",
  ];
  const row: (string | number)[] = [
    seed.campaign,
    seed.adGroup,
    "Kombinovaná reklama",
    ...Array.from({ length: SKLIK_MAX_HEADLINES }, (_, i) => headlines[i] ?? ""),
    ...Array.from({ length: SKLIK_MAX_DESCRIPTIONS }, (_, i) => descriptions[i] ?? ""),
    seed.displayUrl,
    seed.finalUrl,
  ];
  return { headers, rows: [row] };
}

/** The companion keyword sheet: one row per generated keyword. Sklik's match
 *  types are Czech — the default "Volná" (broad) is the safest starting point to
 *  then narrow (frázová / přesná) inside Sklik, mirroring the Google sheet's
 *  "Broad" default. */
export function buildSklikKeywordSheet(
  keywords: readonly string[],
  seed: Pick<SklikSeed, "campaign" | "adGroup">,
  matchType = "Volná"
): SklikSheet {
  const headers = ["Kampaň", "Sestava", "Klíčové slovo", "Typ shody"];
  const rows = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k): (string | number)[] => [seed.campaign, seed.adGroup, k, matchType]);
  return { headers, rows };
}
