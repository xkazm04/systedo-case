/** ONE lead-funnel resolver (src/lib/lead-quality/funnel-tier.ts + resolve.ts).
 *
 *  Kvalita leadů, the lead-source diagnosis click path, the weekly digest cron and the
 *  recap grounding used to each decide "which funnel is this project on" and "which
 *  ledger counts belong to which row" on their own. The CRM contacts the Leady module
 *  writes fed none of them (docs/leads/design.md §10 item 1), and the cron seeded its
 *  diagnosis WITHOUT the conversion-ledger join the page used, so every digest-origin
 *  diagnosis carried an inputDigest the page never computes and was badged stale.
 *
 *  These cases pin the pure tier choice (contacts → import → sample), the one ledger
 *  join, the one seed builder, the cache version, and the cron's two decisions: the
 *  import tier is seeded with the SAME join the page uses, and a contacts-tier funnel
 *  does NOT newly trigger the paid digest diagnosis (explicit note, zero spend units). */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-lead-funnel-tier-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";

// --- the cron's paid edges, faked so a test can COUNT them ----------------------
const spend = { guardUnits: [], refunds: [] };
const llm = { leadCalls: [], adsCalls: [] };
mock.module("@/lib/ai/durable-limit", {
  namedExports: {
    durableGuard: async (_ip, _rules, opts = {}) => {
      spend.guardUnits.push(opts.spendUnits ?? 0);
      return { ok: true, retryAfter: 0 };
    },
    refundGlobalSpend: async (units) => {
      spend.refunds.push(units);
    },
  },
});
mock.module("@/lib/ai/tools", {
  namedExports: {
    generateLeadSourceDiagnosis: async (req) => {
      llm.leadCalls.push(req);
      return {
        result: { summary: "s", likelyCause: "spam", recommendation: "r", severity: "low" },
        meta: { demo: false },
      };
    },
  },
});
mock.module("@/lib/ai/tools/ads-diagnosis", {
  namedExports: {
    generateAdsDiagnosis: async (req) => {
      llm.adsCalls.push(req);
      throw new Error("the ads arm must not run in these cases");
    },
  },
});
// The ads arm resolves nothing here (no synced portfolio) — it is not under test.
mock.module("@/lib/diagnoses/resolve-request", {
  namedExports: { resolveAdsDiagnosisRequest: async () => null },
});
// The rolled-up ledger summary, keyed `${userId}/${projectId}`.
const summaries = new Map();
mock.module("@/lib/leads/conversion-state", {
  namedExports: {
    getConversionSummary: async (userId, projectId) => summaries.get(`${userId}/${projectId}`) ?? null,
  },
});

const { pickFunnelTier, conversionsByLabelFrom, funnelSeeds, funnelVersion } = await import(
  "@/lib/lead-quality/funnel-tier"
);
const { resolveLeadFunnel } = await import("@/lib/lead-quality/resolve");
const { contactsToLeadSources } = await import("@/lib/leads/aggregate");
const { aggregateLeads } = await import("@/lib/lead-quality/import");
const { SAMPLE_SOURCES } = await import("@/lib/lead-quality/sample");
const { seedToRequest } = await import("@/lib/diagnoses/lead-source-request");
const { inputDigest } = await import("@/lib/diagnoses/types");
const { saveContact } = await import("@/lib/leads/store");
const { saveLeadImports } = await import("@/lib/lead-quality/store");
const { latestDiagnosis } = await import("@/lib/diagnoses/store");
const { runTenantDiagnoses } = await import("@/lib/diagnoses/digest-run");
const { planDigestDiagnoses, NOTE_COHORT_NO_LIVE, NOTE_LEAD_CONTACTS_TIER, NOTE_LEAD_NO_LIVE } =
  await import("@/lib/diagnoses/digest-plan");

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
const THREE = [
  contact({ id: "c1", stage: "new" }),
  contact({ id: "c2", stage: "qualified" }),
  contact({ id: "c3", stage: "won" }),
];
const row = (source, stage, at = "2026-08-02") => ({ source, stage, at });

// --- 1-4: the tier choice ------------------------------------------------------

test("contacts tier: CRM contacts win, grouped by the SAME label the ledger uses", () => {
  const tier = pickFunnelTier({ contacts: THREE, imports: null, sample: SAMPLE_SOURCES });
  assert.equal(tier.source, "contacts");
  assert.equal(tier.live, true);
  assert.deepEqual(tier.sources, contactsToLeadSources(THREE));
  assert.equal(tier.sources.length, 1);
  const g = tier.sources[0];
  assert.equal(g.source, "Google Ads");
  assert.deepEqual([g.leads, g.qualified, g.won], [3, 2, 1]);
});

