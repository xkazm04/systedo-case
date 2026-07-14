/** Direction 1 — stockout alerts + the persisted-plan pure logic:
 *   - which SKUs breach (transition candidates) + the planSuppression interplay
 *     (per-SKU keys, transition-only, cooldown-governed);
 *   - the cs/en alert payload;
 *   - the plan inputs digest + initial per-move states (stale-plan reset);
 *   - the wire sanitiser;
 *   - the sample-gating rule: alertStockTransitions only fires for e-shop projects,
 *     bailing (no suppression write) otherwise.
 *  The gating test is db-backed (LOCAL sqlite) so it exercises the real project +
 *  store read; the rest is pure. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), "systedo-stock-alerts-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { stockRows } = await import("@/lib/inventory/compute");
const { breachingSkus, stockAlertPayload, planInputsDigest, initialMoveStates, sanitizeStoredPlan } =
  await import("@/lib/inventory/plan-types");
const { planSuppression } = await import("@/lib/campaigns/alert-suppression");
const { alertStockTransitions } = await import("@/lib/inventory/sync-alerts");
const { getStockAlertState } = await import("@/lib/inventory/plan-store");
const { createProject } = await import("@/lib/projects/store.local.ts");

const NOW = new Date("2026-07-01T00:00:00Z");

/** A product offering with sensible defaults; override stock/velocity to set cover. */
const offering = (o) => ({
  kind: "product",
  id: o.sku,
  projectId: "p",
  name: o.title ?? o.sku,
  category: o.category ?? "Ořechy",
  active: true,
  nature: "online",
  price: o.price ?? 200,
  currency: "CZK",
  channels: [],
  tags: [],
  source: "baselinker",
  updatedAt: "x",
  sku: o.sku,
  stock: o.stock ?? 100,
  dailyVelocity: o.dailyVelocity ?? 1,
  ...(o.margin !== undefined ? { margin: o.margin } : {}),
});

// --- breaching selection (transition candidates) ----------------------------

test("breachingSkus flags pause (<7d) and at-risk (7–14d), not healthy cover", () => {
  const rows = stockRows(
    [
      offering({ sku: "PAUSE", stock: 3, dailyVelocity: 1 }), // 3d → pause
      offering({ sku: "RISK", stock: 10, dailyVelocity: 1 }), // 10d → at-risk
      offering({ sku: "OK", stock: 100, dailyVelocity: 1 }), // 100d → ok
      offering({ sku: "DEAD", stock: 5, dailyVelocity: 0 }), // no velocity → never
    ],
    NOW
  );
  const breaching = breachingSkus(rows).sort();
  assert.deepEqual(breaching, ["PAUSE", "RISK"]);
});

// --- transition decision via planSuppression (per-SKU keys) ------------------

test("transition-only: a crossing SKU alerts once, is suppressed next sync, re-arms after recovery+cooldown", () => {
  const breaching = ["PAUSE-SKU"];
  // First sync: fresh episode → alerts.
  const s1 = planSuppression({}, { breaching, banded: [], now: NOW.getTime() });
  assert.deepEqual(s1.toAlert, ["PAUSE-SKU"]);
  assert.equal(s1.nextState["PAUSE-SKU"].active, true);

  // Second sync minutes later, still breaching → suppressed (within cooldown).
  const s2 = planSuppression(s1.nextState, { breaching, banded: [], now: NOW.getTime() + 5 * 60_000 });
  assert.deepEqual(s2.toAlert, []);

  // Recovers (not breaching) and the cooldown elapses → episode drops (re-armed).
  const s3 = planSuppression(s2.nextState, { breaching: [], banded: [], now: NOW.getTime() + 7 * 60 * 60_000 });
  assert.equal(s3.nextState["PAUSE-SKU"], undefined);

  // Breaches again after re-arming → alerts fresh.
  const s4 = planSuppression(s3.nextState, { breaching, banded: [], now: NOW.getTime() + 8 * 60 * 60_000 });
  assert.deepEqual(s4.toAlert, ["PAUSE-SKU"]);
});

// --- cs/en alert payload -----------------------------------------------------

test("stockAlertPayload: critical when any hard pause, with cs/en text + deep-link", () => {
  const rows = stockRows(
    [
      offering({ sku: "P", title: "Mandle", stock: 3, dailyVelocity: 1 }), // pause
      offering({ sku: "R", title: "Kešu", stock: 10, dailyVelocity: 1 }), // at-risk
    ],
    NOW
  );
  const cs = stockAlertPayload(rows, "proj-1", "cs");
  assert.equal(cs.type, "critical"); // a hard pause is present
  assert.equal(cs.items.length, 2);
  assert.match(cs.title, /2 SKU/);
  assert.equal(cs.href, "/app/proj-1/sklad-sezonnost");
  assert.match(cs.body, /vyprodáno/); // cs pause phrasing

  const en = stockAlertPayload(rows, "proj-1", "en");
  assert.match(en.title, /2 SKUs/);
  assert.match(en.body, /out of stock/); // en pause phrasing
});

