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

/** Quote a single CSV field iff it contains a comma, quote, CR or LF, doubling
 *  embedded quotes per RFC 4180. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Build a Google Ads Editor **Responsive Search Ad** CSV: the standard wide
 *  layout `Campaign, Ad group, Headline 1..N, Description 1..M, Final URL`, one
 *  row per ad, which imports directly into Google Ads Editor / the Ads bulk
 *  uploader (Editor matches columns by header name, so a subset of the up-to-15
 *  headline / up-to-4 description columns is accepted). Comma-delimited, CRLF,
 *  RFC 4180-escaped. Pure.
 *
 *  Long headlines are a Performance Max asset type (not RSA) and are deliberately
 *  excluded from this RSA CSV — they stay in the "copy all" plain text. Importing
 *  a full PMax asset group is a separate Editor flow (known seam). */
export function assetGroupCsv(group: AssetGroup, meta: AssetGroupExportMeta): string {
  const headlineCols = group.headlines.map((_, i) => `Headline ${i + 1}`);
  const descCols = group.descriptions.map((_, i) => `Description ${i + 1}`);
  const headers = ["Campaign", "Ad group", ...headlineCols, ...descCols, "Final URL"];
  const row = [
    meta.campaign,
    meta.assetGroupName,
    ...group.headlines.map((a) => a.text),
    ...group.descriptions.map((a) => a.text),
    group.finalUrl,
  ];
  return [headers.map(csvField).join(","), row.map(csvField).join(",")].join("\r\n");
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
