/** THE registration point for conversion exporters. A new destination is one entry
 *  here and the export route, the strip's links and any future queue pick it up —
 *  the delete-cascade / ledger-step registration style.
 *
 *  WP S3 (live Google click-conversion upload + Sklik import) registers HERE too:
 *  a live pusher is a `ConversionExporter` whose built payload is POSTed instead of
 *  downloaded, so nothing above this line learns which it is. Framework-free. */
import { googleConversionExporter } from "./google-csv";
import { sklikConversionExporter } from "./sklik-sheet";
import type { ConversionExporter } from "./types";

export const CONVERSION_EXPORTERS: readonly ConversionExporter[] = [
  googleConversionExporter,
  sklikConversionExporter,
];

/** The exporter for a wire-supplied format id, or null when it is not one. Narrowing
 *  an untrusted query param happens HERE, once. */
export function conversionExporter(id: string | null | undefined): ConversionExporter | null {
  if (!id) return null;
  return CONVERSION_EXPORTERS.find((e) => e.id === id) ?? null;
}

export { CONVERSION_ACTION_NAMES, CONVERSION_CURRENCY } from "./types";
export type { ConversionExportFile, ConversionExportOptions, ConversionExporter } from "./types";