test("stockAlertPayload: digest (not critical) when only at-risk SKUs", () => {
  const rows = stockRows([offering({ sku: "R", stock: 10, dailyVelocity: 1 })], NOW); // at-risk only
  const p = stockAlertPayload(rows, "proj-1", "cs");
  assert.equal(p.type, "digest");
});

// --- plan inputs digest + initial move states -------------------------------

test("planInputsDigest is order-independent and changes with amounts", () => {
  const a = [
    { fromSku: "A", toSku: "B", amountCzk: 100 },
    { fromSku: "C", toSku: "D", amountCzk: 200 },
  ];
  const b = [
    { fromSku: "C", toSku: "D", amountCzk: 200 },
    { fromSku: "A", toSku: "B", amountCzk: 100 },
  ];
  assert.equal(planInputsDigest(a), planInputsDigest(b)); // order-independent
  const c = [...a];
  c[0] = { ...c[0], amountCzk: 999 };
  assert.notEqual(planInputsDigest(a), planInputsDigest(c)); // amount change flips it
});

test("initialMoveStates: saved states apply on a digest match, reset to proposed when stale", () => {
  const actions = [
    { fromSku: "A", toSku: "B" },
    { fromSku: "C", toSku: "D" },
  ];
  const digest = "match";
  const stored = {
    createdAt: "x",
    inputsDigest: "match",
    moves: [
      { key: "A->B", fromSku: "A", toSku: "B", amountCzk: 1, state: "accepted" },
      { key: "C->D", fromSku: "C", toSku: "D", amountCzk: 1, state: "dismissed" },
    ],
  };
  assert.deepEqual(initialMoveStates(stored, digest, actions), { "A->B": "accepted", "C->D": "dismissed" });

  // digest mismatch (stock changed) → the saved plan is stale, all proposed.
  assert.deepEqual(initialMoveStates(stored, "other", actions), { "A->B": "proposed", "C->D": "proposed" });

  // no stored plan → all proposed.
  assert.deepEqual(initialMoveStates(null, digest, actions), { "A->B": "proposed", "C->D": "proposed" });
});

// --- wire sanitiser ----------------------------------------------------------

test("sanitizeStoredPlan: coerces/bounds moves, stamps createdAt, rejects bad bodies", () => {
  const now = new Date("2026-07-14T00:00:00Z");
  assert.equal(sanitizeStoredPlan(null, now), null);
  assert.equal(sanitizeStoredPlan({ inputsDigest: "", moves: [] }, now), null); // no digest
  assert.equal(sanitizeStoredPlan({ inputsDigest: "d", moves: "nope" }, now), null); // moves not array

  const clean = sanitizeStoredPlan(
    {
      inputsDigest: "d1",
      createdAt: "SHOULD-BE-IGNORED",
      moves: [
        { key: "A->B", fromSku: "A", toSku: "B", amountCzk: -5, state: "accepted" }, // clamp amount
        { fromSku: "C", toSku: "D", amountCzk: 300, state: "bogus" }, // bad state → proposed, key synthesised
        { fromSku: "", toSku: "Z" }, // dropped (no fromSku)
      ],
    },
    now
  );
  assert.equal(clean.createdAt, now.toISOString());
  assert.equal(clean.moves.length, 2);
  assert.equal(clean.moves[0].amountCzk, 0); // negative clamped
  assert.equal(clean.moves[1].state, "proposed"); // bad state coerced
  assert.equal(clean.moves[1].key, "C->D"); // synthesised
});

// --- the sample-gating rule (db-backed) -------------------------------------

test("alertStockTransitions: non-eshop project is gated out (null, no suppression write)", async () => {
  const uid = "stock-alert-u-leadgen";
  const project = await createProject(uid, { type: "leadgen", name: "Leads" });
  const offerings = [offering({ sku: "PAUSE", stock: 3, dailyVelocity: 1 })];
  const r = await alertStockTransitions(uid, project.id, offerings, NOW);
  assert.equal(r, null); // gated: not an e-shop
  assert.deepEqual(await getStockAlertState(project.id), {}); // bailed before writing state
});

// NOTE: the e-shop POSITIVE path (records + delivers an alert) reaches recordAlert /
// resolveTenant, which need firebase-admin credentials the unit harness doesn't have.
// That end-to-end delivery is an integration concern; here the transition decision,
// per-SKU suppression keys, cs/en payload and the eshop gate are each covered purely.
