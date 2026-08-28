/** ONE visibility plan — the composition that joins the three legs of getting
 *  found for free (target queries · the content answering them · the free channel
 *  it gets seen on) into a single ordered this-week list.
 *
 *  What this file pins:
 *   • THE BYTE-IDENTITY RULE. A project with no saved keywords and no saved
 *     content gets back exactly the channel-only plan today's page implies —
 *     same channels, same order, same first actions, both legs explicitly null.
 *     The artifact may only ever ADD to what the tenant already saw.
 *   • the one heuristic (queries are dealt to content-carrying channels only,
 *     in-flight first) and its refusal to pair a query with a directory listing;
 *   • the real join (content ↔ query by primaryKeyword) and the promotion of
 *     content whose keyword was never saved to a list;
 *   • per-leg provenance and the row roll-up (user > ai > seeded);
 *   • the adapters' provenance rules for the two other modules' stored shapes;
 *   • a demo-project fixture case, composed from the shipped seeded plan and the
 *     shipped sample library, so the card is proven against real fixture data.
 *  Pure — no model, no I/O, no React. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const {
  buildVisibilityPlan,
  contentFromLibrary,
  hasVisibilityPlan,
  queriesFromKeywordLists,
  VISIBILITY_PLAN_MODULES,
  VISIBILITY_PLAN_ROWS,
} = await import("@/lib/organic-channels/visibility-plan");
const { channelPlanForProject } = await import("@/lib/organic-channels/sample");
const { demoProjectFor } = await import("@/lib/demo/projects");
const { SAMPLE_CONTENT_ENTRIES } = await import("@/lib/content-library/sample");
const { SCAN_LIST_SEED } = await import("@/lib/onboarding/seed");
const { isModuleAvailable } = await import("@/lib/projects/modules");
const { PROJECT_TYPES } = await import("@/lib/projects/types");

const ch = (over) => ({
  id: "kanal",
  name: "Kanál",
  category: "content",
  fit: 70,
  effort: "medium",
  rationale: "",
  payoff: "",
  firstActions: [],
  ...over,
});

/** A fit-ranked plan with one of each interaction shape: a listing that cannot
 *  carry a query, and two channels that can. */
const CHANNELS = [
  ch({
    id: "gbp",
    name: "Google Business Profile",
    category: "directory",
    fit: 92,
    effort: "low",
    firstActions: ["Ověřte profil firmy"],
    url: "https://business.google.com",
  }),
  ch({ id: "blog", name: "Vlastní blog", category: "content", fit: 84, firstActions: ["Napište pilířový článek"] }),
  ch({ id: "reddit", name: "Reddit r/czech", category: "community", fit: 71, firstActions: ["Představte se v komunitě"] }),
];

/** The channel-only plan today's /kanaly page implies: the plan in its own order,
 *  each row carrying that channel's own first action and nothing invented. */
const channelOnlyRows = (channels) =>
  channels.map((c) => ({
    id: c.id,
    channel: {
      id: c.id,
      name: c.name,
      category: c.category,
      effort: c.effort,
      fit: c.fit,
      stage: "identified",
      firstAction: c.firstActions[0] ?? null,
      ...(c.url ? { url: c.url } : {}),
    },
    query: null,
    content: null,
    step: "first-action",
    provenance: "seeded",
  }));

const query = (over) => ({ query: "dotaz", opportunity: 50, volume: 100, provenance: "user", ...over });

// ── the byte-identity rule ─────────────────────────────────────────────────────

test("no keywords and no content → byte-identical to the channel-only plan", () => {
  const plan = buildVisibilityPlan({ channels: CHANNELS, limit: 0 });
  assert.equal(JSON.stringify(plan.rows), JSON.stringify(channelOnlyRows(CHANNELS)));
  assert.deepEqual(plan.counts, { queries: 0, content: 0, channels: 3 });
  assert.equal(plan.total, 3);
  assert.equal(plan.channelSource, "sample");
});

