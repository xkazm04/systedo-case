/** The ad-ops CONTROL PLANE on the LOCAL_DB backend: change-sets, the alert inbox
 *  and the per-mutation audit now address `tenants/{tenant}/{changeSets|alerts|
 *  mutations}` through the generic per-tenant document seam
 *  (src/lib/tenant-docs/backend.ts → local.ts, table `tenant_docs`, migration v17)
 *  instead of opening `firestore` themselves. Under `npm run dev:local` the whole
 *  governance envelope — propose → approve → revert, and the inbox workflow that
 *  feeds it — used to throw on every single read and write.
 *
 *  What is mocked and why: the Google Ads WRITE layer (@/lib/google/ads + token +
 *  connection) and the campaign READ (`listCampaigns`). This suite is about the
 *  STORE seam; what the mutations do to a live account is untouched by that seam
 *  and is not what is under test. Everything else — the claim policy, the apply
 *  loop, the activity feed, the audit appends — is the real code.
 *
 *  The Firestore side of the same refactor is proven separately by replaying the
 *  identical scenario against a recording firebase stand-in and diffing the
 *  operation log (paths + payloads unchanged); see the WP F2 report. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-control-plane-local-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { withMetrics, TARGET_ROAS } = await import("@/lib/campaigns/types");
const { buildTenantKey } = await import("@/lib/campaigns/store-keys");

function row(id, { cost, roasFactor, status = "enabled" }) {
  return withMetrics({
    id,
    name: `Kampaň ${id}`,
    type: "search",
    status,
    impressions: 50_000,
    clicks: 1_000,
    cost,
    conversions: roasFactor > 0 ? 20 : 0,
    conversionValue: Math.round(cost * TARGET_ROAS * roasFactor),
  });
}

const CAMPAIGNS = [
  row("z1", { cost: 8_000, roasFactor: 0 }), // zero-return burner → pause move
  row("d1", { cost: 20_000, roasFactor: 0.5 }), // under-performer → shift donor
  row("w1", { cost: 20_000, roasFactor: 1.4 }), // over-performer → recipient
];

const CUSTOMER_ID = "1234567890";

mock.module("@/lib/campaigns/store", {
  namedExports: {
    listCampaigns: async () => CAMPAIGNS,
    getSyncMeta: async () => ({ period: "30d", syncedAt: "2026-08-01T00:00:00.000Z", source: "google" }),
  },
});
mock.module("@/lib/campaigns/connection", {
  namedExports: {
    getAdsConnection: async () => ({
      customerId: CUSTOMER_ID,
      customerName: "Acme",
      connectedAt: "2026-01-01T00:00:00.000Z",
    }),
  },
});
mock.module("@/lib/google/token", { namedExports: { getUserAccessToken: async () => "tok" } });
mock.module("@/lib/google/ads", {
  namedExports: {
    adsConfigured: () => true,
    pauseCampaign: async () => {},
    resumeCampaign: async () => {},
    setCampaignBudgetMicros: async () => {},
    fetchCampaignBudgets: async (_token, _customerId, ids) =>
      new Map(
        ids.map((id, i) => [
          id,
          { budgetResourceName: `customers/1/campaignBudgets/${id}`, amountMicros: 500_000_000 + i },
        ])
      ),
  },
});

const { tenantDocs } = await import("@/lib/tenant-docs/backend");
const { createChangeSet, listChangeSets, approveChangeSet, revertChangeSet } = await import(
  "@/lib/campaigns/control-plane"
);
const {
  recordAlert,
  getAlert,
  acknowledgeAlert,
  resolveAlert,
  listAlerts,
  markAlertsRead,
} = await import("@/lib/campaigns/alerts");
const { listMutationAudit } = await import("@/lib/campaigns/mutations");
const { listActivity } = await import("@/lib/campaigns/activity");

const USER = "u1";
const PROJECT = "p1";
const T = buildTenantKey(USER, PROJECT, CUSTOMER_ID);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- change-sets: create → list (newest first, capped) -------------------------

test("[local] createChangeSet persists a pending set and reads back with its moves", async () => {
  const tenant = `${T}_create`;
  const cs = await createChangeSet(tenant);
  assert.ok(cs, "a portfolio with a burner and an under-performer yields a set");
  assert.ok(cs.id, "the local backend mints a document id");
  assert.equal(cs.status, "pending");
  assert.ok(cs.moves.length > 0);
  assert.equal(cs.approvedAt, null);

  const [stored] = await listChangeSets(tenant);
  assert.equal(stored.id, cs.id);
  assert.equal(stored.status, "pending");
  assert.deepEqual(
    stored.moves.map((m) => m.fromId),
    cs.moves.map((m) => m.fromId),
    "the move bundle survives the JSON roundtrip through tenant_docs"
  );
});

test("[local] listChangeSets is newest-first (createdAt desc)", async () => {
  const tenant = `${T}_order`;
  const made = [];
  for (let i = 0; i < 3; i++) {
    made.push(await createChangeSet(tenant));
    await sleep(2); // distinct ISO createdAt, so ordering is the field's, not the tie-break's
  }
  const listed = await listChangeSets(tenant);
  assert.deepEqual(
    listed.map((c) => c.id),
    [...made].reverse().map((c) => c.id)
  );
});

test("[local] listChangeSets caps at the newest 20 (same cap as the Firestore read)", async () => {
  const tenant = `${T}_cap`;
  const store = await tenantDocs();
  for (let i = 0; i < 22; i++) {
    // seeded straight through the seam so the cap is tested without 22 simulations
    await store.addDoc(tenant, "changeSets", {
      createdAt: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      status: "pending",
      moves: [],
      simulation: { before: {}, after: {} },
      policy: { maxMoveAmountCzk: 50_000, maxMoves: 3 },
      violations: [],
      approvedAt: null,
      revertedAt: null,
      results: null,
    });
  }
  const listed = await listChangeSets(tenant);
  assert.equal(listed.length, 20);
  assert.equal(listed[0].createdAt, "2026-08-22T00:00:00.000Z", "newest first");
  assert.equal(listed[19].createdAt, "2026-08-03T00:00:00.000Z", "the two oldest fall outside the cap");
});

// --- the full lifecycle: create → approve → revert ------------------------------

test("[local] approve applies every move, captures snapshots and audits each mutation", async () => {
  const tenant = `${T}_life`;
  const cs = await createChangeSet(tenant);
  const applied = await approveChangeSet(tenant, USER, cs.id);

  assert.equal(applied.status, "applied");
  assert.ok(applied.approvedAt, "the settle stamps approvedAt");
  assert.equal(applied.results.length, cs.moves.length);
  assert.ok(
    applied.results.every((r) => r.ok),
    "with the live layer answering ok, every move lands"
  );
  assert.ok(applied.budgetSnapshots.length > 0, "the shift move captured budget snapshots");
  assert.equal(applied.statusSnapshots.length, 1, "the pause move captured a status snapshot");

  // the persisted doc agrees with the returned one
  const [stored] = await listChangeSets(tenant);
  assert.equal(stored.status, "applied");
  assert.equal(stored.budgetSnapshots.length, applied.budgetSnapshots.length);

  // ...and the mutation audit recorded one row per live write, on the sqlite twin
  const audit = await listMutationAudit(USER, `${PROJECT}_life_none`);
  assert.equal(audit.length, 0, "another project's audit is untouched (tenant isolation)");
  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", {
    orderBy: { field: "at", dir: "desc" },
  });
  assert.deepEqual(
    rows.map((r) => r.data.action).sort(),
    ["budget_shift", "pause"],
    "the audit append reached tenant_docs, not a Firestore throw"
  );
});

test("[local] a settled set is an idempotent no-op on a second approve", async () => {
  const tenant = `${T}_life`;
  const [before] = await listChangeSets(tenant);
  const again = await approveChangeSet(tenant, USER, before.id);
  assert.equal(again.status, "applied");
  const [after] = await listChangeSets(tenant);
  assert.equal(after.approvedAt, before.approvedAt, "no second apply loop ran");
  assert.equal(after.results.length, before.results.length);
});

test("[local] revert restores from the snapshots and settles 'reverted'", async () => {
  const tenant = `${T}_life`;
  const [applied] = await listChangeSets(tenant);
  const reverted = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(reverted.status, "reverted");
  assert.ok(reverted.revertedAt);

  const [stored] = await listChangeSets(tenant);
  assert.equal(stored.status, "reverted");

  const rows = await (await tenantDocs()).listDocs(tenant, "mutations", {
    orderBy: { field: "at", dir: "desc" },
  });
  assert.ok(
    rows.some((r) => r.data.action === "budget_restore"),
    "the restore is audited"
  );
  assert.ok(rows.some((r) => r.data.action === "resume"), "the paused campaign is resumed and audited");

  // reverting again is a no-op (terminal)
  const noop = await revertChangeSet(tenant, USER, applied.id);
  assert.equal(noop.status, "reverted");
  assert.equal(noop.revertedAt, stored.revertedAt);
});

test("[local] approving or reverting a missing set returns null, never throws", async () => {
  const tenant = `${T}_missing`;
  assert.equal(await approveChangeSet(tenant, USER, "nope"), null);
  assert.equal(await revertChangeSet(tenant, USER, "nope"), null);
});

test("[local] a guardrail-violating set refuses to apply and leaves no claim behind", async () => {
  const tenant = `${T}_guard`;
  const cs = await createChangeSet(tenant);
  const store = await tenantDocs();
  await store.setDoc(tenant, "changeSets", cs.id, { violations: ["příliš velký přesun"] }, { merge: true });

  await assert.rejects(() => approveChangeSet(tenant, USER, cs.id), /pojistky/);
  const [after] = await listChangeSets(tenant);
  assert.equal(after.status, "pending", "the refused approve never stamped 'applying'");
  assert.equal(after.claimedAt, undefined);

  const overridden = await approveChangeSet(tenant, USER, cs.id, { override: true });
  assert.equal(overridden.status, "applied");
  assert.equal(overridden.overridden, true);
});

// --- the claim is atomic: exactly one winner ----------------------------------

test("[local] two concurrent approves → exactly one runs the apply loop", async () => {
  const tenant = `${T}_race`;
  const cs = await createChangeSet(tenant);

  const [a, b] = await Promise.all([
    approveChangeSet(tenant, USER, cs.id),
    approveChangeSet(tenant, USER, cs.id),
  ]);

  const winners = [a, b].filter((r) => r.status === "applied" && r.approvedAt);
  assert.equal(winners.length, 1, "one caller settled the set; the other saw a taken claim");

  const [stored] = await listChangeSets(tenant);
  assert.equal(stored.status, "applied");
  assert.equal(
    stored.results.length,
    cs.moves.length,
    "the apply loop ran ONCE — a second pass would have doubled the results"
  );

  const approvals = (await listActivity(tenant)).records.filter((r) =>
    r.title.startsWith("Schválen změnový balíček")
  );
  assert.equal(approvals.length, 1, "exactly one governance event was logged");

  const audit = await (await tenantDocs()).listDocs(tenant, "mutations");
  assert.equal(audit.length, cs.moves.length, "no move was applied to the account twice");
});

test("[local] two concurrent reverts → exactly one runs the restore loop", async () => {
  const tenant = `${T}_race`;
  const [applied] = await listChangeSets(tenant);
  const [a, b] = await Promise.all([
    revertChangeSet(tenant, USER, applied.id),
    revertChangeSet(tenant, USER, applied.id),
  ]);
  const winners = [a, b].filter((r) => r.status === "reverted" && r.revertedAt);
  assert.equal(winners.length, 1);

  const reverts = (await listActivity(tenant)).records.filter((r) =>
    r.title.startsWith("Vrácen změnový balíček")
  );
  assert.equal(reverts.length, 1);
});

// --- the alert inbox -----------------------------------------------------------

test("[local] recordAlert → listAlerts (newest first) → getAlert", async () => {
  const tenant = `${T}_inbox`;
  const first = await recordAlert(tenant, {
    type: "critical",
    title: "2 nové kritické kampaně",
    body: "d1 — pod cílem",
    items: [{ campaignId: "d1", name: "Kampaň d1", reason: "pod cílem" }],
  });
  await sleep(2);
  const second = await recordAlert(tenant, {
    type: "digest",
    title: "Diagnóza týdne",
    body: "x",
    items: [],
    href: "/app/ltv",
  });

  const listed = await listAlerts(tenant);
  assert.deepEqual(listed.map((a) => a.id), [second, first], "newest first");
  assert.equal(listed[0].href, "/app/ltv");
  assert.equal(listed[1].href, undefined, "an hrefless alert stores no href field");
  assert.ok(listed.every((a) => a.read === false && a.status === "new"));
  assert.equal((await listAlerts(tenant, 1)).length, 1, "the limit is honoured");

  const one = await getAlert(tenant, first);
  assert.equal(one.title, "2 nové kritické kampaně");
  assert.equal(one.items[0].campaignId, "d1");
  assert.equal(await getAlert(tenant, "missing"), null);
});

test("[local] acknowledge advances new → acknowledged, and never regresses", async () => {
  const tenant = `${T}_ack`;
  const id = await recordAlert(tenant, { type: "critical", title: "A", body: "b", items: [] });
  await acknowledgeAlert(tenant, id);
  assert.equal((await getAlert(tenant, id)).status, "acknowledged");
  await acknowledgeAlert(tenant, id);
  assert.equal((await getAlert(tenant, id)).status, "acknowledged", "re-acknowledging is a no-op");
  await acknowledgeAlert(tenant, "missing"); // must not throw
});

test("[local] resolve is terminal and the FIRST resolver keeps the back-reference", async () => {
  const tenant = `${T}_resolve`;
  const id = await recordAlert(tenant, { type: "critical", title: "A", body: "b", items: [] });
  await resolveAlert(tenant, id, "cs-first");
  const resolved = await getAlert(tenant, id);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolvedBy, "cs-first");

  await resolveAlert(tenant, id, "cs-second");
  assert.equal((await getAlert(tenant, id)).resolvedBy, "cs-first", "a re-resolve never rewrites it");

  // and an already-resolved alert cannot be dragged back to acknowledged
  await acknowledgeAlert(tenant, id);
  assert.equal((await getAlert(tenant, id)).status, "resolved");
});

test("[local] markAlertsRead marks one alert, or every unread one", async () => {
  const tenant = `${T}_read`;
  const a = await recordAlert(tenant, { type: "critical", title: "A", body: "", items: [] });
  await sleep(2);
  const b = await recordAlert(tenant, { type: "critical", title: "B", body: "", items: [] });
  await sleep(2);
  const c = await recordAlert(tenant, { type: "critical", title: "C", body: "", items: [] });

  await markAlertsRead(tenant, b);
  const afterOne = await listAlerts(tenant);
  assert.deepEqual(
    Object.fromEntries(afterOne.map((x) => [x.id, x.read])),
    { [a]: false, [b]: true, [c]: false }
  );
  assert.equal(afterOne.find((x) => x.id === b).title, "B", "the merge-set kept the rest of the doc");

  await markAlertsRead(tenant);
  assert.ok((await listAlerts(tenant)).every((x) => x.read === true));
});

// --- the alert → change-set loop, end to end on the local store ----------------

test("[local] applying a set staged off an alert resolves that alert", async () => {
  const tenant = `${T}_loop`;
  const alertId = await recordAlert(tenant, {
    type: "critical",
    title: "Kampaň d1 pod cílem",
    body: "",
    items: [{ campaignId: "d1", name: "Kampaň d1", reason: "pod cílem" }],
  });
  const cs = await createChangeSet(tenant, { scopeCampaignIds: ["d1"], alertId });
  assert.ok(cs, "the alerted campaign is a viable donor");
  assert.equal(cs.alertId, alertId);
  assert.deepEqual(cs.moves.map((m) => m.fromId), ["d1"], "donors are scoped to the alert");

  const applied = await approveChangeSet(tenant, USER, cs.id);
  assert.equal(applied.status, "applied");
  const alert = await getAlert(tenant, alertId);
  assert.equal(alert.status, "resolved");
  assert.equal(alert.resolvedBy, cs.id, "the inbox row points back at the set that closed it");
});
