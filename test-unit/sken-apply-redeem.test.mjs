/** WP W2-B — the two halves of "a claimed scan becomes a seeded project".
 *
 *  (1) `applyScanToProject` — the seeding logic lifted out of
 *      POST /api/projects/[id]/onboarding so the public redeem path runs the SAME
 *      code instead of a second copy of it. What is pinned is exactly what a copy
 *      would have got wrong: competitors MERGE (a curated list is never wiped), the
 *      keyword seed is idempotent per tenant, and the onboarding state is saved
 *      exactly ONCE even when a flag rides along with the scan.
 *
 *  (2) `POST /api/sken/redeem` — the authed door. Every write keys off
 *      `currentUserId()` (ADR-0002); the token carries a profile, never an owner.
 *      Consuming it first is what makes the route idempotent: a second POST of the
 *      same token 404s rather than minting a second project.
 *
 *  The stores are module-mocked (in-memory), so this covers the choreography — what
 *  is written, in what order, how many times — with no database.
 *  Run with --experimental-test-module-mocks. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

// --- in-memory stand-ins ------------------------------------------------------
let onboardingRows = new Map(); // projectId → OnboardingState
let saveOnboardingCalls = [];
let competitorRows = new Map(); // projectId → { competitors, updatedAt }
let keywordLists = new Map(); // tenant → KeywordList[]
let projects = [];
let offerings = [];
let activity = [];
let claims = new Map(); // token → ScanClaim
let consumed = [];
let skenClaimCounted = 0;
let currentUser = null;

mock.module("@/lib/onboarding/store", {
  namedExports: {
    getOnboarding: async (projectId) => onboardingRows.get(projectId) ?? null,
    saveOnboarding: async (projectId, state) => {
      saveOnboardingCalls.push({ projectId, state });
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
    createProject: async (userId, input) => {
      const project = {
        id: `p${projects.length + 1}`,
        userId,
        name: input.name,
        type: input.type,
        accentColor: "#123456",
        ...(input.domain ? { domain: input.domain } : {}),
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
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
  namedExports: {
    emitProjectActivity: async (uid, projectId, entry) => {
      activity.push({ uid, projectId, ...entry });
    },
  },
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

const { applyScanToProject } = await import("@/lib/onboarding/apply");
const { SCAN_LIST_SEED } = await import("@/lib/onboarding/seed");
const { POST: redeem } = await import("@/app/api/sken/redeem/route");

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

function reset() {
  onboardingRows = new Map();
  saveOnboardingCalls = [];
  competitorRows = new Map();
  keywordLists = new Map();
  projects = [];
  offerings = [];
  activity = [];
  claims = new Map();
  consumed = [];
  skenClaimCounted = 0;
  currentUser = null;
}

const post = (body) =>
  redeem(
    new Request("http://localhost/api/sken/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

// --- (1) applyScanToProject ---------------------------------------------------

test("apply: one onboarding write, the profile stamped applied, competitors merged, keywords seeded", async () => {
  reset();
  competitorRows.set("p1", { competitors: [{ name: "Existující", source: "user" }], updatedAt: "x" });

  const out = await applyScanToProject("u1", { id: "p1" }, PROFILE, { now: "2026-08-29T10:00:00.000Z" });

  assert.equal(saveOnboardingCalls.length, 1, "the onboarding state is saved exactly once");
  assert.equal(out.state.scanApplied, true);
  assert.equal(out.state.scan.appliedAt, "2026-08-29T10:00:00.000Z", "the apply stamps its own timestamp");
  assert.equal(out.state.scan.businessName, "Mionelo");

  const stored = competitorRows.get("p1").competitors;
  assert.ok(
    stored.some((c) => c.name === "Existující"),
    "MERGE, never replace — a curated entry survives an apply"
  );
  assert.ok(stored.some((c) => c.name === "Kinderkraft"), "the scan's suggestion lands too");
  assert.equal(out.competitors.suggested, 1, "the merge outcome is reported, not swallowed");

  const lists = keywordLists.get("u_u1_proj_p1");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].seed, SCAN_LIST_SEED, "the seeded list is tagged as scan-originated");
  assert.equal(lists[0].keywords.length, 2);
});

test("apply: the keyword seed is idempotent — re-applying never duplicates the list", async () => {
  reset();
  await applyScanToProject("u1", { id: "p1" }, PROFILE);
  await applyScanToProject("u1", { id: "p1" }, PROFILE);
  assert.equal(keywordLists.get("u_u1_proj_p1").length, 1, "the second apply skips the existing scan list");
  assert.equal(saveOnboardingCalls.length, 2, "…while the profile itself is re-saved");
});

test("apply: a flag riding along with the scan is folded into the SAME write", async () => {
  reset();
  const out = await applyScanToProject("u1", { id: "p1" }, PROFILE, { extra: { dismissed: true } });
  assert.equal(saveOnboardingCalls.length, 1, "still one write");
  assert.equal(out.state.dismissed, true);
  assert.equal(out.state.scanApplied, true);
});

// --- (2) POST /api/sken/redeem ------------------------------------------------

test("redeem: anonymous is 401 and never touches the claim", async () => {
  reset();
  claims.set("a".repeat(32), { token: "a".repeat(32), profile: PROFILE, createdAt: "now" });
  const res = await post({ token: "a".repeat(32) });
  assert.equal(res.status, 401);
  assert.equal(consumed.length, 0, "an unauthenticated caller must not spend a token");
  assert.equal(projects.length, 0);
});

test("redeem: a missing token is a 400, an unknown one a 404", async () => {
  reset();
  currentUser = "u1";
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ token: "b".repeat(32) })).status, 404);
  assert.equal(projects.length, 0, "no project is created on either path");
});

test("redeem: one call creates the project and seeds it exactly as the in-app apply would", async () => {
  reset();
  currentUser = "u1";
  const token = "c".repeat(32);
  claims.set(token, { token, profile: PROFILE, suggestedType: "eshop", createdAt: "2026-08-29T00:00:00.000Z" });

  const res = await post({ token });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.projectId, "p1");

  assert.equal(projects.length, 1, "a project row exists");
  assert.equal(projects[0].name, "Mionelo", "named from the scan");
  assert.equal(projects[0].type, "eshop", "typed from the scan's own suggestion");
  assert.equal(projects[0].domain, "mionelo.cz", "the domain is the scanned host, www stripped");

  assert.equal(onboardingRows.get("p1").scanApplied, true, "the onboarding row says the scan was applied");
  assert.ok(competitorRows.get("p1").competitors.some((c) => c.name === "Kinderkraft"), "competitors seeded");
  assert.equal(keywordLists.get("u_u1_proj_p1")[0].seed, SCAN_LIST_SEED, "keyword list seeded");
  assert.equal(offerings.length, 1, "the starter catalog is seeded too");
  assert.equal(activity.length, 1, "…and the creation is logged");
  assert.equal(skenClaimCounted, 1, "the funnel counts one completed claim");
});

test("redeem: single use — the second redeem of a consumed token is a 404", async () => {
  reset();
  currentUser = "u1";
  const token = "d".repeat(32);
  claims.set(token, { token, profile: PROFILE, suggestedType: "eshop", createdAt: "2026-08-29T00:00:00.000Z" });

  assert.equal((await post({ token })).status, 201);
  assert.equal((await post({ token })).status, 404, "the token is spent");
  assert.equal(projects.length, 1, "no second project is minted");
  assert.equal(skenClaimCounted, 1, "…and the funnel is not double-counted");
});

test("redeem: an unrecognized suggested type falls back to the honest default", async () => {
  reset();
  currentUser = "u1";
  const token = "e".repeat(32);
  claims.set(token, {
    token,
    profile: { ...PROFILE, businessName: "", scannedUrl: "not a url" },
    suggestedType: "shop",
    createdAt: "2026-08-29T00:00:00.000Z",
  });

  assert.equal((await post({ token })).status, 201);
  assert.equal(projects[0].type, "content", "a stored type that is not a ProjectType never reaches the store");
  assert.equal(projects[0].domain, undefined, "an unparseable URL yields no domain rather than a bad one");
  assert.equal(projects[0].name, "Nový projekt", "…and the project still gets a display name");
});
