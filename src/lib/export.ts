/** CSV + client-download helpers shared by the export buttons (dashboard
 *  channel table, AI tool outputs). `toCsv`/`csvNum` are pure; `downloadText`
 *  is browser-only and a no-op on the server. */

import { HOME_MARKET_LOCALE, LOCALES, type SupportedLocale } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";

/** Build a stable CSV filename for a dashboard export. `kind` is the export slug
 *  ("kanaly", "vyvoj"), `periodKey` the window ("90d"). `baseline` is folded in when
 *  the export carries comparison columns, so two exports of the SAME period whose
 *  comparison differs (yoy vs previous) can't collide under one name. The prefix
 *  defaults to the product brand (no baked-in per-client label) but a caller with an
 *  active project can pass its slug. One helper so a rename can never fix one export
 *  and miss the other. */
export function exportFilename(
  kind: string,
  periodKey: string,
  baseline?: string,
  prefix: string = SITE_NAME.toLowerCase()
): string {
  const parts = [prefix, kind, periodKey];
  if (baseline) parts.push(baseline);
  return `${parts.join("-")}.csv`;
}

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
/** A cell that is a PLAIN number — optional sign, digits, an optional single decimal
 *  separator (dot OR the cs-CZ comma), nothing else. Such a value trips FORMULA_TRIGGER
 *  on a leading `+`/`-` yet cannot be a formula payload, so it must stay numeric: the
 *  old apostrophe guard rewrote every negative ("-85000") to text ("'-85000"), which
 *  Excel/Sheets then import as a string and silently drop from sums/pivots. Grouping is
 *  excluded (csvNum disables it), so a thousands space can never smuggle content past
 *  this check. Non-numeric formula copy ("-50 % na vše", "=SUM(A1)", "@cmd") is NOT a
 *  plain number and stays guarded. */
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;
export function csvCell(value: string | number): string {
  const s = String(value ?? "");
  const isNumeric = typeof value === "number" || PLAIN_NUMBER.test(s);
  const needsGuard = !isNumeric && FORMULA_TRIGGER.test(s);
  const guarded = needsGuard ? `'${s}` : s;
  return needsGuard || /[",\n\r;]/.test(s)
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
export function csvNum(n: number, digits = 2, locale: SupportedLocale = HOME_MARKET_LOCALE): string {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat(LOCALES[locale].intlLocale, {
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(n);
}

/** UTF-8 byte-order mark, so Excel renders Czech diacritics in the export.
 *  Written as the escape `\uFEFF` (not a literal U+FEFF, which renders as an
 *  invisible empty string) so the byte is diff-visible and can't be silently
 *  stripped by a formatter or a "this constant is empty, delete it" cleanup. */
const BOM = "\uFEFF";

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
