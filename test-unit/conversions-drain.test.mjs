/** WP S3 — the `conversion-drain` ledger step END TO END over the REAL sqlite stack:
 *  the real `conversion_events` table, the real `project_state` mapping blob, the real
 *  sent-guard claim, the real projects table the tenant join reads.
 *
 *  ONLY the Google edge is faked, and it is faked at the module boundary rather than
 *  by a global monkey-patch, so nothing in this file can reach the network even with
 *  real credentials in the environment. Every assertion here is about the four guards
 *  that stand between a CRM stage move and a double-counted conversion in someone's
 *  Google Ads account:
 *
 *   1. no approval → nothing is sent (and pausing takes the approval away);
 *   2. an accepted row is MARKED, and a second drain sends zero;
 *   3. a rejected row is NOT marked, keeps its retry, and stops after three;
 *   4. a transport throw RELEASES the day's claim so the next hour retries, while a
 *      permanent rejection keeps it so the account is not hammered.
 *
 *  Harness: a temp db keyed by pid + SYSTEDO_DB_FILE + LOCAL_DB set BEFORE the dynamic
 *  imports (the conversion-ledger suite's shape) — never the shared `.data` file. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-conversion-drain-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "test-developer-token";

// The REAL classifier is captured before the module is mocked: the release rule is a
// behaviour of the drain reading a real AdsApiError's status, and a stubbed
// classifier would let the test pass while the production path misclassified.
const realAds = await import("@/lib/google/ads");
const { AdsApiError, classifyLiveError } = realAds;

/** The fake Google. `plan` is consumed one entry per call: an object is the parsed
 *  outcome to return, an Error is thrown. */
const google = { calls: [], plan: [] };
mock.module("@/lib/google/ads", {
  namedExports: {
    AdsApiError,
    classifyLiveError,
    adsConfigured: () => true,
    listConversionActions: async () => [],
    uploadClickConversions: async (token, customerId, rows, opts = {}) => {
      google.calls.push({ token, customerId, rows, opts });
      const next = google.plan.shift();
      if (next instanceof Error) throw next;
      // Default: everything accepted.
      return next ?? { accepted: rows.map((r) => r.gclid), failed: [] };
    },
  },
});
mock.module("@/lib/campaigns/connection", {
  namedExports: { getAdsConnection: async () => ({ customerId: "1234567890", customerName: "Test" }) },
});
mock.module("@/lib/google/token", { namedExports: { getUserAccessToken: async () => "tok" } });

const { runConversionDrain, drainCandidates, markUploadOutcome, CONVERSION_DRAIN_STEP_ID, conversionDrainStep } =
  await import("@/lib/conversions/drain-step");
const { appendConversionEvents, listConversionEvents } = await import("@/lib/leads/conversion-store");
const { createProject } = await import("@/lib/projects/store");
const {
  approveMapping,
  emptyConversionUploadMapping,
  mutateConversionUploadMapping,
  pauseMapping,
  recordDryRun,
  selectConversionAction,
  getConversionUploadMapping,
} = await import("@/lib/conversions/mapping");

const DAY1 = new Date("2026-08-30T09:15:00.000Z");
const DAY2 = new Date("2026-08-31T09:15:00.000Z");
const DAY3 = new Date("2026-09-01T09:15:00.000Z");
const DAY4 = new Date("2026-09-02T09:15:00.000Z");
const ACTION = { resourceName: "customers/1234567890/conversionActions/456", name: "Uzavreny obchod" };

let uid = 0;
/** A real owned project with two uploadable rows and one gclid-less row. */
async function seed(rows = 2) {
  const userId = `u-drain-${++uid}`;
  const project = await createProject(userId, { name: "Drain", type: "leadgen" });
  const events = [];
  for (let i = 0; i < rows; i++) {
    events.push({
      id: `c${i}_won`,
      contactId: `c${i}`,
      kind: "won",
      at: "2026-08-29T09:30:00.000Z",
      sourceLabel: "Google Ads",
      attribution: { source: "google-ads", gclid: `GCL${i}` },
      value: 1000 + i,
    });
  }
  events.push({
    id: "cx_won",
    contactId: "cx",
    kind: "won",
    at: "2026-08-29T09:30:00.000Z",
    sourceLabel: "Doporučení",
    attribution: { source: "referral" }, // no gclid → never uploadable
    value: 500,
  });
  await appendConversionEvents(project.id, events);
  return { userId, projectId: project.id };
}

/** Walk the mapping to `approved` through the real lifecycle + the real store. */
async function approve({ userId, projectId }, now = DAY1) {
  return mutateConversionUploadMapping(userId, projectId, now, (m) => {
    const dry = recordDryRun(selectConversionAction(m, ACTION, now), { rows: 2, validated: true }, now);
    const r = approveMapping(dry, now);
    assert.equal(r.ok, true);
    return r.mapping;
  });
}

/* ── the pure halves ─────────────────────────────────────────────────────────── */

