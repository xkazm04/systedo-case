/** Direction 2 — "the Ads link can be confirmed, changed, and undone": the pure rule
 *  behind BOTH the API gate and the projects-hub pre-flight, plus an end-to-end
 *  store-level proof that an empty `adsCustomerId` really does clear the field.
 *
 *  What shipped before this: PATCH stored any `adsCustomerId` string unchecked (never
 *  verifying it was even one of the caller's connected accounts) and fired a "Google
 *  Ads napojen" activity on it, and the callout's picker silently overwrote an
 *  existing link. Two projects could therefore claim ONE account, and planSyncTargets
 *  then syncs that account into BOTH — identical spend in two client reports, each
 *  looking legitimate. These tests pin the collision refusal and the unlink path. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

register("./json-loader.mjs", import.meta.url);

const dbFile = join(tmpdir(), "systedo-ads-unlink-test.db");
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

const { decideAdsLink, claimingProject } = await import("@/lib/projects/ads-link");
// The LOCAL sqlite backend directly, not the store dispatcher: `getProject` there is
// wrapped in React `cache()`, which outside a request scope would hand back the
// pre-unlink value and make this test lie.
const { createProject, updateProject, getProject } = await import("@/lib/projects/store.local");

const ACC = (customerId, customerName = `Acct ${customerId}`) => ({ customerId, customerName });
const PROJ = (id, adsCustomerId) => ({ id, name: `P-${id}`, ...(adsCustomerId ? { adsCustomerId } : {}) });

const ACCOUNTS = [ACC("111"), ACC("222"), ACC("333")];

// --- claimingProject ------------------------------------------------------

test("claimingProject: finds the other project holding the account", () => {
  const projects = [PROJ("a", "111"), PROJ("b", "222")];
  assert.equal(claimingProject("222", projects, "a").id, "b");
});

test("claimingProject: the project itself never counts as a claimant", () => {
  assert.equal(claimingProject("111", [PROJ("a", "111")], "a"), null);
});

test("claimingProject: an empty id claims nothing", () => {
  assert.equal(claimingProject("", [PROJ("a", "111")], "b"), null);
});

// --- the common first-link flow (must NOT regress) -------------------------

test("first link: a loose account onto an unlinked project is allowed outright", () => {
  const project = PROJ("a");
  const v = decideAdsLink({ project, customerId: "111", accounts: ACCOUNTS, projects: [project, PROJ("b")] });
  assert.deepEqual(v, { ok: true, action: "link" });
});

test("re-asserting the link a project already has is a no-op, not a conflict", () => {
  const project = PROJ("a", "111");
  const v = decideAdsLink({ project, customerId: "111", accounts: ACCOUNTS, projects: [project] });
  assert.deepEqual(v, { ok: true, action: "noop" });
});

// --- the collision path ---------------------------------------------------

test("collision: an account claimed by ANOTHER project is refused, never overwritten", () => {
  const a = PROJ("a", "111");
  const b = PROJ("b");
  const v = decideAdsLink({ project: b, customerId: "111", accounts: ACCOUNTS, projects: [a, b] });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "already-claimed");
  // The refusal names WHO holds it, so the UI can say where to unlink it.
  assert.equal(v.byProject.id, "a");
});

test("collision refusal wins over the relink confirmation", () => {
  // b already has 222 AND wants a's 111 — the conflict is the stronger verdict, so the
  // user is never offered a confirmation for a change that would be rejected anyway.
  const a = PROJ("a", "111");
  const b = PROJ("b", "222");
  const v = decideAdsLink({ project: b, customerId: "111", accounts: ACCOUNTS, projects: [a, b] });
  assert.equal(v.ok, false);
  assert.equal(v.reason, "already-claimed");
});

test("collision clears once the holder unlinks — the two-step move is possible", () => {
  const a = PROJ("a"); // unlinked, as after an unlink
  const b = PROJ("b");
  assert.deepEqual(
    decideAdsLink({ project: b, customerId: "111", accounts: ACCOUNTS, projects: [a, b] }),
    { ok: true, action: "link" }
  );
});

// --- verification against the caller's connected accounts ------------------

test("an id that is not a connected account is refused (the unchecked-string hole)", () => {
  const project = PROJ("a");
  const v = decideAdsLink({ project, customerId: "999", accounts: ACCOUNTS, projects: [project] });
  assert.deepEqual(v, { ok: false, reason: "unknown-account" });
});

test("no connected accounts at all → nothing is linkable", () => {
  const project = PROJ("a");
  const v = decideAdsLink({ project, customerId: "111", accounts: [], projects: [project] });
  assert.deepEqual(v, { ok: false, reason: "unknown-account" });
});

// --- relink + unlink ------------------------------------------------------

test("relink: replacing a different existing link is allowed but flagged destructive", () => {
  const project = PROJ("a", "111");
  const v = decideAdsLink({ project, customerId: "222", accounts: ACCOUNTS, projects: [project] });
  assert.deepEqual(v, { ok: true, action: "relink", previousCustomerId: "111" });
});

test("unlink: an empty id clears a link and needs no connected account", () => {
  const project = PROJ("a", "111");
  // accounts deliberately EMPTY — you can always let go of an account, even one that
  // has since been disconnected (otherwise a stale link would be unremovable).
  const v = decideAdsLink({ project, customerId: "", accounts: [], projects: [project] });
  assert.deepEqual(v, { ok: true, action: "unlink", previousCustomerId: "111" });
});

test("unlink on an already-unlinked project is a no-op", () => {
  const project = PROJ("a");
  assert.deepEqual(decideAdsLink({ project, customerId: "", accounts: [], projects: [project] }), {
    ok: true,
    action: "noop",
  });
});

// --- the unlink path, end to end through the real store --------------------
//
// The route clears the field by PATCHing `""`; that only works if normalization AND
// the backend actually persist a cleared column. Proven against the real LOCAL_DB
// store rather than trusted from the normalizer's unit test.

test("unlink end to end: PATCHing an empty adsCustomerId really clears the stored link", async () => {
  const user = "u-ads-unlink";
  const project = await createProject(user, { name: "Klient", type: "eshop" });

  const linked = await updateProject(user, project.id, { adsCustomerId: "111" });
  assert.equal(linked.adsCustomerId, "111");
  assert.equal((await getProject(user, project.id)).adsCustomerId, "111");

  // exactly what the unlink button sends
  const unlinked = await updateProject(user, project.id, { adsCustomerId: "" });
  assert.equal(unlinked.adsCustomerId, undefined);
  assert.equal((await getProject(user, project.id)).adsCustomerId, undefined);
});

test("unlink leaves the rest of the project untouched", async () => {
  const user = "u-ads-unlink-2";
  const project = await createProject(user, { name: "Klient B", type: "eshop", domain: "b.cz" });
  await updateProject(user, project.id, { adsCustomerId: "222" });
  const after = await updateProject(user, project.id, { adsCustomerId: "" });
  assert.equal(after.name, "Klient B");
  assert.equal(after.domain, "b.cz");
  assert.equal(after.adsCustomerId, undefined);
});
