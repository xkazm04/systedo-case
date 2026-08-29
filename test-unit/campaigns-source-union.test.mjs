/** ADR-0010 — the two halves that must agree on "which tenants does this project
 *  cover": the pure source SET (`chooseAdsSources`) and the scheduled sync's fan-out
 *  (`planSyncTargets` / `buildSyncPairs`). The ADR's stated failure mode is a change
 *  to one that is not mirrored in the other, so both are pinned here, together with
 *  the negative guarantee that a single-source user's plan did not move.
 *
 *  Pure only — no store, no Firestore, no clock. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAdsSource, chooseAdsSources } from "@/lib/campaigns/provider-precedence";
import { planSyncTargets } from "@/app/api/cron/sync/plan";
import { buildSyncPairs } from "@/lib/cron/pairs";

const BOTH = {
  hasGoogleConnection: true,
  googleConfigured: true,
  hasGoogleToken: true,
  hasSklikToken: true,
};

test("chooseAdsSources: a dual-network user covers BOTH sources, Google first", () => {
  assert.deepEqual(chooseAdsSources(BOTH), ["google-ads", "sklik"]);
  // …and the legacy single answer is unchanged for the same input — it is now
  // documented as "the primary", which is the head of the set.
  assert.equal(chooseAdsSource(BOTH), "google-ads");
  assert.equal(chooseAdsSources(BOTH)[0], chooseAdsSource(BOTH));
});

test("chooseAdsSources: single-source and credential-less users are unchanged", () => {
  assert.deepEqual(chooseAdsSources({ ...BOTH, hasSklikToken: false }), ["google-ads"]);
  assert.deepEqual(
    chooseAdsSources({ hasGoogleConnection: false, googleConfigured: false, hasGoogleToken: false, hasSklikToken: true }),
    ["sklik"]
  );
  // Never empty: a caller can iterate the set without a special case.
  assert.deepEqual(
    chooseAdsSources({ hasGoogleConnection: false, googleConfigured: true, hasGoogleToken: false, hasSklikToken: false }),
    ["sample"]
  );
});

test("chooseAdsSources: an unusable Google connection no longer suppresses live Sklik", () => {
  // The ONE input where the set and the legacy primary differ (documented in the
  // module): a Google account is connected but not usable (no dev token), and a
  // Sklik token IS available. The old rule served demo data; the set serves the
  // user's real Sklik account.
  const f = { hasGoogleConnection: true, googleConfigured: false, hasGoogleToken: true, hasSklikToken: true };
  assert.equal(chooseAdsSource(f), "sample");
  assert.deepEqual(chooseAdsSources(f), ["sklik"]);
});

test("planSyncTargets: a dual user with one sklikLinked project gets exactly ONE extra target", () => {
  const args = {
    accounts: [{ customerId: "1111111111" }],
    projects: [
      { id: "pA", type: "eshop", adsCustomerId: "1111111111", sklikLinked: true },
      { id: "pB", type: "leadgen", adsCustomerId: "2222222222" },
    ],
  };
  const withoutSklik = planSyncTargets(args);
  const withSklik = planSyncTargets({ ...args, hasSklik: true });

  assert.equal(withSklik.length, withoutSklik.length + 1);
  const extra = withSklik.filter((t) => t.source === "sklik");
  assert.deepEqual(extra, [
    { customerId: null, projectId: "pA", projectType: "eshop", source: "sklik", reason: "linked" },
  ]);
  // The Google half is untouched, target for target and in the same order.
  assert.deepEqual(withSklik.filter((t) => !t.source), withoutSklik);
  // pB is not sklikLinked, so it never gets a Sklik tenant — the explicit-link rule.
  assert.equal(extra.some((t) => t.projectId === "pB"), false);
});

test("planSyncTargets: no Sklik connection, or no linked project → byte-identical plan", () => {
  const accounts = [{ customerId: "1111111111" }, { customerId: "2222222222" }];
  const projects = [
    { id: "pA", adsCustomerId: "1111111111" },
    { id: "pB", adsCustomerId: "2222222222" },
  ];
  // No connection at all.
  assert.deepEqual(planSyncTargets({ accounts, projects, hasSklik: true }), planSyncTargets({ accounts, projects }));
  // Connection, but nothing linked → still nothing extra.
  assert.equal(planSyncTargets({ accounts, projects, hasSklik: true }).length, 2);
});

test("planSyncTargets: a Sklik-ONLY user is not double-targeted", () => {
  // No Google accounts → the account-less fallback targets ARE the Sklik sync (the
  // first-wins registry resolves them to the Sklik provider and the `_sklik`
  // tenant). Adding an explicit Sklik target here would sync that tenant twice.
  const targets = planSyncTargets({
    accounts: [],
    projects: [{ id: "pA", type: "eshop", sklikLinked: true }],
    hasSklik: true,
  });
  assert.deepEqual(targets, [
    { customerId: null, projectId: "pA", projectType: "eshop", reason: "no-project-fallback" },
  ]);
});

test("planSyncTargets: the single-project fallback user also gains their Sklik target", () => {
  const targets = planSyncTargets({
    accounts: [{ customerId: "1111111111" }],
    projects: [{ id: "pA", type: "eshop", sklikLinked: true }],
    hasSklik: true,
  });
  assert.deepEqual(
    targets.map((t) => ({ c: t.customerId, s: t.source, r: t.reason })),
    [
      { c: "1111111111", s: undefined, r: "single-project-fallback" },
      { c: null, s: "sklik", r: "linked" },
    ]
  );
});

test("buildSyncPairs: the extra Sklik pair carries the project and a null account", () => {
  const pairs = buildSyncPairs({
    userId: "u1",
    accounts: [{ customerId: "1111111111", customerName: "Acme" }],
    projects: [
      { id: "pA", name: "Acme", type: "eshop", accentColor: "#000", adsCustomerId: "1111111111", sklikLinked: true, createdAt: "", updatedAt: "" },
    ],
    hasSklik: true,
  });
  assert.equal(pairs.length, 2);
  const sklikPair = pairs.find((p) => p.target.source === "sklik");
  assert.equal(sklikPair.account, null); // Sklik has no per-account id to hydrate
  assert.equal(sklikPair.project.id, "pA");
  // …and the Google pair still hydrates its account, exactly as before.
  assert.equal(pairs.find((p) => !p.target.source).account.customerId, "1111111111");
});
