/** Two-axis lead scoring (src/lib/leads/score.ts): fit and engagement stay
 *  SEPARATE, the BANT half is the reused speed-lead scorer, the recency decay
 *  halves every 30 days, and the grade is the plain 2×2. Pure: no db, no clock. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { fitScore, engagementScore, gradeFor, recencyFactor, scoreContact, scoreRank, RECENCY_HALF_LIFE_DAYS } =
  await import("@/lib/leads/score");
const { qualificationScore } = await import("@/lib/speed-lead/qualification");

const NOW = new Date("2026-08-22T12:00:00.000Z");

const baseContact = (over = {}) => ({
  email: "jan@stavbyprofi.cz",
  phone: "+420777123456",
  companyName: "Stavby Profi",
  notes: "",
  attribution: { source: "google-ads" },
  tags: [],
  ...over,
});

const offering = (over = {}) => ({
  kind: "service",
  id: "o1",
  projectId: "p1",
  name: "Rekonstrukce střechy",
  category: "Střechy",
  active: true,
  nature: "local",
  price: 250000,
  currency: "CZK",
  channels: [],
  tags: ["střecha", "izolace"],
  source: "manual",
  updatedAt: NOW.toISOString(),
  priceModel: "from",
  serviceAreas: [],
  ...over,
});

test("fit: reachability, company and channel all move the score in the stated direction", () => {
  const full = fitScore({ contact: baseContact() });
  const emailOnly = fitScore({ contact: baseContact({ phone: undefined, companyName: undefined }) });
  assert.ok(full > emailOnly, "more identity + a company must score higher");

  const cold = fitScore({ contact: baseContact({ attribution: { source: "import" } }) });
  const referral = fitScore({ contact: baseContact({ attribution: { source: "referral" } }) });
  assert.ok(referral > cold, "a referral must outrank a bulk import");
});

test("fit: the catalog Offering spine grounds the service match", () => {
  const contact = baseContact({ notes: "Potřebuji rekonstrukce střechy na 180 m2." });
  const withCatalog = fitScore({ contact, offerings: [offering()] });
  const noMatch = fitScore({
    contact,
    offerings: [offering({ name: "Účetnictví", category: "Finance", tags: ["daně"] })],
  });
  assert.ok(withCatalog > noMatch, "an enquiry matching what we sell must score higher");
});

test("fit: a project with no catalog is not punished — the component is dropped, not zeroed", () => {
  const contact = baseContact({ notes: "Poptávka" });
  const noCatalog = fitScore({ contact });
  const missCatalog = fitScore({
    contact,
    offerings: [offering({ name: "Účetnictví", category: "Finance", tags: ["daně"] })],
  });
  assert.ok(noCatalog > missCatalog, "an unconfigured catalog must not read as a bad match");
});

test("engagement: the BANT half IS speed-lead's qualificationScore (not a fork)", () => {
  const q = { timeline: "asap", budget: "confirmed", scope: "large", disposition: "hot" };
  assert.equal(qualificationScore(q), 100);
  // Perfect BANT + zero behaviour lands at half — neither axis can carry alone.
  const eng = engagementScore({ qualification: q, activities: [], now: NOW, lastActivityAt: NOW.toISOString() });
  assert.equal(eng, 50);
});

test("engagement: behaviour alone also caps at half, and both together reach 100", () => {
  const activities = [
    { id: "a", at: NOW.toISOString(), kind: "inbound_message", actor: { type: "connector" }, summary: "x" },
    { id: "b", at: NOW.toISOString(), kind: "inbound_message", actor: { type: "connector" }, summary: "x" },
    { id: "c", at: NOW.toISOString(), kind: "inbound_message", actor: { type: "connector" }, summary: "x" },
    { id: "d", at: NOW.toISOString(), kind: "inbound_message", actor: { type: "connector" }, summary: "x" },
    { id: "e", at: NOW.toISOString(), kind: "meeting", actor: { type: "user" }, summary: "x" },
  ];
  const behaviourOnly = engagementScore({
    activities,
    firstRespondedAt: NOW.toISOString(),
    lastActivityAt: NOW.toISOString(),
    now: NOW,
  });
  assert.equal(behaviourOnly, 50);

  const both = engagementScore({
    qualification: { timeline: "asap", budget: "confirmed", scope: "large", disposition: "hot" },
    activities,
    firstRespondedAt: NOW.toISOString(),
    lastActivityAt: NOW.toISOString(),
    now: NOW,
  });
  assert.equal(both, 100);
});

test("recency decay halves every 30 days and never punishes missing data", () => {
  assert.equal(recencyFactor(undefined, NOW), 1);
  assert.equal(recencyFactor("not-a-date", NOW), 1);
  assert.equal(recencyFactor(NOW.toISOString(), NOW), 1);
  const thirtyDaysAgo = new Date(NOW.getTime() - RECENCY_HALF_LIFE_DAYS * 86_400_000).toISOString();
  assert.ok(Math.abs(recencyFactor(thirtyDaysAgo, NOW) - 0.5) < 1e-9);
  const sixtyDaysAgo = new Date(NOW.getTime() - 2 * RECENCY_HALF_LIFE_DAYS * 86_400_000).toISOString();
  assert.ok(Math.abs(recencyFactor(sixtyDaysAgo, NOW) - 0.25) < 1e-9);
});

test("engagement decays: the same lead is worth less after a month of silence", () => {
  const q = { timeline: "asap", budget: "confirmed", scope: "large", disposition: "hot" };
  const fresh = engagementScore({ qualification: q, lastActivityAt: NOW.toISOString(), now: NOW });
  const stale = engagementScore({
    qualification: q,
    lastActivityAt: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
    now: NOW,
  });
  assert.equal(stale, Math.round(fresh * 0.5));
});

test("grade is the plain 2×2, with fit breaking the tie (B over C)", () => {
  assert.equal(gradeFor(80, 80), "A");
  assert.equal(gradeFor(80, 10), "B");
  assert.equal(gradeFor(10, 80), "C");
  assert.equal(gradeFor(10, 10), "D");
  // The boundary is inclusive on both axes.
  assert.equal(gradeFor(60, 60), "A");
  assert.equal(gradeFor(59, 60), "C");
});

test("scoreContact is deterministic and returns BOTH axes, never one number", () => {
  const input = {
    contact: baseContact({ notes: "Rekonstrukce střechy" }),
    offerings: [offering()],
    qualification: { timeline: "asap", budget: "confirmed", scope: "large", disposition: "hot" },
    lastActivityAt: NOW.toISOString(),
    now: NOW,
  };
  const a = scoreContact(input);
  const b = scoreContact(input);
  assert.deepEqual(a, b);
  assert.equal(typeof a.fit, "number");
  assert.equal(typeof a.engagement, "number");
  assert.ok(["A", "B", "C", "D"].includes(a.grade));
  assert.equal(a.computedAt, NOW.toISOString());
});

test("scoreRank orders A→D and is negative for an unscored contact", () => {
  const mk = (grade, fit, engagement) => ({ grade, fit, engagement, computedAt: NOW.toISOString() });
  assert.ok(scoreRank(mk("A", 60, 60)) > scoreRank(mk("B", 100, 0)));
  assert.ok(scoreRank(mk("B", 100, 0)) > scoreRank(mk("C", 0, 100)));
  assert.ok(scoreRank(mk("C", 0, 100)) > scoreRank(mk("D", 50, 50)));
  assert.equal(scoreRank(undefined), -1);
});
