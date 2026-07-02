/** CSV + client-download helpers shared by the export buttons (dashboard
 *  channel table, AI tool outputs). `toCsv`/`csvNum` are pure; `downloadText`
 *  is browser-only and a no-op on the server. */

import { DEFAULT_LOCALE, LOCALES, type SupportedLocale } from "@/lib/format";

/** Quote a CSV field when it contains the delimiter, a quote, or a newline. */
function csvField(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV document from a header row + data rows. Uses a semicolon
 *  delimiter — the separator Czech Excel (cs-CZ) expects — and CRLF line ends. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvField).join(";")).join("\r\n");
}

/** A numeric cell in the locale the export targets: "0,85" for cs (the decimal
 *  comma Czech Excel parses as a number), "0.85" for en. Grouping is disabled so
 *  a thousands space can never split the cell, and a non-finite value degrades
 *  to the empty cell the exports already use for missing ratios. Pair with
 *  `toCsv` (semicolon delimiter → a decimal comma needs no quoting) or quote via
 *  the consumer's own field escaper for comma-delimited documents. */
export function csvNum(n: number, digits = 2, locale: SupportedLocale = DEFAULT_LOCALE): string {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat(LOCALES[locale].intlLocale, {
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(n);
}

/** UTF-8 byte-order mark, so Excel renders Czech diacritics in the export. */
const BOM = "﻿";

/** Trigger a browser download of text content. Prepends a UTF-8 BOM so Excel
 *  renders Czech diacritics correctly. No-op on the server / without DOM. */
export function downloadText(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8"
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([BOM, content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of a data: URL (e.g. a generated image). Browser-
 *  only; a no-op without DOM. */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
