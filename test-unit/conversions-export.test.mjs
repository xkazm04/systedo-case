/** WP W3-C — the two conversion exporters, BYTE-PINNED, plus the registry seam and
 *  the export route.
 *
 *  Byte-pinned rather than field-asserted because these files are read by MACHINES:
 *  a reordered Google column, a lost `+01:00`, a decimal comma where Google expects
 *  a dot, or a stray guard character in a gclid is a rejected upload, not a cosmetic
 *  diff. The fixture deliberately spans a CET and a CEST event (so DST is pinned in
 *  both directions), a null value, a formula-injection source label, and a row with
 *  NO gclid — the one the Google file must drop and the Sklik sheet must keep. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const { buildGoogleConversionCsv, GOOGLE_CSV_HEADER, pragueStamp } = await import(
  "@/lib/conversions/google-csv"
);
const { buildSklikConversionSheet, SKLIK_SHEET_HEADER } = await import(
  "@/lib/conversions/sklik-sheet"
);
const { CONVERSION_EXPORTERS, conversionExporter } = await import("@/lib/conversions/registry");

const NOW = new Date("2026-08-30T09:15:00.000Z");

const FIXTURE = [
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

/* ── Google Ads offline click conversions ────────────────────────────────────── */

test("Google CSV: the header row is EXACTLY Google's template", () => {
  assert.deepEqual([...GOOGLE_CSV_HEADER], [
    "Google Click ID",
    "Conversion Name",
    "Conversion Time",
    "Conversion Value",
    "Conversion Currency",
  ]);
});

test("Google CSV: byte-pinned body — gclid rows only, DST-correct, blank null value", () => {
  const file = buildGoogleConversionCsv(FIXTURE, { kind: "won", now: NOW });
  assert.equal(
    file.body,
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency\r\n" +
      "GCL-WINTER,Adamant uzavreny obchod,2026-01-15 10:30:00+01:00,48000,CZK\r\n" +
      "GCL+SUMMER,Adamant uzavreny obchod,2026-07-15 11:30:00+02:00,,CZK"
  );
  assert.equal(file.rows, 2);
  assert.equal(file.dropped, 1, "the gclid-less row is DROPPED, and said so out loud");
  assert.equal(file.filename, "adamant-google-konverze-won-2026-08-30.csv");
  assert.equal(file.mime, "text/csv; charset=utf-8");
});

test("Google CSV: an empty ledger is a header-only file, never a fabricated row", () => {
  const file = buildGoogleConversionCsv([], { kind: "qualified", now: NOW });
  assert.equal(file.body, "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency");
  assert.equal(file.rows, 0);
  assert.equal(file.dropped, 0);
  assert.equal(file.filename, "adamant-google-konverze-qualified-2026-08-30.csv");
});

test("pragueStamp: DST from the tz database, not a hardcoded offset", () => {
  assert.equal(pragueStamp("2026-01-15T09:30:00.000Z"), "2026-01-15 10:30:00+01:00");
  assert.equal(pragueStamp("2026-07-15T09:30:00.000Z"), "2026-07-15 11:30:00+02:00");
  assert.equal(pragueStamp("not a date"), "", "an unparseable stamp drops its row");
});

/* ── Sklik hand-mapped sheet ─────────────────────────────────────────────────── */

test("Sklik sheet: Czech UI-mirroring headers, pinned", () => {
  assert.deepEqual([...SKLIK_SHEET_HEADER], [
    "Datum a čas",
    "Typ konverze",
    "Zdroj",
    "Kampaň",
    "ID kliknutí (gclid)",
    "Hodnota",
    "Měna",
    "ID kontaktu",
  ]);
});