test("drainCandidates: marked rows, unmapped kinds, gclid-less rows and burnt rows are excluded", () => {
  const mapping = { ...emptyConversionUploadMapping(DAY1), conversionAction: ACTION, kinds: { qualified: false, won: true } };
  const rows = [
    { kind: "won", attribution: { gclid: "A" } },
    { kind: "won", attribution: { gclid: "B" }, uploaded: { platform: "google-ads", at: "x", batchId: "b", action: "a" } },
    { kind: "qualified", attribution: { gclid: "C" } },
    { kind: "won", attribution: {} },
    { kind: "won", attribution: { gclid: "E" }, uploadError: { at: "x", message: "m", attempts: 3 } },
    { kind: "won", attribution: { gclid: "F" }, uploadError: { at: "x", message: "m", attempts: 2 } },
  ];
  assert.deepEqual(drainCandidates(rows, mapping).map((r) => r.attribution.gclid), ["A", "F"]);
  assert.equal(drainCandidates(rows, mapping, 1).length, 1, "the batch ceiling is honoured");
});

test("markUploadOutcome: an acceptance marks and clears the old error; a failure NEVER marks", () => {
  const batch = [
    { id: "a", kind: "won", attribution: { gclid: "A" }, uploadError: { at: "old", message: "m", attempts: 1 } },
    { id: "b", kind: "won", attribution: { gclid: "B" }, uploadError: { at: "old", message: "m", attempts: 1 } },
    { id: "c", kind: "won", attribution: { gclid: "C" } },
  ];
  const marked = markUploadOutcome(
    batch,
    { accepted: ["A"], failed: [{ gclid: "B", message: "Too old." }] },
    { at: "2026-08-30T09:15:00.000Z", batchId: "2026-08-30_ab12cd", action: ACTION.resourceName }
  );
  assert.equal(marked.length, 2, "a row Google mentioned in neither list is left untouched");
  assert.deepEqual(marked[0].uploaded, {
    platform: "google-ads",
    at: "2026-08-30T09:15:00.000Z",
    batchId: "2026-08-30_ab12cd",
    action: ACTION.resourceName,
  });
  assert.equal(marked[0].uploadError, undefined, "an accepted row is settled");
  assert.equal(marked[1].uploaded, undefined, "a FAILURE MUST NEVER MARK");
  assert.deepEqual(marked[1].uploadError, { at: "2026-08-30T09:15:00.000Z", message: "Too old.", attempts: 2 });
});

/* ── the authorisation gate ──────────────────────────────────────────────────── */

test("an UN-APPROVED project is never drained, and neither is a PAUSED one", async () => {
  const before = google.calls.length;
  const draft = await seed();
  await mutateConversionUploadMapping(draft.userId, draft.projectId, DAY1, (m) =>
    recordDryRun(selectConversionAction(m, ACTION, DAY1), { rows: 2, validated: true }, DAY1)
  );
  await runConversionDrain(DAY1);
  assert.equal(google.calls.length, before, "a dry-run-only mapping sends NOTHING");

  const paused = await seed();
  await approve(paused);
  await mutateConversionUploadMapping(paused.userId, paused.projectId, DAY1, (m) => pauseMapping(m, DAY1));
  await runConversionDrain(DAY2);
  assert.equal(google.calls.length, before, "pausing stops the next drain dead");

  const rows = await listConversionEvents(paused.projectId);
  assert.ok(rows.every((r) => !r.uploaded), "and nothing was marked either");
});

/* ── the double-upload guarantee ─────────────────────────────────────────────── */

test("accepted rows are MARKED in the same pass, and a second drain sends ZERO", async () => {
  const t = await seed();
  await approve(t);
  const before = google.calls.length;

  const first = await runConversionDrain(DAY1);
  assert.equal(first.ok, true);
  const call = google.calls[before];
  assert.equal(call.customerId, "1234567890");
  assert.equal(call.opts.validateOnly, undefined, "the DRAIN never validates-only");
  assert.deepEqual(
    call.rows.map((r) => r.gclid).sort(),
    ["GCL0", "GCL1"],
    "the gclid-less row was dropped (the ledger reads newest-first, so order is the store's)"
  );
  assert.equal(call.rows[0].conversionAction, ACTION.resourceName);
  assert.equal(call.rows[0].conversionDateTime, "2026-08-29 11:30:00+02:00", "the exporter's ONE stamp format");

  const marked = await listConversionEvents(t.projectId);
  const uploaded = marked.filter((r) => r.uploaded);
  assert.equal(uploaded.length, 2);
  assert.equal(uploaded[0].uploaded.platform, "google-ads");
  assert.match(uploaded[0].uploaded.batchId, /^2026-08-30_[0-9a-z]{6}$/);
  assert.equal(marked.length, 3, "marking UPSERTS — it never mints a second row");
  assert.deepEqual(
    (await listConversionEvents(t.projectId, { uploaded: false })).map((r) => r.id),
    ["cx_won"],
    "the store's uploaded filter now excludes them"
  );

  // Same day: the claim alone stops it.
  await runConversionDrain(DAY1);
  assert.equal(google.calls.length, before + 1, "the daily claim refuses a second tick");

  // A NEW day, so the claim is granted — and STILL nothing is sent, because every
  // row carries its marker. This is the guarantee that survives a lost claim.
  const second = await runConversionDrain(DAY2);
  assert.equal(google.calls.length, before + 1, "a second drain uploads 0");
  assert.equal(second.counts.uploaded, 0);

  const mapping = await getConversionUploadMapping(t.userId, t.projectId);
  assert.equal(mapping.lastDrain.uploaded, 2);
  assert.equal(mapping.lastDrain.failed, 0);
});

