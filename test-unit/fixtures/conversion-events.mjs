/** THE shared conversion-ledger fixture.
 *
 *  It was born inline in `conversions-export.test.mjs` and is lifted here by WP S3 so
 *  the CSV exporter and the LIVE upload builder are pinned against the SAME rows —
 *  literally the same object, not a copy that could drift. That is the whole point of
 *  the equivalence assertion: the dry-run table, the downloadable CSV and the bytes
 *  that reach Google must never disagree about which conversions exist, and two
 *  fixtures maintained side by side would eventually let them.
 *
 *  It deliberately spans a CET and a CEST event (so DST is pinned in both
 *  directions), a null value, a formula-injection source label, and a row with NO
 *  gclid — the one the Google paths must drop and the Sklik sheet must keep. */
export const FIXTURE = [
  {
    id: "c1_won",
    contactId: "c1",
    kind: "won",
    at: "2026-01-15T09:30:00.000Z", // CET  → +01:00
    sourceLabel: "Google Ads – Brand",
    attribution: { source: "google-ads", campaign: "Brand", gclid: "GCL-WINTER" },
    value: 48000,
    connectorId: "csv",
  },
  {
    id: "c2_won",
    contactId: "c2",
    kind: "won",
    at: "2026-07-15T09:30:00.000Z", // CEST → +02:00
    sourceLabel: "-50 % na vše", // a formula-injection payload
    attribution: { source: "sklik", gclid: "GCL+SUMMER" },
    value: null, // unknown, NOT zero
  },
  {
    id: "c3_won",
    contactId: "c3",
    kind: "won",
    at: "2026-07-16T09:30:00.000Z",
    sourceLabel: "Doporučení",
    attribution: { source: "referral" }, // no gclid → not uploadable to Google
    value: 1200,
  },
];

/** The Google CSV's data rows, parsed back into `[gclid, time, value]` triples — the
 *  projection the live payload is compared against. Trivially safe to split on commas:
 *  the fixture's uploadable cells contain none (the one comma-bearing label belongs to
 *  the row the Google format drops). */
export function csvRowTriples(body) {
  return body
    .split("\r\n")
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [gclid, , time, value] = line.split(",");
      return [gclid, time, value];
    });
}