test("Sklik sheet: byte-pinned — semicolons, EVERY row, formula guard, blank value", () => {
  const file = buildSklikConversionSheet(FIXTURE, { kind: "won", now: NOW });
  assert.equal(
    file.body,
    "Datum a čas;Typ konverze;Zdroj;Kampaň;ID kliknutí (gclid);Hodnota;Měna;ID kontaktu\r\n" +
      "2026-01-15 09:30;Adamant uzavreny obchod;Google Ads – Brand;Brand;GCL-WINTER;48000;CZK;c1\r\n" +
      '2026-07-15 09:30;Adamant uzavreny obchod;"\'-50 % na vše";;GCL+SUMMER;;;c2\r\n' +
      "2026-07-16 09:30;Adamant uzavreny obchod;Doporučení;;;1200;CZK;c3"
  );
  assert.equal(file.rows, 3, "the gclid-less row is exportable HERE and nowhere else");
  assert.equal(file.dropped, 0);
  assert.equal(file.filename, "adamant-sklik-konverze-won-2026-08-30.csv");
});

test("neither file carries PII", () => {
  const withPii = FIXTURE.map((e) => ({ ...e, sourceLabel: e.sourceLabel }));
  const bodies = [
    buildGoogleConversionCsv(withPii, { kind: "won", now: NOW }).body,
    buildSklikConversionSheet(withPii, { kind: "won", now: NOW }).body,
  ].join("\n");
  for (const pii of ["@", "Novák", "+420"]) {
    assert.ok(!bodies.includes(pii), `"${pii}" must never reach an exported file`);
  }
});

/* ── the registry seam ───────────────────────────────────────────────────────── */

test("registry: both formats registered, unknown ids narrow to null", () => {
  assert.deepEqual(CONVERSION_EXPORTERS.map((e) => e.id), ["google", "sklik"]);
  for (const e of CONVERSION_EXPORTERS) {
    assert.ok(e.label && e.labelEn, "every exporter carries cs + en copy");
    assert.equal(typeof e.build, "function");
  }
  assert.equal(conversionExporter("google")?.id, "google");
  assert.equal(conversionExporter("../../etc"), null);
  assert.equal(conversionExporter(null), null);
});

/* ── the export route ────────────────────────────────────────────────────────── */

const PID = "p1";
let listed = [];
let lastQuery = null;
let guard = { uid: "u1", project: { id: PID, name: "T", type: "leadgen", accentColor: "#fff", createdAt: "x", updatedAt: "x" } };

mock.module("@/lib/projects/api-guard", {
  namedExports: { requireOwnedProject: async () => guard },
});
mock.module("@/lib/leads/conversion-store", {
  namedExports: {
    listConversionEvents: async (_p, query) => {
      lastQuery = query;
      return listed;
    },
  },
});

const { GET } = await import("@/app/api/projects/[id]/conversions/export/route");
const params = Promise.resolve({ id: PID });
const call = (qs) => GET(new Request(`https://x.test/api/projects/${PID}/conversions/export?${qs}`), { params });

test("route: serves an attachment and threads format / kind / days", async () => {
  listed = FIXTURE;
  const res = await call("format=google&kind=won&days=7");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.match(
    res.headers.get("Content-Disposition"),
    /^attachment; filename="adamant-google-konverze-won-\d{4}-\d{2}-\d{2}\.csv"$/
  );
  assert.equal(res.headers.get("X-Adamant-Rows"), "2");
  assert.equal(res.headers.get("X-Adamant-Dropped"), "1");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(lastQuery.kind, "won");
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(lastQuery.sinceDay));
  const body = await res.text();
  assert.ok(body.startsWith("Google Click ID,"));
});

test("route: unknown format / kind are 400; days is clamped, never trusted", async () => {
  listed = [];
  assert.equal((await call("format=hotdog&kind=won")).status, 400);
  assert.equal((await call("format=google&kind=maybe")).status, 400);
  await call("format=sklik&days=99999");
  assert.equal(lastQuery.kind, "won", "kind defaults to the money outcome");
  await call("format=sklik&days=-4");
  assert.ok(lastQuery.sinceDay <= new Date().toISOString().slice(0, 10));
});

test("route: a project that is not the caller's never yields a file", async () => {
  guard = { error: new Response(JSON.stringify({ ok: false, error: "Projekt nenalezen." }), { status: 404 }) };
  const res = await call("format=google&kind=won");
  assert.equal(res.status, 404);
  guard = { uid: "u1", project: { id: PID, name: "T", type: "leadgen", accentColor: "#fff", createdAt: "x", updatedAt: "x" } };
});
