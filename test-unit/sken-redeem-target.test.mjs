/** onboarding-B — a /sken scan claimed by someone who already owns the scanned site
 *  goes INTO that project on request, instead of silently minting a duplicate.
 *
 *  Three layers are pinned:
 *   (1) `matchProjectsByDomain` (src/lib/onboarding/redeem-plan.ts) — pure. A stored
 *       domain is the raw string a user typed, so scheme, www, case and path are
 *       normalized on BOTH sides, and a project with no domain never matches.
 *   (2) POST /api/sken/redeem with `chooser` / `target` — the route PEEKS at the claim
 *       (getScanClaim) before it decides, so offering the choice never spends the
 *       token; a merge goes through applyScanToProject (the same seam as a new
 *       project's seed) and never through provisioning (no starter catalog, no row).
 *       A caller that sends no `chooser` gets today's behaviour — that is what lets
 *       the client half of the change revert on its own.
 *   (3) `phaseForRedeemResponse` / `claimNextStep` (src/components/marketing/sken/
 *       claim-phase.ts) — pure. The response-to-phase map, and the rule that the
 *       claim leg tries the redeem BEFORE sign-in, so a signed-in visitor never leaves.
 *
 *  Stores are module-mocked in memory, in the sken-apply-redeem idiom.
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// --- in-memory stand-ins ------------------------------------------------------
let onboardingRows = new Map();
let competitorRows = new Map();
let keywordLists = new Map();
let projects = [];
let offerings = [];
let claims = new Map();
let consumed = [];
let skenClaimCounted = 0;
let currentUser = null;
let failSaveOnboarding = false;
let restored = [];

mock.module("@/lib/onboarding/store", {
  namedExports: {
    getOnboarding: async (projectId) => onboardingRows.get(projectId) ?? null,
    saveOnboarding: async (projectId, state) => {
      if (failSaveOnboarding) throw new Error("onboarding store down");
      onboardingRows.set(projectId, state);
    },
    clearOnboarding: async (projectId) => {
      onboardingRows.delete(projectId);
    },
  },
});

mock.module("@/lib/competitors/store", {
  namedExports: {
    getCompetitors: async (projectId) => competitorRows.get(projectId) ?? null,
    saveCompetitors: async (projectId, doc) => {
      competitorRows.set(projectId, doc);
    },
  },
});

mock.module("@/lib/campaigns/connector", {
  namedExports: { resolveTenant: async (uid, projectId) => `u_${uid}_proj_${projectId}` },
});

mock.module("@/lib/keywords/store", {
  namedExports: {
    listKeywordLists: async (tenant) => keywordLists.get(tenant) ?? [],
    saveKeywordList: async (tenant, input) => {
      const list = { id: `kl_${(keywordLists.get(tenant) ?? []).length}`, ...input };
      keywordLists.set(tenant, [...(keywordLists.get(tenant) ?? []), list]);
      return list;
    },
  },
});

mock.module("@/lib/session", { namedExports: { currentUserId: async () => currentUser } });

mock.module("@/lib/projects/store", {
  namedExports: {
    listProjects: async (userId) => projects.filter((p) => p.userId === userId),
    getProject: async (userId, projectId) => projects.find((p) => p.userId === userId && p.id === projectId) ?? null,
    createProject: async (userId, input) => {
      const project = {
        id: `p${projects.length + 1}`,
        userId,
        name: input.name,
        type: input.type,
        accentColor: "#123456",
        ...(input.domain ? { domain: input.domain } : {}),
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z",
      };
      projects.push(project);
      return project;
    },
  },
});

mock.module("@/lib/catalog/store", {
  namedExports: {
    saveOfferings: async (uid, projectId, items) => {
      offerings.push({ uid, projectId, count: items.length });
    },
  },
});

mock.module("@/lib/catalog/starter", {
  namedExports: {
    defaultNatureFor: () => "online",
    starterCatalog: () => [{ id: "o1" }],
  },
});

mock.module("@/lib/activity/emit", {
  namedExports: { emitProjectActivity: async () => {} },
});

mock.module("@/lib/onboarding/claim-store", {
  namedExports: {
    consumeScanClaim: async (token) => {
      consumed.push(token);
      const claim = claims.get(token);
      if (!claim) return null;
      claims.delete(token);
      return claim;
    },
    createScanClaim: async () => {
      throw new Error("not used in this suite");
    },
    getScanClaim: async (token) => claims.get(token) ?? null,
    restoreScanClaim: async (claim) => {
      restored.push(claim.token);
      claims.set(claim.token, claim);
      return true;
    },
    pruneScanClaims: async () => 0,
  },
});

mock.module("@/lib/onboarding/sken-track", {
  namedExports: {
    recordSkenScan: async () => {},
    recordSkenClaim: async () => {
      skenClaimCounted += 1;
    },
  },
});

const { matchProjectsByDomain } = await import("@/lib/onboarding/redeem-plan");
const { phaseForRedeemResponse, claimNextStep } = await import("@/components/marketing/sken/claim-phase");
const { POST: redeem } = await import("@/app/api/sken/redeem/route");
const { getScanClaim } = await import("@/lib/onboarding/claim-store");

const PROFILE = {
  businessName: "Mionelo",
  summary: "Prodej dětských autosedaček.",
  offering: "Autosedačky a kočárky",
  audience: "Rodiče malých dětí",
  toneOfVoice: "Přátelský",
  keywords: ["autosedačka", "kočárek"],
  competitors: ["Kinderkraft"],
  suggestedType: "eshop",
  scannedUrl: "https://www.mionelo.cz/",
};

const TOKEN = "a".repeat(32);

/** u1 owns p1 ("Mionelo", mionelo.cz) with a curated competitor list; a claim for
 *  www.mionelo.cz is parked under TOKEN. */