test("import tier: no contacts → the stored paste, aggregated, with its syncedAt", () => {
  const items = [row("Meta", "lead"), row("Meta", "qualified")];
  const tier = pickFunnelTier({
    contacts: [],
    imports: { items, source: "import", syncedAt: "X" },
    sample: SAMPLE_SOURCES,
  });
  assert.equal(tier.source, "import");
  assert.equal(tier.live, true);
  assert.equal(tier.syncedAt, "X");
  assert.deepEqual(tier.sources, aggregateLeads(items));
});

test("contacts shadow a paste, and the shadowed paste is DISCLOSED, never dropped silently", () => {
  const items = Array.from({ length: 40 }, (_, i) => row("Sklik", i % 2 ? "lead" : "qualified"));
  const tier = pickFunnelTier({
    contacts: [contact()],
    imports: { items, source: "import", syncedAt: "X" },
    sample: SAMPLE_SOURCES,
  });
  assert.equal(tier.source, "contacts");
  assert.equal(tier.shadowedImportRows, 40);
});

test("a capped contacts scan is disclosed: the count the store holds vs the rows counted", () => {
  const tier = pickFunnelTier({ contacts: THREE, contactTotal: 5000, imports: null, sample: SAMPLE_SOURCES });
  assert.equal(tier.contactCount, 5000);
  assert.equal(tier.contactsScanned, 3);
  const whole = pickFunnelTier({ contacts: THREE, imports: null, sample: SAMPLE_SOURCES });
  assert.equal(whole.contactCount, 3);
  assert.equal(whole.contactsScanned, undefined, "no cap, no disclosure");
});

test("sample tier: nothing real → the illustrative sample, labelled not-live", () => {
  const tier = pickFunnelTier({ contacts: [], imports: null, sample: SAMPLE_SOURCES });
  assert.equal(tier.source, "sample");
  assert.equal(tier.live, false);
  assert.equal(tier.sources, SAMPLE_SOURCES);
  assert.equal(tier.version, undefined);
});

// --- 5-6: the one ledger join and the one seed builder ----------------------------

const SUMMARY = {
  qualified30d: 2,
  won30d: 1,
  gclidPct: 0.5,
  updatedAt: "2026-09-01T00:00:00.000Z",
  bySource: [{ sourceLabel: "Google Ads", qualified30d: 2, won30d: 1, gclidPct: 0.5 }],
};

test("conversionsByLabelFrom: the ledger's per-label counts, or undefined without a rollup", () => {
  assert.deepEqual(conversionsByLabelFrom(SUMMARY), {
    "Google Ads": { qualified30d: 2, won30d: 1, gclidPct: 0.5 },
  });
  assert.equal(conversionsByLabelFrom(null), undefined);
});

test("funnelSeeds carries the join, so the page digest is reproducible from the funnel", () => {
  const sources = contactsToLeadSources(THREE);
  const conversionsByLabel = conversionsByLabelFrom(SUMMARY);
  const seeds = funnelSeeds({ sources, conversionsByLabel });
  const seed = seeds.find((s) => s.source === "Google Ads");
  assert.ok(seed, "the only source is the diagnosable floor");
  assert.deepEqual(seed.conversions, { qualified30d: 2, won30d: 1, gclidPct: 0.5 });
  // What LeadQualityModule computes as currentDigests["Google Ads"] — without the join
  // the digest differs, which is exactly the stale badge the cron used to earn.
  const withJoin = inputDigest(seedToRequest(seed));
  const [bare] = funnelSeeds({ sources });
  assert.notEqual(inputDigest(seedToRequest(bare)), withJoin);
});

// --- 7-8: the cache version and the tombstone rule ------------------------------

test("funnelVersion: contacts move the version; import → syncedAt; sample → undefined", () => {
  const a = funnelVersion({ source: "contacts", contacts: THREE });
  const moved = THREE.map((c) => (c.id === "c2" ? { ...c, updatedAt: "2026-08-09T00:00:00.000Z" } : c));
  const b = funnelVersion({ source: "contacts", contacts: moved });
  assert.equal(typeof a, "string");
  assert.notEqual(a, b, "one contact edited → a new recap cache version");
  assert.equal(funnelVersion({ source: "contacts", contacts: [...THREE].reverse() }), a, "order-free");
  assert.equal(funnelVersion({ source: "import", syncedAt: "X" }), "X");
  assert.equal(funnelVersion({ source: "sample" }), undefined);
  const tier = pickFunnelTier({ contacts: THREE, imports: null, sample: SAMPLE_SOURCES });
  assert.equal(tier.version, a, "the tier carries the same version the recap keys on");
});

