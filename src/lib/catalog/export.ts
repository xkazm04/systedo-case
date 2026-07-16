/** Pure exporters that turn an assembled {@link AssetGroup} into shareable text —
 *  a Google Ads Editor-style CSV and a plain-text dump for the clipboard. Pure
 *  and framework-free: it shares the one RFC-4180 cell escaper (`csvCell`) with
 *  `@/lib/export` but never touches the DOM; the browser-only blob download lives
 *  in `@/lib/export`. Lets the user get the headlines/descriptions out of the
 *  screen and into Google Ads instead of the asset group being display-only. */
import type { AssetGroup } from "./generate";
import { csvCell } from "@/lib/export";

export interface AssetGroupExportMeta {
  /** Google Ads campaign name the asset group belongs to. */
  campaign: string;
  /** the asset group's name within that campaign. */
  assetGroupName: string;
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
  return [headers.map(csvCell).join(","), row.map(csvCell).join(",")].join("\r\n");
}

/** One row of a catalog-wide RSA export: an asset group + its Editor names + whether
 *  it came from AI copy or the deterministic feed floor (so the export is honest about
 *  which SKUs were model-written and which are the assembled fallback). */
export interface CatalogAdCopyExportRow {
  group: AssetGroup;
  meta: AssetGroupExportMeta;
  source: "ai" | "floor";
}

/** Human, localized label for the export's Source column — AI copy vs the assembled
 *  feed floor. Kept tiny + pure so the CSV exporter stays framework-free. */
export function adCopySourceLabel(source: "ai" | "floor", locale: "cs" | "en" = "cs"): string {
  if (source === "ai") return "AI";
  return locale === "en" ? "Feed draft" : "Návrh z feedu";
}

/** Build ONE Google Ads Editor RSA CSV over an ENTIRE catalog's worth of asset groups
 *  — one row per SKU, a uniform column grid (`Headline 1..maxH`, `Description 1..maxD`)
 *  sized to the widest row so Editor matches every column by header, plus a trailing
 *  `Source` column labeling each row AI vs the deterministic feed floor. The single-SKU
 *  {@link assetGroupCsv} stays for the per-item export; this is the "export everything"
 *  companion. Long headlines stay out of the RSA grid (a PMax asset type), same as the
 *  single exporter. Comma-delimited, CRLF, RFC 4180-escaped. Pure. */
export function catalogAdCopyCsv(rows: CatalogAdCopyExportRow[], locale: "cs" | "en" = "cs"): string {
  const maxH = Math.max(1, ...rows.map((r) => r.group.headlines.length));
  const maxD = Math.max(1, ...rows.map((r) => r.group.descriptions.length));
  const headlineCols = Array.from({ length: maxH }, (_, i) => `Headline ${i + 1}`);
  const descCols = Array.from({ length: maxD }, (_, i) => `Description ${i + 1}`);
  const headers = ["Campaign", "Ad group", ...headlineCols, ...descCols, "Final URL", "Source"];
  const pad = (assets: { text: string }[], n: number): string[] =>
    Array.from({ length: n }, (_, i) => assets[i]?.text ?? "");
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    const row = [
      r.meta.campaign,
      r.meta.assetGroupName,
      ...pad(r.group.headlines, maxH),
      ...pad(r.group.descriptions, maxD),
      r.group.finalUrl,
      adCopySourceLabel(r.source, locale),
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n");
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
