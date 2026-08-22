/** THE UNIFICATION PROOF (src/lib/leads/aggregate.ts). The whole point of the lead
 *  entity layer is that it does NOT create a second funnel: real contacts must
 *  produce the same `LeadSource[]` shape `lead-quality/compute.ts` already consumes,
 *  and that math must run over them UNCHANGED. This suite asserts exactly that —
 *  the stage projection, the cumulative roll-up at the OLD ranks, and a full
 *  round-trip through withMetrics / summarize / sourceFunnel / avgVelocity. Pure. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { contactsToLeadSources, sourceLabel, velocityFor } = await import("@/lib/leads/aggregate");
const { toLeadStage, PIPELINE_RANK, PIPELINE_STAGES } = await import("@/lib/leads/types");
const { STAGE_RANK } = await import("@/lib/lead-quality/types");
const { withMetrics, summarize, funnelBySource, avgVelocity, sourceAlerts } = await import(
  "@/lib/lead-quality/compute"
);
const { aggregateLeads } = await import("@/lib/lead-quality/import");

const contact = (over = {}) => ({
  id: over.id ?? "c1",
  projectId: "p1",
  stage: "new",
  stageEnteredAt: "2026-08-01T00:00:00.000Z",
  attribution: { source: "google-ads" },
  consent: [],
  tags: [],
  firstSeenAt: "2026-08-01T00:00:00.000Z",
  lastActivityAt: "2026-08-01T00:00:00.000Z",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

test("toLeadStage projects the superset back onto the funnel's four stages", () => {
  assert.equal(toLeadStage("new"), "lead");
  assert.equal(toLeadStage("working"), "lead");
  assert.equal(toLeadStage("lead"), "lead");
  assert.equal(toLeadStage("qualified"), "qualified");
  assert.equal(toLeadStage("opportunity"), "opportunity");
  assert.equal(toLeadStage("won"), "won");
  // Terminal negatives are OUTSIDE the cumulative funnel.
  assert.equal(toLeadStage("lost"), null);
  assert.equal(toLeadStage("disqualified"), null);
  // Every declared stage is handled — no silent undefined.
  for (const s of PIPELINE_STAGES) {
    assert.notEqual(toLeadStage(s), undefined, `${s} must be projected`);
  }
});

test("the OLD FOUR keep their STAGE_RANK values, so the two tiers cannot desync", () => {
  for (const s of ["lead", "qualified", "opportunity", "won"]) {
    assert.equal(PIPELINE_RANK[s], STAGE_RANK[s], `${s} rank must match lead-quality`);
  }
  assert.equal(PIPELINE_RANK.new, 0);
  assert.equal(PIPELINE_RANK.working, 0);
  assert.equal(PIPELINE_RANK.lost, -1);
  assert.equal(PIPELINE_RANK.disqualified, -1);
});

test("sourceLabel is DERIVED from (source, campaign) and never mangles a custom name", () => {
  assert.equal(sourceLabel({ source: "google-ads" }), "Google Ads");
  assert.equal(sourceLabel({ source: "google-ads", campaign: "Brand" }), "Google Ads – Brand");
  assert.equal(sourceLabel({ source: "Můj vlastní kanál" }), "Můj vlastní kanál");
  assert.equal(sourceLabel(undefined), "Neurčeno");
});

test("counts roll up cumulatively — a won contact also counted as qualified + opportunity", () => {
  const rows = contactsToLeadSources([
    contact({ id: "a", stage: "new" }),
    contact({ id: "b", stage: "working" }),
    contact({ id: "c", stage: "qualified" }),
    contact({ id: "d", stage: "opportunity" }),
    contact({ id: "e", stage: "won" }),
  ]);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.source, "Google Ads");
  assert.equal(r.leads, 5);
  assert.equal(r.qualified, 3);
  assert.equal(r.opportunities, 2);
  assert.equal(r.won, 1);
  // No ad spend is invented from a CRM.
  assert.equal(r.spend, 0);
});

test("terminal negatives count as ARRIVED but progress nowhere (win rates stay honest)", () => {
  const rows = contactsToLeadSources([
    contact({ id: "a", stage: "won" }),
    contact({ id: "b", stage: "lost" }),
    contact({ id: "c", stage: "disqualified" }),
  ]);
  assert.equal(rows[0].leads, 3);
  assert.equal(rows[0].qualified, 1);
  assert.equal(rows[0].won, 1);

  const excluded = contactsToLeadSources(
    [contact({ id: "a", stage: "won" }), contact({ id: "b", stage: "lost" })],
    [],
    { countTerminal: false }
  );
  assert.equal(excluded[0].leads, 1);
});

test("the opportunity stage appears only where the data actually tracks it", () => {
  const noOpp = contactsToLeadSources([contact({ id: "a", stage: "won" }), contact({ id: "b", stage: "qualified" })]);
  assert.equal(noOpp[0].opportunities, undefined, "must not sprout a redundant opportunity===won step");
  const withOpp = contactsToLeadSources([contact({ id: "a", stage: "opportunity" })]);
  assert.equal(withOpp[0].opportunities, 1);
});

test("revenue comes from WON deals, per contact (a repeat enquirer cannot double-count)", () => {
  const contacts = [contact({ id: "a", stage: "won" }), contact({ id: "b", stage: "won" })];
  const deals = [
    { id: "d1", projectId: "p1", contactId: "a", title: "x", value: 100_000, currency: "CZK", stage: "won", createdAt: "", updatedAt: "" },
    { id: "d2", projectId: "p1", contactId: "a", title: "y", value: 50_000, currency: "CZK", stage: "won", createdAt: "", updatedAt: "" },
    { id: "d3", projectId: "p1", contactId: "b", title: "z", value: 10_000, currency: "CZK", stage: "lost", createdAt: "", updatedAt: "" },
  ];
  const rows = contactsToLeadSources(contacts, deals);
  assert.equal(rows[0].revenue, 150_000, "lost deals contribute nothing");
});

test("real velocity comes from stage_change activities — the thing an import cannot give", () => {
  const c = contact({ id: "a", stage: "won", firstSeenAt: "2026-08-01T00:00:00.000Z" });
  const timeline = [
    { id: "1", at: "2026-08-05T00:00:00.000Z", kind: "stage_change", actor: { type: "user" }, summary: "", refs: { to: "qualified" } },
    { id: "2", at: "2026-08-25T00:00:00.000Z", kind: "stage_change", actor: { type: "user" }, summary: "", refs: { to: "won" } },
  ];
  const v = velocityFor(c, timeline);
  assert.equal(v.toQualify, 4);
  assert.equal(v.toClose, 20);

  const rows = contactsToLeadSources([c], [], { timelines: new Map([["a", timeline]]) });
  assert.equal(rows[0].daysToQualify, 4);
  assert.equal(rows[0].daysToClose, 20);

  // Without timelines the fields are OMITTED, never invented.
  const bare = contactsToLeadSources([c]);
  assert.equal(bare[0].daysToQualify, undefined);
  assert.equal(bare[0].daysToClose, undefined);
});

test("GDPR tombstones stay in the counts by default (Art. 17 ≠ rewriting statistics)", () => {
  const contacts = [
    contact({ id: "a", stage: "won" }),
    contact({ id: "b", stage: "lead", erasedAt: "2026-08-10T00:00:00.000Z", eraseReason: "gdpr" }),
  ];
  assert.equal(contactsToLeadSources(contacts)[0].leads, 2);
  assert.equal(contactsToLeadSources(contacts, [], { includeErased: false })[0].leads, 1);
});

test("ROUND-TRIP: contacts feed compute.ts unchanged — withMetrics/summarize/funnel/velocity", () => {
  const contacts = [
    contact({ id: "a", stage: "won", attribution: { source: "google-ads", campaign: "Brand" } }),
    contact({ id: "b", stage: "qualified", attribution: { source: "google-ads", campaign: "Brand" } }),
    contact({ id: "c", stage: "opportunity", attribution: { source: "google-ads", campaign: "Brand" } }),
    contact({ id: "d", stage: "new", attribution: { source: "google-ads", campaign: "Brand" } }),
    contact({ id: "e", stage: "won", attribution: { source: "referral" } }),
    contact({ id: "f", stage: "lost", attribution: { source: "referral" } }),
  ];
  const deals = [
    { id: "d1", projectId: "p1", contactId: "a", title: "x", value: 400_000, currency: "CZK", stage: "won", createdAt: "", updatedAt: "" },
    { id: "d2", projectId: "p1", contactId: "e", title: "y", value: 120_000, currency: "CZK", stage: "won", createdAt: "", updatedAt: "" },
  ];
  const sources = contactsToLeadSources(contacts, deals, {
    spendByLabel: { "Google Ads – Brand": 40_000 },
  });

  // Shape parity with the aggregate importer's output.
  const importedShape = Object.keys(
    aggregateLeads([{ source: "Google Ads – Brand", stage: "won", at: "2026-08-01", value: 1 }])[0]
  );
  for (const key of importedShape) {
    assert.ok(key in sources[0], `contactsToLeadSources must emit "${key}" like aggregateLeads`);
  }

  // The pure funnel math runs over it with ZERO changes.
  const metrics = sources.map(withMetrics);
  assert.equal(metrics.length, 2);
  const ads = metrics.find((m) => m.source === "Google Ads – Brand");
  assert.equal(ads.leads, 4);
  assert.equal(ads.qualified, 3);
  assert.equal(ads.won, 1);
  assert.equal(ads.cpl, 10_000);
  assert.ok(ads.qualityScore > 0);

  const summary = summarize(sources);
  assert.equal(summary.leads, 6);
  assert.equal(summary.won, 2);
  assert.equal(sources.reduce((a, s) => a + s.revenue, 0), 520_000);

  const funnels = funnelBySource(sources, "cs");
  assert.equal(funnels.length, 2);
  assert.ok(funnels[0].stages.length > 0);

  // These must simply not throw over contact-derived rows.
  avgVelocity(sources);
  sourceAlerts(sources[0]);
});
