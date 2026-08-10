/** The pure decisions behind the Nastavení page's project-level actions.
 *
 *  Two promises this pins:
 *   1. The Ads link is now surfaced on the settings page, over the SAME guarded PATCH
 *      route (and the same `decideAdsLink` rule) as the projects hub — so the picker's
 *      annotation per account (link / relink / already-claimed-by-X) and the route's
 *      refusal codes (409 collision, 422 unknown account) must map exactly once, here.
 *   2. A delete that stranded satellite stores is no longer indistinguishable from a
 *      clean one: `readCascadeOutcome` reads `{cleaned, failed}` off the DELETE
 *      payload, and `summarizeOrphanReport` reduces the sweep route's report to what
 *      the panel tells the user. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const {
  adsAccountOptions,
  adsPatchOutcome,
  readCascadeOutcome,
  summarizeOrphanReport,
} = await import("@/lib/projects/settings-actions");

const ACC = (customerId, customerName = `Acct ${customerId}`) => ({ customerId, customerName });
const PROJ = (id, adsCustomerId) => ({ id, name: `P-${id}`, ...(adsCustomerId ? { adsCustomerId } : {}) });

test("adsPatchOutcome maps the route's contract, not just ok/not-ok", () => {
  assert.equal(adsPatchOutcome(200), "ok");
  assert.equal(adsPatchOutcome(204), "ok");
  assert.equal(adsPatchOutcome(409), "already-claimed");
  assert.equal(adsPatchOutcome(422), "unknown-account");
  assert.equal(adsPatchOutcome(500), "failed");
  assert.equal(adsPatchOutcome(403), "failed");
});

test("adsAccountOptions annotates every connected account with what picking it does", () => {
  const project = PROJ("a", "111");
  const projects = [project, PROJ("b", "222"), PROJ("c")];
  const options = adsAccountOptions({ project, accounts: [ACC("111"), ACC("222"), ACC("333")], projects });

  // the current link: a no-op, never offered as a change
  assert.deepEqual(
    options.map((o) => o.action),
    ["noop", "noop", "relink"]
  );
  assert.equal(options[0].claimedBy, undefined);
  // held by another project → named, so the user knows where to unlink (r15: a
  // refusal is recoverable because unlink exists)
  assert.equal(options[1].claimedBy, "P-b");
  // a free account onto a linked project replaces the link → destructive, confirmed
  assert.equal(options[2].claimedBy, undefined);
});

test("adsAccountOptions: an unlinked project links a free account outright", () => {
  const project = PROJ("c");
  const options = adsAccountOptions({
    project,
    accounts: [ACC("333")],
    projects: [PROJ("a", "111"), project],
  });
  assert.deepEqual(options.map((o) => o.action), ["link"]);
});

test("readCascadeOutcome tells a partial delete from a clean one", () => {
  assert.deepEqual(readCascadeOutcome({ ok: true, cleaned: ["twin", "leads"], failed: [] }), {
    partial: false,
    cleaned: ["twin", "leads"],
    failed: [],
  });
  const partial = readCascadeOutcome({ ok: true, cleaned: ["twin"], failed: ["leads", "tenant"] });
  assert.equal(partial.partial, true);
  assert.deepEqual(partial.failed, ["leads", "tenant"]);
  // an unexpected/older payload must degrade to "clean", never to a phantom warning
  assert.deepEqual(readCascadeOutcome({ ok: true }), { partial: false, cleaned: [], failed: [] });
  assert.deepEqual(readCascadeOutcome(null), { partial: false, cleaned: [], failed: [] });
  assert.deepEqual(readCascadeOutcome({ failed: [1, "", "leads"] }).failed, ["leads"]);
});

test("summarizeOrphanReport: a report-only sweep counts orphans and their pending units", () => {
  const s = summarizeOrphanReport({
    ok: true,
    report: {
      applied: false,
      findings: [
        { status: "orphaned", pending: ["leads", "twin"] },
        { status: "alive", pending: ["notes"] },
        { status: "orphaned", pending: ["twin"] },
      ],
    },
  });
  assert.equal(s.orphanCount, 2);
  assert.equal(s.applied, false);
  assert.deepEqual(s.pending.sort(), ["leads", "twin"]);
  // an `alive` finding contributes NOTHING — nothing of it is orphaned
  assert.equal(s.pending.includes("notes"), false);
  assert.deepEqual(s.stillFailing, []);
});

test("summarizeOrphanReport: an applied sweep reports only what STILL fails", () => {
  const done = summarizeOrphanReport({
    report: { applied: true, findings: [{ status: "orphaned", pending: ["leads"], cleaned: ["leads"], stillFailing: [] }] },
  });
  assert.equal(done.applied, true);
  assert.deepEqual(done.stillFailing, []);

  const stuck = summarizeOrphanReport({
    report: { applied: true, findings: [{ status: "orphaned", pending: ["leads"], stillFailing: ["leads"] }] },
  });
  assert.deepEqual(stuck.stillFailing, ["leads"]);
});

test("summarizeOrphanReport survives a shapeless payload", () => {
  for (const input of [null, {}, { report: null }, { report: { findings: "nope" } }]) {
    assert.deepEqual(summarizeOrphanReport(input), {
      orphanCount: 0,
      pending: [],
      applied: false,
      stillFailing: [],
    });
  }
});