test("the cap keeps the head of that same channel-only plan, and reports the total", () => {
  const plan = buildVisibilityPlan({ channels: CHANNELS });
  assert.equal(VISIBILITY_PLAN_ROWS, 3);
  const capped = buildVisibilityPlan({ channels: CHANNELS, limit: 2 });
  assert.equal(JSON.stringify(capped.rows), JSON.stringify(channelOnlyRows(CHANNELS).slice(0, 2)));
  assert.equal(capped.total, 3);
  assert.equal(plan.rows.length, 3);
});

test("an empty channel plan yields an empty plan, not a fabricated one", () => {
  const plan = buildVisibilityPlan({ channels: [], queries: [query({})] });
  assert.deepEqual(plan.rows, []);
  assert.equal(plan.total, 0);
  assert.equal(plan.counts.channels, 0);
});

// ── the one heuristic: which channels a query may be dealt to ──────────────────

test("queries are dealt only to channels that can carry content, in fit order", () => {
  const plan = buildVisibilityPlan({
    channels: CHANNELS,
    queries: [query({ query: "kočárek pro dvojčata", opportunity: 90 }), query({ query: "autosedačka test", opportunity: 60 })],
    limit: 0,
  });
  const byId = Object.fromEntries(plan.rows.map((r) => [r.id, r]));
  // A directory listing is not won by writing — it must never be paired.
  assert.equal(byId.gbp.query, null);
  assert.equal(byId.gbp.step, "first-action");
  assert.equal(byId.blog.query.query, "kočárek pro dvojčata");
  assert.equal(byId.reddit.query.query, "autosedačka test");
  assert.equal(byId.blog.step, "write-brief");
});

test("fewer queries than content channels → the surplus channel keeps its first action", () => {
  const plan = buildVisibilityPlan({ channels: CHANNELS, queries: [query({ query: "jediný dotaz" })], limit: 0 });
  const byId = Object.fromEntries(plan.rows.map((r) => [r.id, r]));
  assert.equal(byId.blog.query.query, "jediný dotaz");
  assert.equal(byId.reddit.query, null);
  assert.equal(byId.reddit.step, "first-action");
  assert.equal(byId.reddit.channel.firstAction, "Představte se v komunitě");
});

// ── the real join: content ↔ query by primaryKeyword ──────────────────────────

test("a saved draft for a query makes the row 'publish' and sorts it first", () => {
  const plan = buildVisibilityPlan({
    channels: CHANNELS,
    queries: [query({ query: "nízká příležitost", opportunity: 10 }), query({ query: "vysoká příležitost", opportunity: 95 })],
    content: [{ id: "e1", title: "Průvodce", primaryKeyword: "Nízká Příležitost", kind: "article", provenance: "ai" }],
    limit: 0,
  });
  // In-flight work outranks a bigger opportunity with nothing written for it.
  assert.equal(plan.rows[0].step, "publish");
  assert.equal(plan.rows[0].query.query, "nízká příležitost");
  assert.equal(plan.rows[0].content.title, "Průvodce");
  assert.equal(plan.rows[1].step, "write-brief");
  assert.equal(plan.rows[1].query.query, "vysoká příležitost");
});

test("a brief without a draft is 'finish-draft', and a draft beats a brief for the same query", () => {
  const briefOnly = buildVisibilityPlan({
    channels: CHANNELS,
    queries: [query({ query: "spánek miminka" })],
    content: [{ id: "b1", title: "Brief", primaryKeyword: "spánek miminka", kind: "brief", provenance: "ai" }],
    limit: 0,
  });
  assert.equal(briefOnly.rows[0].step, "finish-draft");

  const both = buildVisibilityPlan({
    channels: CHANNELS,
    queries: [query({ query: "spánek miminka" })],
    content: [
      { id: "b1", title: "Brief", primaryKeyword: "spánek miminka", kind: "brief", provenance: "ai" },
      { id: "a1", title: "Článek", primaryKeyword: "spánek miminka", kind: "article", provenance: "ai" },
    ],
    limit: 0,
  });
  assert.equal(both.rows[0].step, "publish");
  assert.equal(both.rows[0].content.id, "a1");
});

