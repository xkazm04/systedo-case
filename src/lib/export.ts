/** CSV + client-download helpers shared by the export buttons (dashboard
 *  channel table, AI tool outputs). `toCsv`/`csvNum` are pure; `downloadText`
 *  is browser-only and a no-op on the server. */

import { DEFAULT_LOCALE, LOCALES, type SupportedLocale } from "@/lib/format";

/** A single field escaped for RFC-4180 CSV: wrapped in double quotes with any
 *  embedded quote doubled, whenever it contains a quote, a comma, a newline
 *  (LF **or** CR), or the semicolon `toCsv` uses as its cs-CZ delimiter. Quoting
 *  the union of both delimiters is always RFC-4180-valid, so this one helper is
 *  the single source of truth for CSV cell escaping across the app — it serves
 *  both the semicolon-delimited `toCsv` documents and the comma-delimited
 *  exporters (LTV cohorts, catalog RSA CSV) that import it.
 *
 *  ALSO neutralizes spreadsheet FORMULA INJECTION: a cell whose first character is
 *  `=`, `+`, `-`, `@`, TAB or CR is evaluated as a formula when the CSV is opened in
 *  Excel/Sheets (a live `=…` can trigger DDE / data-exfiltration). AI-generated ad
 *  copy routinely starts that way (`-50 % na vše`, `+420 …`), so prefix a `'` text
 *  guard (Excel/Sheets render it as text, hiding the quote) and force-quote. RFC-4180
 *  delimiter escaping alone does NOT stop this — the app strips the CSV quotes and
 *  still sees the leading `=`. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
export function csvCell(value: string | number): string {
  const s = String(value ?? "");
  const guarded = FORMULA_TRIGGER.test(s) ? `'${s}` : s;
  return FORMULA_TRIGGER.test(s) || /[",\n\r;]/.test(s)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

/** Build a CSV document from a header row + data rows. Uses a semicolon
 *  delimiter — the separator Czech Excel (cs-CZ) expects — and CRLF line ends. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
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
