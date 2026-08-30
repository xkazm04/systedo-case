/** WP S3 — the LIVE Google Ads click-conversion payload: the same rows the CSV
 *  exporter writes, addressed to the API instead of to a download.
 *
 *  THE POINT OF THIS FILE IS THAT IT IS NOT A SECOND FILTER. The dry-run table, the
 *  downloadable CSV and the bytes that actually reach Google must be the same set of
 *  rows, forever — because the operator approves what the dry run showed them, and a
 *  live path that quietly included one more row than the CSV did would be sending
 *  conversions nobody ever looked at. So the gclid/stamp rule is imported from
 *  `google-csv.ts` ({@link pragueStamp}) and the drop rule is written once here in
 *  {@link uploadableRow}, and a unit test pins the two builders row-for-row on the
 *  shared fixture.
 *
 *  WHAT LEAVES THE PRODUCT, exhaustively: the click id, the conversion action's
 *  resource name, the conversion time and — when the ledger knows one — the value and
 *  its currency. No name, no e-mail, no phone, no contact id, no source label. That is
 *  narrower than the CSV (which carries a contact id in the Sklik sheet) and it is the
 *  claim the card makes to the operator in so many words.
 *
 *  Framework-free and pure — no clock read of its own, no store, no network. The POST
 *  lives in the drain step; this only builds. */
import type { ConversionEvent, ConversionKind } from "@/lib/leads/conversion-events";
import type { ClickConversionRow } from "@/lib/google/ads";
import { pragueStamp } from "./google-csv";
import {
  CONVERSION_CURRENCY,
  type ConversionExportFile,
  type ConversionExportOptions,
  type ConversionExporter,
} from "./types";

/** The mapping fields the payload needs — a structural subset of
 *  `ConversionUploadMapping`, declared structurally so this module stays free of the
 *  store-touching one and can be imported anywhere. */
export interface GoogleUploadMapping {
  conversionAction?: { resourceName: string };
  kinds: { qualified: boolean; won: boolean };
}

/** THE row rule, expressed once: a ledger row is uploadable iff it carries a click id
 *  AND a parseable instant. Byte-identical to `buildGoogleConversionCsv`'s filter —
 *  Google matches an offline conversion to a click by GCLID and by nothing else, so a
 *  row without one cannot be uploaded at all, not partially and not "unattributed". */
function uploadableRow(
  e: ConversionEvent,
  conversionAction: string
): ClickConversionRow | null {
  const gclid = e.attribution.gclid?.trim();
  if (!gclid) return null;
  const conversionDateTime = pragueStamp(e.at);
  if (!conversionDateTime) return null;
  return {
    gclid,
    conversionAction,
    conversionDateTime,
    // Omitted, never 0: a conversion of unknown worth and a conversion worth nothing
    // are different claims, and only one of them is true here (conversion-events.ts).
    ...(e.value == null ? {} : { conversionValue: e.value }),
    currencyCode: CONVERSION_CURRENCY,
  };
}

/** Does this mapping send rows of `kind`? */
export function kindIsMapped(mapping: GoogleUploadMapping, kind: ConversionKind): boolean {
  return mapping.kinds[kind] === true;
}

/** The upload payload for `events` under `mapping`. Returns [] when no conversion
 *  action is chosen — a payload addressed to nothing is not a payload, and building
 *  one "to be filled in later" is how an upload ends up in the wrong action. */
export function buildGoogleUploadRows(
  events: readonly ConversionEvent[],
  mapping: GoogleUploadMapping
): ClickConversionRow[] {
  const action = mapping.conversionAction?.resourceName?.trim();
  if (!action) return [];
  const out: ClickConversionRow[] = [];
  for (const e of events) {
    if (!kindIsMapped(mapping, e.kind)) continue;
    const row = uploadableRow(e, action);
    if (row) out.push(row);
  }
  return out;
}

/** How many of `events` the payload had to drop (no click id, or an unparseable
 *  stamp) — the number the card states out loud, exactly as the CSV strip does. */
export function droppedRowCount(
  events: readonly ConversionEvent[],
  mapping: GoogleUploadMapping
): number {
  const considered = events.filter((e) => kindIsMapped(mapping, e.kind)).length;
  return considered - buildGoogleUploadRows(events, mapping).length;
}

/** The registry face (WP W3-C's `ConversionExporter` seam). A live pusher is an
 *  exporter whose built payload is POSTed instead of downloaded, so the strip's
 *  links, the export route and any future queue never learn which it is — the seam's
 *  own header says exactly this, and this is S3 keeping that promise.
 *
 *  `build` is pure and synchronous BY DESIGN (types.ts): it returns the request body
 *  as `body`, and the POST lives in the drain step. `opts.conversionName` carries the
 *  conversion action's RESOURCE NAME on this path — the option already exists to name
 *  the Google-side action, and the resource name is that name's wire form. */
export function buildGoogleUploadFile(
  events: readonly ConversionEvent[],
  opts: ConversionExportOptions
): ConversionExportFile {
  const resourceName = opts.conversionName?.trim() ?? "";
  const mapping: GoogleUploadMapping = {
    ...(resourceName ? { conversionAction: { resourceName } } : {}),
    kinds: { qualified: opts.kind === "qualified", won: opts.kind === "won" },
  };
  const conversions = buildGoogleUploadRows(events, mapping);
  const day = opts.now.toISOString().slice(0, 10);
  const prefix = opts.prefix?.trim() || "adamant";
  return {
    filename: `${prefix}-google-upload-${opts.kind}-${day}.json`,
    mime: "application/json; charset=utf-8",
    body: JSON.stringify({ conversions, partialFailure: true }),
    rows: conversions.length,
    dropped: events.length - conversions.length,
  };
}

export const googleLiveConversionExporter: ConversionExporter = {
  id: "google-live",
  label: "Google Ads — živé nahrání konverzí (API)",
  labelEn: "Google Ads — live conversion upload (API)",
  build: buildGoogleUploadFile,
};