test("content whose keyword was never saved to a list is promoted into the plan", () => {
  const plan = buildVisibilityPlan({
    channels: CHANNELS,
    queries: [],
    content: [{ id: "e1", title: "Osamělý koncept", primaryKeyword: "  Zapomenutý Dotaz  ", kind: "article", provenance: "ai" }],
    limit: 0,
  });
  assert.equal(plan.counts.queries, 1);
  assert.equal(plan.rows[0].query.query, "Zapomenutý Dotaz");
  assert.equal(plan.rows[0].content.id, "e1");
  assert.equal(plan.rows[0].step, "publish");
});

// ── lifecycle: a finished channel is not this week's work ─────────────────────

test("a done channel sinks to the end and is never dealt a query", () => {
  const plan = buildVisibilityPlan({
    channels: CHANNELS,
    tracks: { blog: { stage: "done" } },
    queries: [query({ query: "jediný dotaz" })],
    limit: 0,
  });
  assert.equal(plan.rows.at(-1).id, "blog");
  assert.equal(plan.rows.at(-1).step, "done");
  assert.equal(plan.rows.at(-1).query, null);
  // The query it did not take goes to the next channel that can carry one.
  const reddit = plan.rows.find((r) => r.id === "reddit");
  assert.equal(reddit.query.query, "jediný dotaz");
});

// ── provenance ────────────────────────────────────────────────────────────────

test("a pinned AI plan makes untracked rows 'ai'; a tracked channel is the tenant's 'user'", () => {
  const plan = buildVisibilityPlan({
    channels: CHANNELS,
    channelSource: "ai",
    tracks: { gbp: { stage: "planned" } },
    limit: 0,
  });
  const byId = Object.fromEntries(plan.rows.map((r) => [r.id, r]));
  assert.equal(byId.gbp.provenance, "user");
  assert.equal(byId.gbp.channel.stage, "planned");
  assert.equal(byId.blog.provenance, "ai");
});

test("the row rolls up to the strongest leg present", () => {
  const plan = buildVisibilityPlan({
    channels: [CHANNELS[1]],
    queries: [query({ query: "měřený dotaz", provenance: "user" })],
    content: [{ id: "e1", title: "Koncept", primaryKeyword: "měřený dotaz", kind: "article", provenance: "seeded" }],
    limit: 0,
  });
  // seeded channel + seeded content + the tenant's own measured query → user.
  assert.equal(plan.rows[0].provenance, "user");
});

// ── adapters ──────────────────────────────────────────────────────────────────

const kw = (over) => ({
  keyword: "dotaz",
  intent: "informational",
  opportunity: 40,
  avgMonthlySearches: 100,
  competition: "medium",
  tag: "core",
  ...over,
});
const list = (over) => ({ id: "l1", name: "Seznam", seed: "seed", source: "sample", keywords: [], ...over });

test("queriesFromKeywordLists: negatives are exclusions, never targets", () => {
  const out = queriesFromKeywordLists([
    list({ keywords: [kw({ keyword: "cíl" }), kw({ keyword: "zdarma", tag: "negative" }), kw({ keyword: "sledované", tag: "watch" })] }),
  ]);
  assert.deepEqual(out.map((q) => q.query).sort(), ["cíl", "sledované"]);
});

test("queriesFromKeywordLists: provenance follows the NUMBERS, not the act of saving", () => {
  const [scanned] = queriesFromKeywordLists([list({ seed: SCAN_LIST_SEED, keywords: [kw({ keyword: "ze skenu" })] })]);
  assert.equal(scanned.provenance, "ai");
  const [measured] = queriesFromKeywordLists([list({ source: "google-ads", keywords: [kw({ keyword: "měřené" })] })]);
  assert.equal(measured.provenance, "user");
  const [sampled] = queriesFromKeywordLists([list({ source: "sample", keywords: [kw({ keyword: "ukázkové" })] })]);
  assert.equal(sampled.provenance, "seeded");
});