/* ── partial failure ─────────────────────────────────────────────────────────── */

test("a partial failure marks ONE row, leaves the other retryable, and stops after 3", async () => {
  const t = await seed();
  await approve(t);
  const before = google.calls.length;

  google.plan.push({ accepted: ["GCL0"], failed: [{ gclid: "GCL1", message: "The click is too old." }] });
  const run = await runConversionDrain(DAY1);
  assert.equal(run.counts.uploaded, 1);
  assert.equal(run.counts.failed, 1);

  const rows = await listConversionEvents(t.projectId);
  const ok = rows.find((r) => r.id === "c0_won");
  const bad = rows.find((r) => r.id === "c1_won");
  assert.ok(ok.uploaded);
  assert.equal(bad.uploaded, undefined, "a rejected row is NOT marked");
  assert.deepEqual(
    { message: bad.uploadError.message, attempts: bad.uploadError.attempts },
    { message: "The click is too old.", attempts: 1 }
  );

  // Next day the retry carries exactly the ONE row that failed.
  google.plan.push({ accepted: [], failed: [{ gclid: "GCL1", message: "Still too old." }] });
  await runConversionDrain(DAY2);
  assert.deepEqual(google.calls[before + 1].rows.map((r) => r.gclid), ["GCL1"]);
  assert.equal((await listConversionEvents(t.projectId)).find((r) => r.id === "c1_won").uploadError.attempts, 2);

  google.plan.push({ accepted: [], failed: [{ gclid: "GCL1", message: "Still too old." }] });
  await runConversionDrain(DAY3);
  assert.equal((await listConversionEvents(t.projectId)).find((r) => r.id === "c1_won").uploadError.attempts, 3);

  // Three strikes: the row is left with its error and is never offered again.
  const after = google.calls.length;
  await runConversionDrain(DAY4);
  assert.equal(google.calls.length, after, "after 3 attempts the row is skipped, not re-sent");
});

/* ── the claim release ───────────────────────────────────────────────────────── */

test("a TRANSPORT throw releases the day's claim; a PERMANENT rejection keeps it", async () => {
  const t = await seed();
  await approve(t);
  const before = google.calls.length;

  // 429 → "backoff" → the batch never landed, so the day is handed back.
  google.plan.push(new AdsApiError(429, "Google Ads uploadClickConversions 429: slow down"));
  const run = await runConversionDrain(DAY1);
  assert.equal(run.ok, true, "one tenant's transport failure never fails the step");
  assert.equal(google.calls.length, before + 1);
  assert.ok((await listConversionEvents(t.projectId)).every((r) => !r.uploaded), "nothing was marked");

  // The SAME day retries, because the claim was released.
  await runConversionDrain(DAY1);
  assert.equal(google.calls.length, before + 2, "the released day is retried within the hour");

  // 403 → "permanent" → the claim is KEPT, so the account is not hammered hourly.
  const p = await seed();
  await approve(p, DAY2);
  const mark = google.calls.length;
  google.plan.push(new AdsApiError(403, "Google Ads uploadClickConversions 403: not authorised"));
  await runConversionDrain(DAY2);
  await runConversionDrain(DAY2);
  assert.equal(google.calls.length, mark + 1, "a permanent rejection is retried tomorrow, not in an hour");
});

/* ── the registry contract ───────────────────────────────────────────────────── */

// NB: the step's REGISTRATION in LEDGER_STEPS is asserted in cron-ledgers.test.mjs,
// not here — importing that registry would pull the campaigns connector, which needs
// the real `@/lib/google/ads` this file deliberately replaces.
test("the step's id and cadence, and the counts shape it reports", async () => {
  assert.equal(CONVERSION_DRAIN_STEP_ID, "conversion-drain");
  assert.ok(!CONVERSION_DRAIN_STEP_ID.includes("/"), "it becomes a Firestore doc id via the sent-guard kind");
  assert.equal(conversionDrainStep.id, CONVERSION_DRAIN_STEP_ID);

  assert.equal(conversionDrainStep.due(DAY1, null), true, "never-run reads as due");
  assert.equal(conversionDrainStep.due(DAY1, "garbage"), true, "an unparseable stamp reads as never-run");
  assert.equal(conversionDrainStep.due(DAY1, new Date(DAY1.getTime() - 60_000).toISOString()), false);
  assert.equal(conversionDrainStep.due(DAY1, new Date(DAY1.getTime() - 3_600_000).toISOString()), true);

  const result = await conversionDrainStep.run({ now: DAY4, startedAt: DAY4 });
  for (const key of ["projects", "uploaded", "failed", "skipped", "claimed"]) {
    assert.equal(typeof result.counts[key], "number", `counts.${key}`);
  }
});
