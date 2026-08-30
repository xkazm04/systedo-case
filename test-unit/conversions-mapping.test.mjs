/** WP S3 — the conversion-upload MAPPING's lifecycle, pinned.
 *
 *  This is the authorisation an irreversible upload rests on, so the assertions here
 *  are deliberately about REFUSALS rather than about the happy path: approve without
 *  a dry run, approve on a dry run older than 24 h, approve with no action, approve
 *  with no kinds — every one of them must be refused with a reason, because each is a
 *  way an operator could end up having authorised rows they never looked at. */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  approveMapping,
  DRY_RUN_MAX_AGE_MS,
  emptyConversionUploadMapping,
  isDrainEligible,
  isDryRunFresh,
  mappedKinds,
  pauseMapping,
  recordDrain,
  recordDryRun,
  sanitizeConversionUploadMapping,
  selectConversionAction,
  setConversionKinds,
} = await import("@/lib/conversions/mapping");

const NOW = new Date("2026-08-30T09:15:00.000Z");
const ACTION = { resourceName: "customers/123/conversionActions/456", name: "Adamant uzavreny obchod" };
const OTHER = { resourceName: "customers/123/conversionActions/999", name: "Jina akce" };

const chosen = (now = NOW) => selectConversionAction(emptyConversionUploadMapping(now), ACTION, now);
const dryRun = (now = NOW, rows = 2) => recordDryRun(chosen(now), { rows, validated: true }, now);

/* ── the shape a fresh mapping starts in ─────────────────────────────────────── */

test("a fresh mapping is a DRAFT that authorises nothing", () => {
  const m = emptyConversionUploadMapping(NOW);
  assert.equal(m.status, "draft");
  assert.equal(m.conversionAction, undefined);
  assert.deepEqual(m.kinds, { qualified: true, won: true });
  assert.equal(m.updatedAt, NOW.toISOString());
  assert.equal(isDrainEligible(m), false, "pre-selected kinds are NOT an authorisation");
  assert.equal(isDrainEligible(null), false);
});

/* ── the refusals ────────────────────────────────────────────────────────────── */

test("approve is REFUSED without an action, without kinds, and without a dry run", () => {
  assert.deepEqual(approveMapping(emptyConversionUploadMapping(NOW), NOW), {
    ok: false,
    reason: "no-action",
  });

  const noKinds = setConversionKinds(chosen(), { qualified: false, won: false }, NOW);
  assert.deepEqual(approveMapping(noKinds, NOW), { ok: false, reason: "no-kinds" });

  assert.deepEqual(approveMapping(chosen(), NOW), { ok: false, reason: "no-dry-run" });
});

test("approve is REFUSED on a dry run older than 24 h — and on one from the future", () => {
  const old = new Date(NOW.getTime() - DRY_RUN_MAX_AGE_MS - 1_000);
  const stale = { ...dryRun(old), status: "dry-run" };
  assert.deepEqual(approveMapping(stale, NOW), { ok: false, reason: "stale-dry-run" });
  assert.equal(isDryRunFresh(stale, NOW), false);

  // Exactly at the boundary is still evidence.
  const edge = { ...dryRun(new Date(NOW.getTime() - DRY_RUN_MAX_AGE_MS)), status: "dry-run" };
  assert.equal(isDryRunFresh(edge, NOW), true);
  assert.equal(approveMapping(edge, NOW).ok, true);

  // Clock skew: a stamp from the future is not evidence either.
  const future = { ...dryRun(new Date(NOW.getTime() + 60_000)), status: "dry-run" };
  assert.equal(isDryRunFresh(future, NOW), false);
  assert.equal(isDryRunFresh({ ...chosen(), dryRunAt: "not a date" }, NOW), false);
});

/* ── the happy path, and what it freezes ─────────────────────────────────────── */

test("dry-run then approve → approved, and the drain becomes eligible", () => {
  const d = dryRun();
  assert.equal(d.status, "dry-run");
  assert.equal(d.dryRunRows, 2);
  assert.equal(d.dryRunValidated, true);
  assert.equal(isDrainEligible(d), false, "a dry run alone still sends nothing");

  const r = approveMapping(d, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.mapping.status, "approved");
  assert.equal(r.mapping.approvedAt, NOW.toISOString());
  assert.equal(isDrainEligible(r.mapping), true);
  assert.deepEqual(mappedKinds(r.mapping), ["qualified", "won"]);
});