function seed() {
  onboardingRows = new Map();
  competitorRows = new Map();
  keywordLists = new Map();
  offerings = [];
  claims = new Map();
  consumed = [];
  skenClaimCounted = 0;
  failSaveOnboarding = false;
  restored = [];
  currentUser = "u1";
  projects = [
    {
      id: "p1",
      userId: "u1",
      name: "Mionelo",
      type: "eshop",
      domain: "mionelo.cz",
      accentColor: "#123456",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];
  competitorRows.set("p1", { competitors: [{ name: "Kurátor s.r.o.", source: "user" }], updatedAt: "x" });
  claims.set(TOKEN, { token: TOKEN, profile: PROFILE, suggestedType: "eshop", createdAt: "2026-09-24T00:00:00.000Z" });
}

const post = (body) =>
  redeem(
    new Request("http://localhost/api/sken/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

// --- (1) the domain match -----------------------------------------------------

test("match: scheme, www, case and path are normalized on both sides; no domain never matches", () => {
  const got = matchProjectsByDomain(
    [{ id: "p1", domain: "https://www.Mionelo.cz/" }, { id: "p2", domain: "other.cz" }, { id: "p3" }],
    "https://mionelo.cz/kontakt"
  );
  assert.deepEqual(
    got.map((p) => p.id),
    ["p1"]
  );
  assert.deepEqual(matchProjectsByDomain([{ id: "p3" }], undefined), [], "no scanned URL matches nothing");
  assert.deepEqual(matchProjectsByDomain([{ id: "p4", domain: "" }], "https://x.cz"), [], "an empty domain is no domain");
});

// --- (2) the redeem route -----------------------------------------------------

test("redeem: an owner of the scanned site is offered the choice — 409, token NOT spent, nothing created", async () => {
  seed();
  const res = await post({ token: TOKEN, chooser: true });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, "choose-target");
  assert.deepEqual(body.candidates, [{ id: "p1", name: "Mionelo", domain: "mionelo.cz", type: "eshop" }]);
  assert.ok(await getScanClaim(TOKEN), "the claim is still redeemable");
  assert.equal(consumed.length, 0, "offering a choice never consumes");
  assert.equal(projects.length, 1, "no project is created");
  assert.equal(skenClaimCounted, 0, "an offered choice is not a completed claim");
});

test("redeem: target=<own project> merges into it — 200, no new row, no starter catalog, curated list kept", async () => {
  seed();
  const res = await post({ token: TOKEN, target: "p1" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.projectId, "p1");
  assert.equal(body.merged, true);
  assert.equal(projects.length, 1, "still one project");
  const names = competitorRows.get("p1").competitors.map((c) => c.name);
  assert.ok(names.includes("Kurátor s.r.o."), "the curated competitor survives");
  assert.ok(names.includes("Kinderkraft"), "…next to the scanned one");
  assert.equal(onboardingRows.get("p1").scanApplied, true, "the scan is applied to p1");
  assert.equal(offerings.length, 0, "saveOfferings (the starter catalog) is NOT called on a merge");
  assert.equal(await getScanClaim(TOKEN), null, "the token is consumed");
  assert.equal(skenClaimCounted, 1, "the funnel counts the merged claim");
});

test("redeem: a target the caller does not own is a 404 unknown-target and the claim stays redeemable", async () => {
  seed();
  const res = await post({ token: TOKEN, chooser: true, target: "pX" });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "unknown-target");
  assert.ok(await getScanClaim(TOKEN), "not consumed");
  assert.equal(consumed.length, 0);
  assert.equal(projects.length, 1);
});

test("redeem: target=new while a project matches — 201 and a second project (an explicit choice is honoured)", async () => {
  seed();
  const res = await post({ token: TOKEN, chooser: true, target: "new" });
  assert.equal(res.status, 201);
  assert.equal(projects.length, 2, "a second project is created");
  assert.equal((await res.json()).projectId, "p2");
  assert.equal(await getScanClaim(TOKEN), null, "the token is consumed");
});

test("redeem: chooser with no domain match — 201 and a new project, as today", async () => {
  seed();
  projects[0].domain = "jiny-web.cz";
  const res = await post({ token: TOKEN, chooser: true });
  assert.equal(res.status, 201);
  assert.equal(projects.length, 2);
  assert.equal(offerings.length, 1, "a new project still gets its starter catalog");
});

test("redeem: no chooser (an older client) — a matching owner still gets 201 and a new project", async () => {
  seed();
  const res = await post({ token: TOKEN });
  assert.equal(res.status, 201, "the 409 is opt-in, so reverting the client half cannot strand a visitor");
  assert.equal(projects.length, 2);
  assert.equal(await getScanClaim(TOKEN), null, "the token is consumed");
});

test("redeem: a failed merge puts the claim back and answers 503 redeem-retry", async () => {
  seed();
  failSaveOnboarding = true;
  const res = await post({ token: TOKEN, target: "p1" });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "redeem-retry");
  assert.ok(await getScanClaim(TOKEN), "the apply is idempotent, so the same token may retry it");
  assert.equal(projects.length, 1);
  assert.equal(skenClaimCounted, 0);
});

// --- (3) the client's pure state machine --------------------------------------

test("phase: the redeem answer maps to one phase each", () => {
  const c = { id: "p1", name: "Mionelo", domain: "mionelo.cz", type: "eshop" };
  assert.deepEqual(phaseForRedeemResponse(409, { code: "choose-target", candidates: [c] }), {
    phase: "choosing",
    candidates: [c],
  });
  assert.deepEqual(phaseForRedeemResponse(401, null), { phase: "needs-signin" });
  assert.deepEqual(phaseForRedeemResponse(404, null), { phase: "expired" });
  assert.deepEqual(phaseForRedeemResponse(201, { projectId: "p9" }), { phase: "done", href: "/app/p9/start" });
  assert.deepEqual(phaseForRedeemResponse(200, { projectId: "p1", merged: true }), {
    phase: "done",
    href: "/app/p1/start",
  });
  assert.deepEqual(phaseForRedeemResponse(503, null), { phase: "redeem-retry" });
  assert.deepEqual(
    phaseForRedeemResponse(404, { code: "unknown-target" }),
    { phase: "redeem-retry" },
    "a vanished target keeps the claim — retry re-asks rather than calling the scan expired"
  );
  assert.deepEqual(phaseForRedeemResponse(409, { code: "choose-target", candidates: [] }), { phase: "failed" });
});

test("claim leg: redeem first, sign in only on a 401", () => {
  assert.equal(claimNextStep(401), "sign-in");
  assert.equal(claimNextStep(201), "navigate");
  assert.equal(claimNextStep(200), "navigate");
  assert.equal(claimNextStep(409), "stay");
});