test("queriesFromKeywordLists: deduped case-insensitively, richest record + strongest provenance, ranked", () => {
  const out = queriesFromKeywordLists([
    list({ source: "sample", keywords: [kw({ keyword: "Zubař Brno", opportunity: 20, avgMonthlySearches: 50 })] }),
    list({ id: "l2", source: "google-ads", keywords: [kw({ keyword: "zubař brno", opportunity: 80, avgMonthlySearches: 900 }), kw({ keyword: "dentální hygiena", opportunity: 90 })] }),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].query, "dentální hygiena");
  assert.equal(out[1].query, "zubař brno");
  assert.equal(out[1].opportunity, 80);
  assert.equal(out[1].volume, 900);
  assert.equal(out[1].provenance, "user");
});

test("contentFromLibrary: no primary keyword means no join, so the entry is dropped", () => {
  const out = contentFromLibrary([
    { id: "a", kind: "article", title: "S klíčovým slovem", form: { primaryKeyword: "něco" }, briefMeta: { demo: false } },
    { id: "b", kind: "brief", title: "Bez klíčového slova", form: { primaryKeyword: "   " }, briefMeta: { demo: false } },
  ]);
  assert.deepEqual(out.map((c) => c.id), ["a"]);
  assert.equal(out[0].provenance, "ai");
});

test("contentFromLibrary: a demo-mode generation is seeded, not ai", () => {
  const [entry] = contentFromLibrary([
    { id: "a", kind: "article", title: "Ukázka", form: { primaryKeyword: "něco" }, briefMeta: { demo: true } },
  ]);
  assert.equal(entry.provenance, "seeded");
});

// ── the registry gate ─────────────────────────────────────────────────────────

test("the plan is gated on every project type having all three modules", () => {
  assert.deepEqual([...VISIBILITY_PLAN_MODULES], ["klicova-slova", "obsahovy-engine", "kanaly"]);
  for (const type of PROJECT_TYPES) {
    const all = VISIBILITY_PLAN_MODULES.every((k) => isModuleAvailable(type, k));
    assert.equal(hasVisibilityPlan(type), all, `${type} gate must follow the module registry`);
  }
});

// ── demo-project fixture case ─────────────────────────────────────────────────

test("demo e-shop fixture: the shipped seeded plan + the shipped sample library compose", () => {
  const project = demoProjectFor("eshop");
  const channels = channelPlanForProject(project);
  const content = contentFromLibrary(SAMPLE_CONTENT_ENTRIES);
  assert.ok(channels.length > 0, "the eshop seed plan must not be empty");
  assert.ok(content.length > 0, "the sample library must not be empty");

  const plan = buildVisibilityPlan({ channels, content });
  assert.equal(plan.rows.length, VISIBILITY_PLAN_ROWS);
  assert.equal(plan.total, channels.length);
  assert.equal(plan.counts.content, content.length);
  // Every sample entry is a demo generation, so nothing here may read as the
  // tenant's own data — the whole demo plan stays fixture-tagged.
  assert.ok(plan.rows.every((r) => r.provenance === "seeded"));
  // The library's drafts are already written, so the head of the plan is publish
  // work — the fixture exercises the in-flight-first ordering end to end.
  assert.equal(plan.rows[0].step, "publish");
  assert.ok(plan.rows[0].content);
  assert.equal(plan.rows[0].query.query, plan.rows[0].content.primaryKeyword);
  // Every row still names a real channel from the seeded plan.
  const ids = new Set(channels.map((c) => c.id));
  assert.ok(plan.rows.every((r) => ids.has(r.channel.id)));
});

test("demo e-shop fixture: with no library at all it is still the channel-only plan", () => {
  const channels = channelPlanForProject(demoProjectFor("eshop"));
  const plan = buildVisibilityPlan({ channels, limit: 0 });
  assert.equal(JSON.stringify(plan.rows), JSON.stringify(channelOnlyRows(channels)));
});
