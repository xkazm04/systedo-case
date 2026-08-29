/** Sklik (Seznam) conversion sheet — a HAND-MAPPABLE import sheet, not a guessed
 *  machine contract.
 *
 *  IMPORT FORMAT CAVEAT (the `src/lib/sklik-export.ts` posture, verbatim in intent):
 *  Sklik's offline-conversion import column spec is not published in a form that can
 *  be verified offline. Rather than invent one and let an operator discover the
 *  guess by having their upload rejected, this exporter produces a sheet whose Czech
 *  headers mirror the Sklik web UI so the columns can be mapped by hand in one pass.
 *  If Seznam later publishes a machine spec, only this file changes and the Google
 *  export stays byte-identical.
 *
 *  WHY IT KEEPS THE GCLID-LESS ROWS. The Google file can only carry rows with a
 *  Google click id. This one carries EVERY conversion, because a hand-mapped sheet
 *  can be matched on whatever identifier the operator actually has (Sklik's own
 *  click id, a campaign + date pair, or nothing at all — a manual conversion entry).
 *  So a lead with no click id is exportable HERE and nowhere else, which is exactly
 *  what the Kvalita leadů strip tells the operator.
 *
 *  FORMAT. Semicolon-delimited with CRLF line ends via the shared `toCsv` — the
 *  cs-CZ Excel convention, because this file is opened by a human before it is
 *  uploaded by anyone. Framework-free and pure. */
import { toCsv } from "@/lib/export";
import type { ConversionEvent } from "@/lib/leads/conversion-events";
import {
  CONVERSION_ACTION_NAMES,
  CONVERSION_CURRENCY,
  type ConversionExportFile,
  type ConversionExportOptions,
  type ConversionExporter,
} from "./types";

/** Czech headers mirroring the Sklik UI's own vocabulary (Datum a čas / Zdroj /
 *  Kampaň / Hodnota / Měna), plus the two identifiers a mapping can key on. Pinned
 *  in a unit test — a renamed column silently breaks a mapping the operator built. */
export const SKLIK_SHEET_HEADER = [
  "Datum a čas",
  "Typ konverze",
  "Zdroj",
  "Kampaň",
  "ID kliknutí (gclid)",
  "Hodnota",
  "Měna",
  "ID kontaktu",
] as const;

/** `YYYY-MM-DD HH:MM` in UTC — the sheet is read by a person, so the seconds are
 *  noise; the Google file is the one that needs a machine-exact stamp. */
function sheetStamp(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

export function buildSklikConversionSheet(
  events: readonly ConversionEvent[],
  opts: ConversionExportOptions
): ConversionExportFile {
  const name = CONVERSION_ACTION_NAMES[opts.kind];
  const rows = events.map((e): (string | number)[] => [
    sheetStamp(e.at),
    name,
    e.sourceLabel,
    e.attribution.campaign ?? "",
    e.attribution.gclid ?? "",
    // Blank, never 0 — an unknown value and a worthless conversion are different
    // facts, and a hand-mapped sheet must not assert the second.
    e.value == null ? "" : e.value,
    e.value == null ? "" : CONVERSION_CURRENCY,
    // The contact id is an OPAQUE internal key, deliberately the only per-person
    // column: it lets the operator trace a row back inside Adamant without any
    // name, e-mail or phone number leaving the product in a file.
    e.contactId,
  ]);
  const day = opts.now.toISOString().slice(0, 10);
  const prefix = opts.prefix?.trim() || "adamant";
  return {
    filename: `${prefix}-sklik-konverze-${opts.kind}-${day}.csv`,
    mime: "text/csv; charset=utf-8",
    body: toCsv([...SKLIK_SHEET_HEADER], rows),
    rows: rows.length,
    dropped: 0,
  };
}

export const sklikConversionExporter: ConversionExporter = {
  id: "sklik",
  label: "Sklik — ruční mapovací tabulka (CSV)",
  labelEn: "Sklik — hand-mapped sheet (CSV)",
  build: buildSklikConversionSheet,
};
