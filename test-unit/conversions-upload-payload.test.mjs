/** WP S3 — the LIVE upload's payload and its response parsing, BYTE-PINNED.
 *
 *  Byte-pinned for the same reason the CSV is: these bytes are read by a machine that
 *  counts money, and a renamed field or a lost `+02:00` is a wrong conversion, not a
 *  cosmetic diff. Two things are pinned that the CSV suite cannot pin at all:
 *
 *   • the REQUEST BODY, exactly — including `partialFailure: true`, which is what
 *     makes per-row acceptance possible in the first place, and the absence of
 *     `validateOnly` on the send path;
 *   • the ACCEPTANCE RULE — which rows a `200` with a partial-failure block means we
 *     may mark as uploaded. Getting that backwards is the double-count.
 *
 *  NO NETWORK. `fetchImpl` is injected on every call; nothing here can reach Google
 *  even if the environment holds real credentials. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURE, csvRowTriples } from "./fixtures/conversion-events.mjs";

const { buildGoogleConversionCsv } = await import("@/lib/conversions/google-csv");
const { buildGoogleUploadRows, buildGoogleUploadFile, droppedRowCount } = await import(
  "@/lib/conversions/google-upload"
);
const { uploadClickConversions, parseClickConversionResponse, AdsApiError } = await import(
  "@/lib/google/ads"
);
const { CONVERSION_EXPORTERS, conversionExporter } = await import("@/lib/conversions/registry");

const NOW = new Date("2026-08-30T09:15:00.000Z");
const ACTION = "customers/1234567890/conversionActions/456";
const MAPPING = { conversionAction: { resourceName: ACTION }, kinds: { qualified: true, won: true } };

/** A fetch stand-in that records the one request it was given and answers `body`. */
function captureFetch(body, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { impl, calls };
}

/* ── the payload IS the CSV's rows ───────────────────────────────────────────── */

test("payload rows deep-equal the CSV's rows for the shared fixture", () => {
  const rows = buildGoogleUploadRows(FIXTURE, MAPPING);
  const csv = buildGoogleConversionCsv(FIXTURE, { kind: "won", now: NOW });

  assert.equal(rows.length, csv.rows, "the two builders agree on how many rows exist");
  assert.equal(droppedRowCount(FIXTURE, MAPPING), csv.dropped, "and on how many were dropped");
  assert.deepEqual(
    rows.map((r) => [r.gclid, r.conversionDateTime, r.conversionValue == null ? "" : String(r.conversionValue)]),
    csvRowTriples(csv.body),
    "gclid, stamp and value are identical — one filter, one clock, two destinations"
  );
});

test("the payload is exactly the five permitted fields, and drops the gclid-less row", () => {
  assert.deepEqual(buildGoogleUploadRows(FIXTURE, MAPPING), [
    {
      gclid: "GCL-WINTER",
      conversionAction: ACTION,
      conversionDateTime: "2026-01-15 10:30:00+01:00",
      conversionValue: 48000,
      currencyCode: "CZK",
    },
    {
      // No conversionValue key AT ALL — a blank is "unknown", a 0 would be a claim.
      gclid: "GCL+SUMMER",
      conversionAction: ACTION,
      conversionDateTime: "2026-07-15 11:30:00+02:00",
      currencyCode: "CZK",
    },
  ]);
  const wire = JSON.stringify(buildGoogleUploadRows(FIXTURE, MAPPING));
  for (const leak of ["c1", "Doporučení", "referral", "sourceLabel", "contactId"]) {
    assert.ok(!wire.includes(leak), `"${leak}" must never reach Google`);
  }
});

test("the kind filter and the missing action are both honoured", () => {
  const wonOnly = buildGoogleUploadRows(FIXTURE, {
    conversionAction: { resourceName: ACTION },
    kinds: { qualified: true, won: false },
  });
  assert.deepEqual(wonOnly, [], "the whole fixture is `won`, so a won-less mapping sends nothing");
  assert.deepEqual(
    buildGoogleUploadRows(FIXTURE, { kinds: { qualified: true, won: true } }),
    [],
    "a payload addressed to no conversion action is not a payload"
  );
});

test("the registry carries the live pusher beside the two file formats", () => {
  assert.deepEqual(CONVERSION_EXPORTERS.map((e) => e.id), ["google", "sklik", "google-live"]);
  assert.equal(conversionExporter("google-live")?.id, "google-live");
  const file = buildGoogleUploadFile(FIXTURE, { kind: "won", now: NOW, conversionName: ACTION });
  assert.equal(file.mime, "application/json; charset=utf-8");
  assert.equal(file.rows, 2);
  assert.deepEqual(JSON.parse(file.body).conversions, buildGoogleUploadRows(FIXTURE, MAPPING));
  assert.equal(JSON.parse(file.body).partialFailure, true);
});

/* ── the request on the wire ─────────────────────────────────────────────────── */