test("a GDPR-tombstoned contact still counts, so erasing a person does not move the funnel", () => {
  const erased = contact({ id: "c9", stage: "won", erasedAt: "2026-09-01T00:00:00.000Z" });
  const tier = pickFunnelTier({ contacts: [...THREE, erased], imports: null, sample: SAMPLE_SOURCES });
  const g = tier.sources[0];
  assert.deepEqual([g.leads, g.qualified, g.won], [4, 3, 2]);
});

// --- the store-backed resolver ------------------------------------------------------

const project = (id) => ({
  id,
  name: `Funnel ${id}`,
  type: "leadgen",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

test("resolveLeadFunnel reads the stored contacts (tombstones included) + the ledger join", async () => {
  const p = project("funnel-contacts");
  for (const c of THREE) await saveContact(p.id, { ...c, projectId: p.id });
  await saveContact(p.id, contact({ id: "c4", projectId: p.id, stage: "won", erasedAt: "2026-09-01T00:00:00.000Z" }));
  await saveLeadImports(p.id, {
    items: [row("Meta", "lead"), row("Meta", "lead")],
    source: "import",
    syncedAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
  });
  summaries.set(`u1/${p.id}`, SUMMARY);
  const funnel = await resolveLeadFunnel(p, "u1");
  assert.equal(funnel.source, "contacts");
  assert.equal(funnel.contactCount, 4);
  assert.equal(funnel.shadowedImportRows, 2);
  assert.deepEqual(
    [funnel.sources[0].leads, funnel.sources[0].qualified, funnel.sources[0].won],
    [4, 3, 2]
  );
  assert.deepEqual(funnel.conversionsByLabel, { "Google Ads": { qualified30d: 2, won30d: 1, gclidPct: 0.5 } });
  // No userId (the recap / an anonymous read) → no ledger read, the funnel is unchanged.
  const anon = await resolveLeadFunnel(p);
  assert.equal(anon.conversionsByLabel, undefined);
  assert.deepEqual(anon.sources, funnel.sources);
});

// --- the digest cron: coordinator decision + the parity fix ---------------------

test("planDigestDiagnoses: a contacts-tier funnel skips the lead arm with its own note", () => {
  const plan = planDigestDiagnoses({ leadSourcesLive: true, hasLeadSeed: true, leadOnContactsTier: true });
  assert.equal(plan.runLead, false);
  assert.deepEqual(plan.notes, [NOTE_COHORT_NO_LIVE, NOTE_LEAD_CONTACTS_TIER]);
  assert.ok(!plan.notes.includes(NOTE_LEAD_NO_LIVE), "it IS live — the skip is a spend decision");
});

test("digest cron on a contacts-tier funnel: no paid diagnosis, zero spend units, explicit note", async () => {
  spend.guardUnits.length = 0;
  llm.leadCalls.length = 0;
  const p = project("funnel-contacts");
  const out = await runTenantDiagnoses(p, new Date("2026-09-24T06:00:00.000Z"), "u1");
  assert.equal(llm.leadCalls.length, 0, "no lead-source provider call");
  assert.deepEqual(spend.guardUnits, [], "no durableGuard spend unit was charged");
  assert.equal(out.leadSource, undefined);
  assert.ok(out.notes.includes(NOTE_LEAD_CONTACTS_TIER), "the skip is recorded, not silent");
  assert.equal(await latestDiagnosis(p.id, "lead-source"), null, "nothing persisted");
});

test("digest cron on an import-tier funnel seeds WITH the ledger join the page uses", async () => {
  spend.guardUnits.length = 0;
  llm.leadCalls.length = 0;
  const p = project("funnel-import");
  const items = [
    ...Array.from({ length: 6 }, () => row("Google Ads", "lead")),
    row("Google Ads", "qualified"),
    row("Google Ads", "won"),
  ];
  await saveLeadImports(p.id, {
    items,
    source: "import",
    syncedAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
  });
  summaries.set(`u1/${p.id}`, SUMMARY);
  const out = await runTenantDiagnoses(p, new Date("2026-09-24T06:00:00.000Z"), "u1");
  assert.equal(llm.leadCalls.length, 1);
  assert.deepEqual(spend.guardUnits, [1], "exactly the one unit it always charged");
  const req = llm.leadCalls[0];
  assert.deepEqual(req.conversions, { qualified30d: 2, won30d: 1, gclidPct: 0.5 });
  // The page's digest for this subject, computed from the SAME resolver + builder.
  const funnel = await resolveLeadFunnel(p, "u1");
  const pageSeed = funnelSeeds(funnel).find((s) => s.source === out.leadSource.subject);
  const stored = await latestDiagnosis(p.id, "lead-source");
  assert.equal(stored.inputDigest, inputDigest(seedToRequest(pageSeed)), "fresh on arrival, not stale");
});
