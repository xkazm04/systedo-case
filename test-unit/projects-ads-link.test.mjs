/** Direction 3 — agency-link visibility: the pure (accounts × projects) → link-status
 *  computation behind the projects-home badge + the unmapped-accounts callout. No React,
 *  no firebase — just the state transitions. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { projectAdsLink, unmappedAccounts } = await import("@/lib/projects/ads-link");

const ACC = (customerId, customerName = `Acct ${customerId}`) => ({ customerId, customerName });
const PROJ = (id, adsCustomerId) => ({ id, name: `P-${id}`, ...(adsCustomerId ? { adsCustomerId } : {}) });

// --- projectAdsLink -------------------------------------------------------

test("projectAdsLink: unlinked project", () => {
  assert.deepEqual(projectAdsLink(PROJ("a")), { linked: false });
});

test("projectAdsLink: linked + names the account when connected", () => {
  const link = projectAdsLink(PROJ("a", "123"), [ACC("123", "Nike")]);
  assert.deepEqual(link, { linked: true, customerId: "123", customerName: "Nike" });
});

test("projectAdsLink: linked but account disconnected → id only, no lie", () => {
  const link = projectAdsLink(PROJ("a", "999"), [ACC("123", "Nike")]);
  assert.deepEqual(link, { linked: true, customerId: "999", customerName: undefined });
});

test("projectAdsLink: tolerates a missing accounts list", () => {
  assert.deepEqual(projectAdsLink(PROJ("a", "123")), {
    linked: true,
    customerId: "123",
    customerName: undefined,
  });
});

// --- unmappedAccounts -----------------------------------------------------

test("unmappedAccounts: an account linked to any project drops out", () => {
  const accounts = [ACC("1"), ACC("2"), ACC("3")];
  const projects = [PROJ("a", "1"), PROJ("b"), PROJ("c", "3")];
  assert.deepEqual(
    unmappedAccounts(accounts, projects).map((a) => a.customerId),
    ["2"] // 1 + 3 are mapped, 2 is loose
  );
});

test("unmappedAccounts: none connected → empty", () => {
  assert.deepEqual(unmappedAccounts([], [PROJ("a")]), []);
});

test("unmappedAccounts: none mapped → all loose, order preserved", () => {
  const accounts = [ACC("9"), ACC("8"), ACC("7")];
  assert.deepEqual(
    unmappedAccounts(accounts, [PROJ("a"), PROJ("b")]).map((a) => a.customerId),
    ["9", "8", "7"]
  );
});

test("unmappedAccounts: one account mapped by two projects still drops once", () => {
  const accounts = [ACC("1"), ACC("2")];
  const projects = [PROJ("a", "1"), PROJ("b", "1")];
  assert.deepEqual(
    unmappedAccounts(accounts, projects).map((a) => a.customerId),
    ["2"]
  );
});

test("unmappedAccounts: an adsCustomerId with no matching connected account is ignored", () => {
  // A project linked to an id we no longer have connected doesn't mask a real loose account.
  const accounts = [ACC("2")];
  const projects = [PROJ("a", "999")];
  assert.deepEqual(
    unmappedAccounts(accounts, projects).map((a) => a.customerId),
    ["2"]
  );
});