test("uploadClickConversions: the request body is EXACTLY this", async () => {
  const rows = buildGoogleUploadRows(FIXTURE, MAPPING);
  const { impl, calls } = captureFetch({ results: [{ gclid: "GCL-WINTER" }, { gclid: "GCL+SUMMER" }] });
  const outcome = await uploadClickConversions("tok", "123-456-7890", rows, { fetchImpl: impl });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://googleads.googleapis.com/v18/customers/1234567890:uploadClickConversions",
    "the customer id is normalised to digits; the version matches ADS_API_BASE"
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.equal(
    calls[0].init.body,
    '{"conversions":[' +
      '{"gclid":"GCL-WINTER","conversionAction":"customers/1234567890/conversionActions/456",' +
      '"conversionDateTime":"2026-01-15 10:30:00+01:00","conversionValue":48000,"currencyCode":"CZK"},' +
      '{"gclid":"GCL+SUMMER","conversionAction":"customers/1234567890/conversionActions/456",' +
      '"conversionDateTime":"2026-07-15 11:30:00+02:00","currencyCode":"CZK"}' +
      '],"partialFailure":true}'
  );
  assert.ok(!calls[0].init.body.includes("validateOnly"), "the SEND path never validates-only");
  assert.deepEqual(outcome, { accepted: ["GCL-WINTER", "GCL+SUMMER"], failed: [] });
});

test("validateOnly rides the same body, and an empty batch never leaves the process", async () => {
  const { impl, calls } = captureFetch({ results: [{}, {}] });
  await uploadClickConversions("tok", "1234567890", buildGoogleUploadRows(FIXTURE, MAPPING), {
    fetchImpl: impl,
    validateOnly: true,
  });
  assert.ok(calls[0].init.body.endsWith('"partialFailure":true,"validateOnly":true}'));

  const empty = captureFetch({ results: [] });
  assert.deepEqual(await uploadClickConversions("tok", "1", [], { fetchImpl: empty.impl }), {
    accepted: [],
    failed: [],
  });
  assert.equal(empty.calls.length, 0, "an empty batch is not a round trip");
});

test("a non-OK response throws AdsApiError carrying the status (the module invariant)", async () => {
  const { impl } = captureFetch({ error: "nope" }, 429);
  await assert.rejects(
    () => uploadClickConversions("tok", "1", buildGoogleUploadRows(FIXTURE, MAPPING), { fetchImpl: impl }),
    (err) => {
      assert.ok(err instanceof AdsApiError);
      assert.equal(err.status, 429, "classifyLiveError reads .status — a plain Error would be 'permanent'");
      return true;
    }
  );
});

/* ── the acceptance rule ─────────────────────────────────────────────────────── */

const ROWS = [
  { gclid: "A", conversionAction: ACTION, conversionDateTime: "t", currencyCode: "CZK" },
  { gclid: "B", conversionAction: ACTION, conversionDateTime: "t", currencyCode: "CZK" },
  { gclid: "C", conversionAction: ACTION, conversionDateTime: "t", currencyCode: "CZK" },
];

const failureAt = (index, message) => ({
  partialFailureError: {
    details: [
      { errors: [{ message, location: { fieldPathElements: [{ fieldName: "conversions", index }] } }] },
    ],
  },
});

test("a row is accepted iff it has a result AND no partial-failure names its index", () => {
  const res = {
    results: [{ gclid: "A" }, {}, { gclid: "C" }],
    ...failureAt(1, "The click is too old."),
  };
  assert.deepEqual(parseClickConversionResponse(ROWS, res), {
    accepted: ["A", "C"],
    failed: [{ gclid: "B", message: "The click is too old." }],
  });
});

test("an EMPTY result object is a rejection, not an acceptance", () => {
  // Google aligns `results` positionally and leaves a rejected row's entry empty. A
  // parser that only counted array length would mark this row uploaded and lose the
  // conversion forever.
  assert.deepEqual(parseClickConversionResponse(ROWS, { results: [{ gclid: "A" }, {}, null] }), {
    accepted: ["A"],
    failed: [
      { gclid: "B", message: "Google conversion upload: row rejected without a stated reason" },
      { gclid: "C", message: "Google conversion upload: row rejected without a stated reason" },
    ],
  });
});

test("a named failure beats a present result, and a short/absent results array fails safe", () => {
  // Belt and braces: even if Google were to return a filled result for a row it also
  // named as failed, the conservative reading wins.
  const contradictory = { results: [{ gclid: "A" }, { gclid: "B" }, { gclid: "C" }], ...failureAt(2, "Bad gclid.") };
  assert.deepEqual(parseClickConversionResponse(ROWS, contradictory).accepted, ["A", "B"]);

  // Nothing is marked when Google said nothing — three retryable rows, zero lost.
  const nothing = parseClickConversionResponse(ROWS, {});
  assert.deepEqual(nothing.accepted, []);
  assert.equal(nothing.failed.length, 3);
});

test("an error with no row index is dropped rather than blamed on row 0", () => {
  const res = {
    results: [{ gclid: "A" }, { gclid: "B" }, { gclid: "C" }],
    partialFailureError: { message: "something", details: [{ errors: [{ message: "no location" }] }] },
  };
  assert.deepEqual(parseClickConversionResponse(ROWS, res).accepted, ["A", "B", "C"]);
});

test("the `operations[i]` field path is understood too, and a blank message falls back", () => {
  const res = {
    results: [{ gclid: "A" }, {}, { gclid: "C" }],
    partialFailureError: {
      details: [
        { errors: [{ message: "  ", location: { fieldPathElements: [{ fieldName: "operations", index: 1 }] } }] },
      ],
    },
  };
  assert.deepEqual(parseClickConversionResponse(ROWS, res).failed, [
    { gclid: "B", message: "Google conversion upload: row rejected without a stated reason" },
  ]);
});
