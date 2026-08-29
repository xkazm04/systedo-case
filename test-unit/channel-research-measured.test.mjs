/** The MEASURED grounding leg of `channel-research` (WP W2-A): the wire validator,
 *  the prompt block, and the promise that adding it changed nothing for a tenant who
 *  has measured nothing.
 *
 *  That last one carries the gate: the contract golden's fingerprint is computed
 *  over the fixture's (system + schema), and `test-unit/llm-fixture-fidelity` pins
 *  the fixture's PROMPT against `buildChannelResearchPrompt(CHANNEL_RESEARCH_FIXTURE_REQUEST)`.
 *  The measured block is emitted only when the request carries measured rows, and
 *  the fixture request carries none — so the fixture prompt is byte-identical and
 *  the golden does not move. This suite asserts that directly rather than leaving it
 *  as an inference from a green gate.
 *
 *  `measured` is also the only field in the request the prompt calls GROUND TRUTH,
 *  which is why the validator is tested as a security door, not as a coercion helper. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const { buildChannelResearchPrompt } = await import("@/lib/ai/tools/channel-research");
const { validateChannelResearchRequest } = await import("@/lib/ai/validation");
const { LLM_TOOLS, CHANNEL_RESEARCH_FIXTURE_REQUEST } = await import("../test-llm/registry.mjs");

const BASE = { projectType: "eshop", brand: "Mionelo" };

/* ── the wire door ──────────────────────────────────────────────────────────── */

test("the validator accepts well-formed measured rows and keeps them bounded", () => {
  const v = validateChannelResearchRequest({
    ...BASE,
    measured: [
      { channel: "LinkedIn", clicks30d: 42, links: 3 },
      { channel: "Newsletter", clicks30d: 7, links: 1 },
    ],
  });
  assert.equal(v.valid, true);
  assert.deepEqual(v.value.measured, [
    { channel: "LinkedIn", clicks30d: 42, links: 3 },
    { channel: "Newsletter", clicks30d: 7, links: 1 },
  ]);
});

test("a request with no measured rows is byte-identical to the pre-W2-A shape", () => {
  const before = validateChannelResearchRequest({ ...BASE, keywords: ["kočárky"] });
  assert.equal("measured" in before.value, false, "the key is absent, not an empty array");
  for (const measured of [undefined, [], "nope", 7, [{}], [{ channel: "X", clicks30d: 0 }]]) {
    const v = validateChannelResearchRequest({ ...BASE, keywords: ["kočárky"], measured });
    assert.deepEqual(v.value, before.value, `measured=${JSON.stringify(measured)}`);
  }
});

test("the validator refuses to let a client assert nonsense AS MEASURED FACT", () => {
  const { value } = validateChannelResearchRequest({
    ...BASE,
    measured: [
      { channel: "Nula", clicks30d: 0, links: 9 }, // zero is "not measured", never a fact
      { channel: "Záporné", clicks30d: -5, links: 1 },
      { channel: "Zlomek", clicks30d: 2.9, links: 1.4 },
      { channel: "Obří", clicks30d: 9e18, links: 9e18 },
      { channel: "x".repeat(400), clicks30d: 3, links: 1 },
      { channel: "Zlomek", clicks30d: 50, links: 1 }, // duplicate channel, first wins
      { channel: "", clicks30d: 3, links: 1 },
      "not an object",
    ],
  });
  assert.deepEqual(
    value.measured.map((m) => m.channel),
    ["Zlomek", "Obří", "x".repeat(80)],
    "zero/negative/blank rows are dropped; the channel name is capped at 80; dupes drop"
  );
  assert.deepEqual(value.measured[0], { channel: "Zlomek", clicks30d: 2, links: 1 });
  assert.equal(value.measured[1].clicks30d, 10_000_000, "counts are ceilinged, not trusted");
});

test("the measured list is capped at 12 rows on the wire", () => {
  const { value } = validateChannelResearchRequest({
    ...BASE,
    measured: Array.from({ length: 30 }, (_, i) => ({
      channel: `K${i}`,
      clicks30d: 30 - i,
      links: 1,
    })),
  });
  assert.equal(value.measured.length, 12);
});

/* ── the prompt ─────────────────────────────────────────────────────────────── */

test("the prompt states the measured numbers and forbids inventing more", () => {
  const prompt = buildChannelResearchPrompt({
    ...BASE,
    measured: [
      { channel: "LinkedIn", clicks30d: 42, links: 3 },
      { channel: "Newsletter", clicks30d: 7, links: 1 },
    ],
  });
  assert.match(prompt, /Měřené výsledky \(kliknutí za 30 dní z vlastních odkazů/);
  assert.match(prompt, /nevymýšlej si čísla/, "the anti-fabrication clause is at the point of use");
  assert.ok(prompt.includes("- LinkedIn: 42 kliknutí z 3 odkazů"));
  assert.ok(prompt.includes("- Newsletter: 7 kliknutí z 1 odkazů"));
  assert.match(prompt, /má „fit" odpovídat naměřené realitě/);
  assert.match(prompt, /O kanálech, které v seznamu nejsou, nic naměřeného netvrď/);
});

test("no measured rows → the prompt is EXACTLY what it was, so the golden cannot move", () => {
  const req = { ...BASE, offering: "kočárky", keywords: ["kočárky", "autosedačky"] };
  assert.equal(
    buildChannelResearchPrompt({ ...req, measured: [] }),
    buildChannelResearchPrompt(req)
  );
  assert.ok(!buildChannelResearchPrompt(req).includes("Měřené"));

  // …and the gate's own fixture is one of those requests, which is why
  // llm:gate:check stays green without re-accepting a golden.
  const fixture = LLM_TOOLS.find((t) => t.id === "channel-research");
  assert.equal("measured" in CHANNEL_RESEARCH_FIXTURE_REQUEST, false);
  assert.equal(fixture.prompt, buildChannelResearchPrompt(CHANNEL_RESEARCH_FIXTURE_REQUEST));
});
