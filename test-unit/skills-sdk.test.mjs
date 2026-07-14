/** Skill SDK — the generic adapter (skillToGenerateArgs) and the registry's load-time
 *  governance, after the core tools were migrated to Skill objects.
 *
 *  Proves the migration is a PURE ADAPTER: for each migrated skill, the args the
 *  adapter hands the wrapper carry the tool's own id/system/schema/temperature and a
 *  prompt/demo/normalize identical to calling the tool's pieces directly. Also proves
 *  the input-aware contract (social's brand-grounded system + platform-filling
 *  normalizer) and that the registry admits exactly the gate-covered set.
 *
 *  Pure — no store I/O, no model calls. These tool modules are JSON-free, so they
 *  import directly under the resolve hook. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// The registry transitively imports analysis → snapshot → src/data/performance.json,
// which raw Node loads only with an import attribute (Next handles it). Register a
// scoped JSON hook and dynamically import the modules, mirroring ai-analysis-grounding.
const JSON_HOOK =
  "data:text/javascript," +
  encodeURIComponent(`
    export async function load(url, context, next) {
      if (url.endsWith('.json')) {
        return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
      }
      return next(url, context);
    }
  `);

let skillToGenerateArgs;
let briefSkill;
let campaignEvalSkill;
let socialSkill;
let GATE_COVERED_SKILL_IDS;
let skillRegistry;

before(async () => {
  register(JSON_HOOK, import.meta.url);
  const [types, brief, campaignEval, social, registry] = await Promise.all([
    import("@/lib/skills/types"),
    import("@/lib/ai/tools/brief"),
    import("@/lib/ai/tools/campaign-eval"),
    import("@/lib/ai/tools/social"),
    import("@/lib/skills/registry"),
  ]);
  skillToGenerateArgs = types.skillToGenerateArgs;
  briefSkill = brief.briefSkill;
  campaignEvalSkill = campaignEval.campaignEvalSkill;
  socialSkill = social.socialSkill;
  GATE_COVERED_SKILL_IDS = registry.GATE_COVERED_SKILL_IDS;
  skillRegistry = registry.skillRegistry;
});

// --- brief: a plain single-object input, static system --------------------------

test("skillToGenerateArgs(brief) carries the tool contract + binds the input", () => {
  const req = {
    contentType: "blog",
    topic: "Skladování ořechů",
    primaryKeyword: "skladování ořechů",
    audience: "domácnosti",
  };
  const args = skillToGenerateArgs(briefSkill, req);

  assert.equal(args.id, "brief");
  assert.equal(args.system, briefSkill.system); // static string, passed through
  assert.equal(args.schema, briefSkill.schema);
  assert.equal(args.temperature, 0.9);
  assert.equal(typeof args.prompt, "string");
  // The prompt is a pure function of the input — the topic + keyword must appear.
  assert.match(args.prompt, /Skladování ořechů/);
  assert.match(args.prompt, /skladování ořechů/);
  // demo() is bound to this input (no separate input arg needed by the wrapper).
  const demo = args.demo();
  assert.equal(typeof demo.titleTag, "string");
  assert.ok(demo.titleTag.length > 0);
});

// --- campaign-eval: many grounding args shaped into one input, per-scope demo ----

const CAMPAIGN = {
  id: "c1",
  name: "Search · Brand",
  type: "search",
  status: "enabled",
  cost: 55000,
  conversions: 40,
  conversionValue: 1030000,
  clicks: 900,
  impressions: 12000,
};

test("skillToGenerateArgs(campaign-eval) shapes the many args into one input", () => {
  const input = {
    scope: "campaign",
    target: CAMPAIGN,
    campaigns: [CAMPAIGN],
    period: "30d",
  };
  const args = skillToGenerateArgs(campaignEvalSkill, input);

  assert.equal(args.id, "campaign-eval");
  assert.equal(args.system, campaignEvalSkill.system);
  assert.equal(args.temperature, 0.6);
  assert.match(args.prompt, /Search · Brand/); // the single-campaign prompt names it
  // Per-scope demo: a "campaign" scope evaluates the single target campaign.
  const demo = args.demo();
  assert.equal(typeof demo.verdict, "string");
  assert.ok(demo.score >= 0 && demo.score <= 100);
});

test("campaign-eval source=sklik adds the platform note to the USER prompt only", () => {
  const base = skillToGenerateArgs(campaignEvalSkill, {
    scope: "overall",
    target: null,
    campaigns: [CAMPAIGN],
    period: "30d",
  });
  const sklik = skillToGenerateArgs(campaignEvalSkill, {
    scope: "overall",
    target: null,
    campaigns: [CAMPAIGN],
    period: "30d",
    source: "sklik",
  });
  // The system prompt (fingerprint) is byte-identical; only the user prompt grows.
  assert.equal(sklik.system, base.system);
  assert.ok(sklik.prompt.length > base.prompt.length);
  assert.match(sklik.prompt, /Sklik/);
});

// --- social: input-aware system (brand) + input-aware normalizer (platforms) -----

test("social system is grounded per-request in the brand", () => {
  const withBrand = skillToGenerateArgs(socialSkill, {
    topic: "nová směs ořechů",
    tone: "pratelsky",
    platforms: ["instagram"],
    brand: "Ořechárna s.r.o.",
  });
  const withoutBrand = skillToGenerateArgs(socialSkill, {
    topic: "nová směs ořechů",
    tone: "pratelsky",
    platforms: ["instagram"],
  });
  assert.match(withBrand.system, /Ořechárna s\.r\.o\./);
  assert.notEqual(withBrand.system, withoutBrand.system);
});

test("social normalizer fills any platform the model skipped (input-aware)", () => {
  const input = {
    topic: "nová směs ořechů",
    tone: "pratelsky",
    platforms: ["instagram", "facebook"],
  };
  const args = skillToGenerateArgs(socialSkill, input);
  // The model only returned instagram; facebook must be filled from the draft.
  const out = args.normalize({ posts: [{ platform: "instagram", content: "Ahoj svět" }] });
  assert.deepEqual(
    out.posts.map((p) => p.platform),
    ["instagram", "facebook"]
  );
  assert.equal(out.posts[0].content, "Ahoj svět");
  assert.ok(out.posts[1].content.length > 0); // filled, not empty
});

// --- registry governance: the admitted set equals the gate-covered set -----------

test("registry admits exactly the gate-covered skills", () => {
  const listed = new Set(skillRegistry.list().map((s) => s.id));
  assert.deepEqual(listed, new Set(GATE_COVERED_SKILL_IDS));
  // The five core marketing tools are all present.
  for (const id of ["ads", "brief", "analysis", "campaign-eval", "social"]) {
    assert.ok(listed.has(id), `registry should list ${id}`);
  }
});

test("register() rejects a skill the prove-once gate does not cover", () => {
  assert.throws(
    () =>
      skillRegistry.register({
        id: "not-a-real-skill",
        label: "x",
        category: "marketing",
        system: "x",
        schema: {},
        buildPrompt: () => "x",
        normalize: () => ({}),
        demo: () => ({}),
      }),
    /prove-once gate|není pokrytý/
  );
});
