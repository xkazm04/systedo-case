/** Account compute (src/lib/account/compute.ts): security checklist + email mask. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maskEmail, securityChecklist } from "@/lib/account/compute";

const byId = (checks, id) => checks.find((c) => c.id === id).state;

test("real OAuth session: email + sso + session ok, twofa delegated", () => {
  const c = securityChecklist({ hasEmail: true, oauth: true, devMode: false });
  assert.equal(byId(c, "email"), "ok");
  assert.equal(byId(c, "sso"), "ok");
  assert.equal(byId(c, "session"), "ok");
  assert.equal(byId(c, "twofa"), "unavailable");
});

test("dev-auth session: sso + session unavailable (no real provider/store)", () => {
  const c = securityChecklist({ hasEmail: true, oauth: false, devMode: true });
  assert.equal(byId(c, "sso"), "unavailable");
  assert.equal(byId(c, "session"), "unavailable");
});

test("real session missing email/oauth → action", () => {
  const c = securityChecklist({ hasEmail: false, oauth: false, devMode: false });
  assert.equal(byId(c, "email"), "action");
  assert.equal(byId(c, "sso"), "action");
});

test("maskEmail hides the local part but keeps the domain", () => {
  assert.equal(maskEmail("michal@nuda.dev"), "m•••••@nuda.dev");
  assert.equal(maskEmail("a@b.com"), "a@b.com");
  assert.equal(maskEmail("noatsign"), "noatsign");
});
