/** The `channel-research` gate fixture must BE the production contract, not a
 *  paraphrase of it.
 *
 *  THE HOLE THIS CLOSES. `test-llm/registry.mjs` carried a hand-written summary of
 *  the tool's system prompt and a hand-written user prompt. The contract golden's
 *  fingerprint is computed over the FIXTURE's (system + schema)
 *  (scripts/llm-eval.mjs), so with a paraphrase in place the golden pinned the
 *  paraphrase: `src/lib/ai/tools/channel-research.ts` could be rewritten — its
 *  anti-fabrication clause weakened, a channel family dropped, a field description
 *  changed — and every gate stayed green, because nothing compared the two. A gate
 *  that cannot fail on the thing it exists to watch is the repo's own definition of
 *  a gate running green while checking nothing. It was tracked as backlog item 22
 *  and as gap T4 of the kanaly ship record.
 *
 *  WHY A TEST AND NOT AN IMPORT. registry.mjs is plain `.mjs` loaded by BARE `node`
 *  — `scripts/llm-gate.mjs` and `scripts/llm-eval.mjs` import it with no TS loader
 *  and no path aliases — so it cannot import the tool module. Mirroring verbatim is
 *  the only option, and a verbatim copy is only trustworthy if something fails when
 *  it stops being verbatim. That is this file. It runs inside `npm run test:unit`,
 *  which sits in `check:ci` right after the build.
 *
 *  WHEN THIS FAILS: copy the production values into the fixture (and the request, if
 *  the builder's output changed), then accept the new contract with
 *  `npm run llm:eval:update -- --reason "<what changed and why it is intended>"`.
 *  Do NOT edit the golden by hand — the provenance check catches that separately. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { LLM_TOOLS, CHANNEL_RESEARCH_FIXTURE_REQUEST } = await import("../test-llm/registry.mjs");
const { CHANNEL_RESEARCH_SYSTEM, CHANNEL_RESEARCH_SCHEMA, buildChannelResearchPrompt } =
  await import("@/lib/ai/tools/channel-research");

const fixture = LLM_TOOLS.find((t) => t.id === "channel-research");

test("the channel-research fixture exists at all", () => {
  assert.ok(fixture, "no `channel-research` entry in the LLM tool registry");
});

test("the fixture's system prompt IS the production system prompt, byte for byte", () => {
  assert.equal(
    fixture.system,
    CHANNEL_RESEARCH_SYSTEM,
    "registry.mjs's `system` has drifted from CHANNEL_RESEARCH_SYSTEM — the golden is " +
      "pinning the fixture, not the app. Copy the production string across and re-accept " +
      'the golden with `npm run llm:eval:update -- --reason "..."`.'
  );
});

test("the fixture's schema IS the production schema, descriptions included", () => {
  // The descriptions are part of what the model is told, and they are inside the
  // golden's fingerprint — a fixture that summarises them proves a contract the app
  // does not have.
  assert.deepEqual(fixture.schema, CHANNEL_RESEARCH_SCHEMA);
});

test("the fixture's user prompt is what the production builder emits for its request", () => {
  assert.equal(
    fixture.prompt,
    buildChannelResearchPrompt(CHANNEL_RESEARCH_FIXTURE_REQUEST),
    "registry.mjs's `prompt` is no longer what buildChannelResearchPrompt produces for " +
      "CHANNEL_RESEARCH_FIXTURE_REQUEST. Rebuild it rather than editing it by hand."
  );
});

test("the fixture request exercises the scan-profile grounding, not just the catalog spine", () => {
  // `businessSummary` and `audience` are the two fields the onboarding scan
  // contributes (lib/organic-channels/grounding.ts) — the whole reason a URL-first
  // tenant with an empty catalog gets a grounded plan. The old paraphrased fixture
  // carried neither, so the golden could not have noticed them being dropped.
  const req = CHANNEL_RESEARCH_FIXTURE_REQUEST;
  assert.ok(req.businessSummary?.trim(), "the fixture request must carry a businessSummary");
  assert.ok(req.audience?.trim(), "the fixture request must carry an audience");
  assert.ok(fixture.prompt.includes(req.businessSummary), "businessSummary must reach the prompt");
  assert.ok(fixture.prompt.includes(req.audience), "audience must reach the prompt");
  // and the rest of the grounding legs, so a dropped line in the builder is visible
  assert.ok(fixture.prompt.includes(req.brand));
  assert.ok(fixture.prompt.includes(req.offering));
  assert.ok(fixture.prompt.includes(req.localities.join(", ")));
  assert.ok(fixture.prompt.includes(req.competitors.join(", ")));
  assert.ok(fixture.prompt.includes(req.keywords.join(", ")));
});

test("the fixture's validator still accepts a plausible production answer", () => {
  // The registry's validator is deliberately lenient (category/effort are COERCED in
  // production, never hard-failed), so this pins that leniency rather than re-deriving
  // the schema: a summary plus three named channels with a first action each.
  const answer = {
    summary: "Největší bezplatná příležitost je Google Business Profile.",
    channels: [
      { name: "Google Business Profile", category: "directory", fit: 94, effort: "low", rationale: "r", payoff: "p", firstActions: ["Založte profil"] },
      { name: "Mapy.cz", category: "directory", fit: 82, effort: "low", rationale: "r", payoff: "p", firstActions: ["Ověřte zápis"] },
      { name: "Firmy.cz", category: "directory", fit: 78, effort: "low", rationale: "r", payoff: "p", firstActions: ["Doplňte fotky"] },
    ],
  };
  assert.equal(fixture.validate(answer), true);
  assert.ok(!fixture.validate({ summary: "", channels: [] }), "an empty answer must not pass");
  assert.ok(
    !fixture.validate({ summary: "ok", channels: answer.channels.slice(0, 2) }),
    "fewer than three named channels is not a plan"
  );
});
