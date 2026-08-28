/** The seeded channel plan's own guarantees (`channelPlanForProject` /
 *  `baseChannelPlan`, src/lib/organic-channels/sample.ts).
 *
 *  This is the plan EVERY tenant sees before they ever call the model — the whole
 *  keyless path, the demo fallback inside `channel-research`, and the artifact the
 *  visibility plan is spined on. It had no test of its own: the placeholder fill,
 *  the per-project wobble and the ranking were all unpinned, which matters because
 *  each of the three has already produced a real defect.
 *
 *  What is pinned here, and why each is a defect class rather than a detail:
 *   • FILL — an unfilled `{brand}` / `{locality}` / `{category}` reaching the UI is a
 *     template leaking into advice; the generic fallbacks ("vaší firmy") are the
 *     honest form and must appear only when there is genuinely nothing to say.
 *   • DEMO MARKER — `promptSafeName` strips "(ukázka)"; this text is read as advice,
 *     handed to the content engine as a brief seed and spliced into a model answer,
 *     so "Založte profil pro Klinika (ukázka)" reads as a test account
 *     (bughunt-refactor-2026-07-10 #1).
 *   • WOBBLE BOUNDS — fit is a displayed 0–100 score AND the sort key AND the
 *     quick-win predicate's threshold (`fit >= 70`). An unbounded nudge would move
 *     channels across that line.
 *   • DETERMINISM — the wobble is seeded off the project id, so a plan must not
 *     reshuffle between two renders of the same project.
 *
 *  Pure — no store, no model, no Next. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { channelPlanForProject, baseChannelPlan } = await import("@/lib/organic-channels/sample");
const { CHANNEL_CATEGORIES } = await import("@/lib/organic-channels/types");
const { PROJECT_TYPES } = await import("@/lib/projects/types");

const iso = "2026-08-01T00:00:00.000Z";
const projectOf = (id, type, name = "Mionelo") => ({
  id,
  name,
  type,
  accentColor: "#0891b2",
  createdAt: iso,
  updatedAt: iso,
});

/** Every string a tenant can read on the page or in the playbook drawer. */
const allText = (plan) =>
  plan
    .flatMap((c) => [c.name, c.rationale, c.payoff, c.contentAngle ?? "", ...c.firstActions])
    .join("\n");

// --- placeholder fill -------------------------------------------------------

test("no {placeholder} survives into any plan, for any project type", () => {
  for (const type of PROJECT_TYPES) {
    const filled = allText(channelPlanForProject(projectOf("p-" + type, type), {}));
    assert.doesNotMatch(filled, /\{(brand|locality|category)\}/, type + " leaks a placeholder");
    const grounded = allText(
      channelPlanForProject(projectOf("g-" + type, type), { category: "ořechy", locality: "Brno" })
    );
    assert.doesNotMatch(grounded, /\{(brand|locality|category)\}/, type + " leaks when grounded");
  }
});

test("the grounding context replaces the generic fallbacks wherever it is used", () => {
  const generic = allText(channelPlanForProject(projectOf("p1", "local"), {}));
  assert.match(generic, /vaší lokality|vaší nabídky/, "an ungrounded plan uses the honest fallback");

  const grounded = allText(
    channelPlanForProject(projectOf("p1", "local"), {
      category: "dentální hygiena",
      locality: "Brno",
    })
  );
  assert.ok(grounded.includes("Brno"), "the locality reaches the text");
  assert.ok(grounded.includes("dentální hygiena"), "the category reaches the text");
  assert.doesNotMatch(grounded, /vaší lokality|vaší nabídky/, "a grounded plan drops the fallbacks");
});

test("the brand reaches the text, with its demo marker stripped", () => {
  const text = allText(channelPlanForProject(projectOf("p1", "local", "Klinika (ukázka)"), {}));
  assert.ok(text.includes("Klinika"), "the brand is spoken");
  assert.doesNotMatch(text, /\(ukázka\)|\(demo\)|\(sample\)/, "the demo marker must not be spoken");
});

test("an empty brand falls back to generic phrasing rather than an empty gap", () => {
  const text = allText(channelPlanForProject(projectOf("p1", "eshop", ""), {}));
  assert.ok(text.includes("vaší firmy"));
});

