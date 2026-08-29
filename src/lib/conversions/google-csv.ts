/** Google Ads OFFLINE CLICK CONVERSIONS — the CSV Google Ads accepts under
 *  Tools → Conversions → Uploads ("Upload conversions from clicks").
 *
 *  THE ONE HONEST CONSTRAINT: Google matches an offline conversion to a click by
 *  GCLID. A conversion row without one cannot be uploaded at all — not partially,
 *  not "unattributed". So this exporter emits GCLID ROWS ONLY and reports how many
 *  it had to drop, and the Kvalita leadů strip says the number out loud. Silently
 *  writing a file that contains a third of the operator's conversions would be the
 *  dishonest alternative: they would upload it, see a small number, and conclude the
 *  ledger is broken rather than that their import is missing a `gclid` column.
 *
 *  FORMAT. Comma-delimited with the English header row Google's template uses
 *  (a cs-Excel semicolon file is rejected by the importer), CRLF line ends, every
 *  cell through the shared `csvCell` escaper — which is also the FORMULA-INJECTION
 *  guard: a source label like "-50 % na vše" would otherwise be evaluated as a
 *  formula when the operator opens the file in Excel before uploading it.
 *
 *  TIME ZONE. Google reads the conversion time in the account's own zone unless the
 *  cell carries an offset, so every stamp carries one — computed for the EVENT's
 *  instant, not for "now", so a conversion from January (+01:00) and one from July
 *  (+02:00) are both correct rather than uniformly shifted by an hour of DST.
 *
 *  VALUE. Blank when the ledger does not know one. A blank is "no value supplied";
 *  a 0 would tell Google the conversion was worth nothing, which is a different and
 *  false claim (see conversion-events.ts).
 *
 *  Framework-free and pure. */
import { csvCell } from "@/lib/export";
import type { ConversionEvent } from "@/lib/leads/conversion-events";
import {
  CONVERSION_ACTION_NAMES,
  CONVERSION_CURRENCY,
  type ConversionExportFile,
  type ConversionExportOptions,
  type ConversionExporter,
} from "./types";

/** The header row, EXACTLY as Google's template names the columns. Pinned in a unit
 *  test — a reordered or renamed column is a rejected upload, not a cosmetic diff. */
export const GOOGLE_CSV_HEADER = [
  "Google Click ID",
  "Conversion Name",
  "Conversion Time",
  "Conversion Value",
  "Conversion Currency",
] as const;

const PRAGUE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** `YYYY-MM-DD HH:MM:SS±HH:MM` in Europe/Prague, for the instant `iso` names. The
 *  offset is DERIVED by re-parsing the localised wall clock as UTC and differencing
 *  it against the real instant, so DST is handled by the platform's tz database
 *  rather than a hardcoded +01:00. Returns "" for an unparseable stamp (the row is
 *  then dropped). */
export function pragueStamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const parts: Record<string, string> = {};
  for (const p of PRAGUE_PARTS.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const wall = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`;
  const offsetMin = Math.round((Date.parse(wall) - d.getTime()) / 60_000);
  if (!Number.isFinite(offsetMin)) return "";
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
}

export function buildGoogleConversionCsv(
  events: readonly ConversionEvent[],
  opts: ConversionExportOptions
): ConversionExportFile {
  const name = opts.conversionName?.trim() || CONVERSION_ACTION_NAMES[opts.kind];
  const lines: string[] = [GOOGLE_CSV_HEADER.map((h) => csvCell(h)).join(",")];
  let rows = 0;
  for (const e of events) {
    const gclid = e.attribution.gclid?.trim();
    const at = gclid ? pragueStamp(e.at) : "";
    if (!gclid || !at) continue;
    lines.push(
      [
        csvCell(gclid),
        csvCell(name),
        csvCell(at),
        csvCell(e.value == null ? "" : e.value),
        csvCell(CONVERSION_CURRENCY),
      ].join(",")
    );
    rows += 1;
  }
  const day = opts.now.toISOString().slice(0, 10);
  const prefix = opts.prefix?.trim() || "adamant";
  return {
    filename: `${prefix}-google-konverze-${opts.kind}-${day}.csv`,
    mime: "text/csv; charset=utf-8",
    body: lines.join("\r\n"),
    rows,
    dropped: events.length - rows,
  };
}

export const googleConversionExporter: ConversionExporter = {
  id: "google",
  label: "Google Ads — offline konverze (CSV)",
  labelEn: "Google Ads — offline conversions (CSV)",
  build: buildGoogleConversionCsv,
};
