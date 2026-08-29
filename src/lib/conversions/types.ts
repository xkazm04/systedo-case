/** WP W3-C — the CONNECTOR SEAM for getting conversions out of Adamant.
 *
 *  Today there are two implementations and both are FILES: a Google Ads offline
 *  click-conversion CSV and a hand-mappable Sklik sheet. The live API push (WP S3)
 *  is deliberately not here — uploading a conversion is irreversible and
 *  double-countable, so it needs a change-set approval and a dry run first. What
 *  matters is that S3 implements THIS interface: a live pusher is another
 *  `ConversionExporter` whose `build` result is posted instead of downloaded, so the
 *  call sites (the strip's links, a future queue) never learn which it is.
 *
 *  Framework-free and pure — no clock read of its own, no store, no React. Every
 *  exporter is a total function of (events, options), which is what makes both
 *  formats byte-pinnable in a unit test. */
import type { ConversionEvent, ConversionKind } from "@/lib/leads/conversion-events";

export interface ConversionExportOptions {
  /** which ledger kind this file carries — part of the filename and, for Google, of
   *  the conversion-action name the operator must have created in their account */
  kind: ConversionKind;
  /** the instant the export was produced (filenames + "generated at" notes) */
  now: Date;
  /** filename prefix; defaults to the product slug so no client label is baked in */
  prefix?: string;
  /** override the Google conversion-action name (must match the account's action) */
  conversionName?: string;
}

export interface ConversionExportFile {
  filename: string;
  mime: string;
  body: string;
  /** rows actually written — less than `events.length` whenever the format drops
   *  rows it cannot honestly carry (Google: no gclid, no upload) */
  rows: number;
  /** rows the format had to drop, so the caller can say so out loud */
  dropped: number;
}

export interface ConversionExporter {
  id: string;
  /** cs label (the UI's source locale) */
  label: string;
  /** en label */
  labelEn: string;
  build(events: readonly ConversionEvent[], opts: ConversionExportOptions): ConversionExportFile;
}

/** Czech conversion-action names, mirrored in both formats so the two files describe
 *  the same two facts. ASCII-safe on purpose: they end up in a Google Ads account's
 *  conversion-action name, which the operator has to retype exactly. */
export const CONVERSION_ACTION_NAMES: Record<ConversionKind, string> = {
  qualified: "Adamant kvalifikovany lead",
  won: "Adamant uzavreny obchod",
};

/** The currency every value cell is denominated in. The lead layer stores CZK and
 *  nothing converts — a multi-currency ledger would need a rate at the conversion
 *  instant, which nothing here records. */
export const CONVERSION_CURRENCY = "CZK";