// --- wobble bounds + ranking ------------------------------------------------

test("fit stays inside [30, 99], is an integer, and moves at most a 5% nudge", () => {
  // The un-wobbled seed fits are not reachable through any public entry point, so
  // the bound is checked pairwise instead: two plans of one type differ ONLY by the
  // wobble, so every same-channel gap must fit inside two nudges plus the rounding.
  for (const type of PROJECT_TYPES) {
    const a = baseChannelPlan(type, {}, "seed-a");
    const b = baseChannelPlan(type, {}, "seed-b");
    const byId = new Map(b.map((c) => [c.id, c]));
    for (const c of a) {
      assert.ok(Number.isInteger(c.fit), type + "/" + c.id + ": fit " + c.fit + " is not an integer");
      assert.ok(c.fit >= 30 && c.fit <= 99, type + "/" + c.id + ": fit " + c.fit + " outside [30, 99]");
      const other = byId.get(c.id);
      assert.ok(other, type + "/" + c.id + ": the same channel must exist in both plans");
      const bound = Math.ceil(0.1 * Math.max(c.fit, other.fit)) + 1;
      assert.ok(
        Math.abs(c.fit - other.fit) <= bound,
        type + "/" + c.id + ": " + c.fit + " vs " + other.fit + " is more than a ±5% nudge"
      );
    }
  }
});

test("every plan is ranked by fit descending, with no duplicate channel", () => {
  for (const type of PROJECT_TYPES) {
    const plan = channelPlanForProject(projectOf("r-" + type, type), {});
    for (let i = 1; i < plan.length; i++) {
      assert.ok(plan[i - 1].fit >= plan[i].fit, type + ": not fit-ranked at index " + i);
    }
    assert.equal(new Set(plan.map((c) => c.id)).size, plan.length, type + ": duplicate channel id");
  }
});

test("the same project gets a byte-identical plan every time it renders", () => {
  const p = projectOf("stable-1", "eshop");
  assert.deepEqual(channelPlanForProject(p, {}), channelPlanForProject(p, {}));
});

test("two projects of one type do not read identically (the wobble does something)", () => {
  const a = channelPlanForProject(projectOf("wob-a", "eshop"), {});
  const b = channelPlanForProject(projectOf("wob-b", "eshop"), {});
  assert.notDeepEqual(
    a.map((c) => c.fit),
    b.map((c) => c.fit)
  );
});

// --- the shape the rest of the module relies on ------------------------------

test("every seeded channel satisfies the contract the table and playbook assume", () => {
  // Per-type sizes are pinned rather than range-checked: the SEEDED set is curated
  // (eshop 10, the rest 8) and is NOT the same contract as the 6–9 the AI prompt
  // asks the model for — conflating the two is how a curated seed gets "corrected".
  const SEEDED_COUNT = { eshop: 10, app: 8, leadgen: 8, content: 8, local: 8 };
  const categories = new Set(CHANNEL_CATEGORIES);
  for (const type of PROJECT_TYPES) {
    const plan = channelPlanForProject(projectOf("s-" + type, type), {});
    assert.equal(plan.length, SEEDED_COUNT[type], type + ": seeded channel count drifted");
    assert.ok(plan.length >= 6, type + ": a plan under 6 channels is not a plan");
    for (const c of plan) {
      assert.ok(c.id && c.name, type + ": a channel is missing id/name");
      assert.ok(categories.has(c.category), type + "/" + c.id + ": unknown category " + c.category);
      assert.ok(["low", "medium", "high"].includes(c.effort), type + "/" + c.id + ": bad effort");
      assert.ok(c.rationale.trim() && c.payoff.trim(), type + "/" + c.id + ": empty rationale/payoff");
      assert.ok(
        c.firstActions.length >= 2 && c.firstActions.length <= 4,
        type + "/" + c.id + ": " + c.firstActions.length + " first actions, want 2–4"
      );
      if (c.url !== undefined) assert.match(c.url, /^https?:\/\/\S+$/, type + "/" + c.id + ": bad url");
    }
  }
});