test("changing the ACTION after approval throws the mapping back to draft", () => {
  const approved = approveMapping(dryRun(), NOW).mapping;
  const later = new Date("2026-08-30T10:00:00.000Z");
  const moved = selectConversionAction(approved, OTHER, later);
  assert.equal(moved.status, "draft");
  assert.equal(moved.dryRunAt, undefined, "the dry run was for the OLD action");
  assert.equal(moved.approvedAt, undefined);
  assert.equal(isDrainEligible(moved), false);
  assert.deepEqual(approveMapping(moved, later), { ok: false, reason: "no-dry-run" });

  // Re-selecting the SAME action is a no-op: an idempotent client save must not
  // silently un-approve a live mapping.
  assert.equal(selectConversionAction(approved, ACTION, later), approved);
});

test("changing the KINDS after approval throws it back to draft too", () => {
  const approved = approveMapping(dryRun(), NOW).mapping;
  const narrowed = setConversionKinds(approved, { qualified: false, won: true }, NOW);
  assert.equal(narrowed.status, "draft");
  assert.deepEqual(narrowed.kinds, { qualified: false, won: true });
  assert.deepEqual(mappedKinds(narrowed), ["won"]);
  // An unchanged set is a no-op.
  assert.equal(setConversionKinds(approved, { qualified: true, won: true }, NOW), approved);
});

/* ── pause / resume ──────────────────────────────────────────────────────────── */

test("pause stops the drain; resuming goes back through the SAME approve gate", () => {
  const approved = approveMapping(dryRun(), NOW).mapping;
  const paused = pauseMapping(approved, NOW);
  assert.equal(paused.status, "paused");
  assert.equal(isDrainEligible(paused), false, "a paused mapping sends nothing");
  assert.equal(paused.dryRunAt, NOW.toISOString(), "the dry run survives a pause");

  // Same day → the dry run is still fresh, so resuming is allowed.
  const resumed = approveMapping(paused, NOW);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.mapping.pausedAt, undefined);
  assert.equal(isDrainEligible(resumed.mapping), true);

  // A week later → the dry run is not evidence any more, so it must be re-run.
  const week = new Date(NOW.getTime() + 7 * 86_400_000);
  assert.deepEqual(approveMapping(paused, week), { ok: false, reason: "stale-dry-run" });
});

test("recordDryRun on a LIVE mapping is inspection, not a downgrade", () => {
  const approved = approveMapping(dryRun(), NOW).mapping;
  const again = recordDryRun(approved, { rows: 7, validated: null }, NOW);
  assert.equal(again.status, "approved");
  assert.equal(again.dryRunRows, 7);
  assert.equal(again.dryRunValidated, null);
});

test("recordDrain writes the tally and never touches the status", () => {
  const approved = approveMapping(dryRun(), NOW).mapping;
  const after = recordDrain(approved, { uploaded: 5, failed: 1, batchId: "2026-08-30_ab12cd" }, NOW);
  assert.equal(after.status, "approved");
  assert.deepEqual(after.lastDrain, {
    at: NOW.toISOString(),
    uploaded: 5,
    failed: 1,
    batchId: "2026-08-30_ab12cd",
  });
});

/* ── the blob as it comes back off disk ──────────────────────────────────────── */

test("sanitize: a corrupt or unknown blob is never read as an approval", () => {
  assert.equal(sanitizeConversionUploadMapping(null), null);
  assert.equal(sanitizeConversionUploadMapping("approved"), null);
  assert.equal(sanitizeConversionUploadMapping({ status: "live" }), null, "an unknown status is not a status");
  // An "approved" blob whose action went missing reads back as the draft it is.
  const orphan = sanitizeConversionUploadMapping({ status: "approved", kinds: { won: true } });
  assert.equal(orphan.status, "draft");
  assert.equal(isDrainEligible(orphan), false);
});

test("sanitize round-trips a real record and coerces the numbers", () => {
  const approved = approveMapping(dryRun(), NOW).mapping;
  const withDrain = recordDrain(approved, { uploaded: 3, failed: 0, batchId: "b1" }, NOW);
  assert.deepEqual(sanitizeConversionUploadMapping(JSON.parse(JSON.stringify(withDrain))), withDrain);

  const messy = sanitizeConversionUploadMapping({
    status: "approved",
    conversionAction: { resourceName: "  customers/1/conversionActions/2  " },
    kinds: { qualified: "yes", won: true },
    dryRunRows: "-4",
    lastDrain: { at: "2026-08-30T00:00:00.000Z", uploaded: "x", failed: 2.7, batchId: "b" },
  });
  assert.equal(messy.conversionAction.resourceName, "customers/1/conversionActions/2");
  assert.equal(messy.conversionAction.name, "customers/1/conversionActions/2", "a missing name falls back to the id");
  assert.deepEqual(messy.kinds, { qualified: false, won: true }, "only a literal true is a yes");
  assert.equal(messy.dryRunRows, 0);
  assert.equal(messy.lastDrain.uploaded, 0);
  assert.equal(messy.lastDrain.failed, 2);
});
