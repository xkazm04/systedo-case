/** Tenant-key resolution + mutation-audit dual-read keys
 *  (src/lib/campaigns/store-keys.ts). The audit + activity of a pause/budget-shift
 *  must land under the SAME project-scoped tenant as the campaigns they mutate,
 *  and legacy audit docs (written under the old project-agnostic key) must stay
 *  readable via a dual-read that never rewrites history. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTenantKey,
  legacyMutationAuditTenant,
  mutationAuditReadTenants,
  safeKeyComponent,
} from "@/lib/campaigns/store-keys";

test("buildTenantKey is per-user, per-project, per-account and composes in that order", () => {
  assert.equal(buildTenantKey("u1"), "u_u1");
  assert.equal(buildTenantKey("u1", "p1"), "u_u1_proj_p1");
  assert.equal(buildTenantKey("u1", "p1", "123"), "u_u1_proj_p1_123");
  // No project but an account (public/legacy per-user account tenant).
  assert.equal(buildTenantKey("u1", null, "123"), "u_u1_123");
  assert.equal(buildTenantKey("u1", undefined, "123"), "u_u1_123");
});

test("every key component is sanitised so a '/' can't break out of the Firestore path", () => {
  assert.equal(safeKeyComponent("a/b c.d"), "a_b_c_d");
  assert.ok(!buildTenantKey("a/b", "p/1", "12/3").includes("/"));
});

test("the mutation audit tenant equals the campaigns' tenant (project scope)", () => {
  // resolveTenant(userId, projectId) — the account-scoped campaign tenant — is what
  // the apply/control-plane routes now pass into the mutations, so the audit is
  // written exactly here, next to the campaigns it acted on.
  const campaignTenant = buildTenantKey("u1", "p1", "1234567890");
  assert.equal(campaignTenant, "u_u1_proj_p1_1234567890");
});

test("the legacy audit tenant is the old project-agnostic key", () => {
  assert.equal(legacyMutationAuditTenant("u1", "1234567890"), "u_u1_1234567890");
  // It differs from the project-scoped tenant — that divergence is exactly why a
  // dual-read is needed to still surface pre-migration audit docs.
  assert.notEqual(
    legacyMutationAuditTenant("u1", "1234567890"),
    buildTenantKey("u1", "p1", "1234567890")
  );
});

test("dual-read unions the project-scoped and legacy tenants, deduped", () => {
  const projectTenant = buildTenantKey("u1", "p1", "1234567890");
  const keys = mutationAuditReadTenants(projectTenant, "u1", "1234567890");
  assert.deepEqual(keys, ["u_u1_proj_p1_1234567890", "u_u1_1234567890"]);

  // No customer id → no legacy divergence → read exactly once.
  assert.deepEqual(mutationAuditReadTenants("u_u1", "u1", null), ["u_u1"]);

  // A project-less account tenant already equals its own legacy key → deduped.
  const acctTenant = buildTenantKey("u1", null, "1234567890"); // u_u1_1234567890
  assert.deepEqual(mutationAuditReadTenants(acctTenant, "u1", "1234567890"), [acctTenant]);
});
