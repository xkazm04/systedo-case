/** Pure exporters that turn an assembled {@link AssetGroup} into shareable text —
 *  a Google Ads Editor-style CSV and a plain-text dump for the clipboard. Pure
 *  and dependency-free; the browser-only blob download lives in `@/lib/export`.
 *  Lets the user get the headlines/descriptions out of the screen and into
 *  Google Ads instead of the asset group being display-only. */
import type { AssetGroup } from "./generate";

export interface AssetGroupExportMeta {
  /** Google Ads campaign name the asset group belongs to. */
  campaign: string;
  /** the asset group's name within that campaign. */
  assetGroupName: string;
}

/** Google Ads Editor asset types we emit (one column value per asset row). */
export type CsvAssetType = "Headline" | "Long headline" | "Description";

/** The fixed CSV header row, in column order. */
export const ASSET_GROUP_CSV_HEADERS = [
  "Campaign",
  "Asset group",
  "Asset type",
  "Asset text",
  "Final URL",
] as const;

/** Quote a single CSV field iff it contains a comma, quote, CR or LF, doubling
 *  embedded quotes per RFC 4180. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

interface CsvRowInput {
  type: CsvAssetType;
  text: string;
}

/** Flatten an asset group into typed (type, text) rows in render order:
 *  headlines, then long headlines, then descriptions. */
function assetRows(group: AssetGroup): CsvRowInput[] {
  return [
    ...group.headlines.map((a) => ({ type: "Headline" as const, text: a.text })),
    ...group.longHeadlines.map((a) => ({ type: "Long headline" as const, text: a.text })),
    ...group.descriptions.map((a) => ({ type: "Description" as const, text: a.text })),
  ];
}

/** Build a Google Ads Editor-style CSV for an asset group: a header row plus one
 *  row per asset (`Campaign, Asset group, Asset type, Asset text, Final URL`).
 *  Comma-delimited with CRLF line ends; every field is RFC 4180-escaped. Pure. */
export function assetGroupCsv(group: AssetGroup, meta: AssetGroupExportMeta): string {
  const header = ASSET_GROUP_CSV_HEADERS.join(",");
  const lines = assetRows(group).map((row) =>
    [meta.campaign, meta.assetGroupName, row.type, row.text, group.finalUrl]
      .map(csvField)
      .join(",")
  );
  return [header, ...lines].join("\r\n");
}

/** Build a plain-text dump of every asset, grouped by section, for "copy all".
 *  Pure; the caller writes it to the clipboard. */
export function assetGroupPlainText(group: AssetGroup, meta: AssetGroupExportMeta): string {
  const section = (title: string, texts: string[]): string[] =>
    texts.length ? [title, ...texts.map((t) => `- ${t}`), ""] : [];

  return [
    `${meta.campaign} — ${meta.assetGroupName}`,
    group.finalUrl,
    "",
    ...section("Headliny:", group.headlines.map((a) => a.text)),
    ...section("Dlouhé headliny:", group.longHeadlines.map((a) => a.text)),
    ...section("Popisky:", group.descriptions.map((a) => a.text)),
  ]
    .join("\n")
    .trimEnd();
}
