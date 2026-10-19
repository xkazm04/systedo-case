/** twin-style distillation (src/lib/ai/tools/twin-style.ts) — "distil only what the
 *  samples show, else ask". Two places the tool trusted the model past its evidence:
 *   - with NO samples and NO answers the model's hard `constraints` ("do"/"dont" rules
 *     the prompt says are derived from the samples) and `examples` (new sentences "in
 *     this voice") reached the saved voice. With nothing shown they are invented, and
 *     they are saved as guardrails and exemplars the twin then obeys.
 *   - `gapQuestions` the model returned were never filtered against the questions the
 *     owner had already answered; only the keyless starter list was. Re-asking an
 *     answered question reads as the product not listening.
 *  The model is mocked: `generateStructured` runs the tool's real validate + normalize
 *  over a fixed raw output. Pure — no network. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

let raw = {};
mock.module("@/lib/llm", {
  namedExports: {
    generateStructured: async (args) => ({ ok: true, data: { result: args.normalize(raw) } }),
  },
});

const { generateTwinStyle } = await import("@/lib/ai/tools/twin-style.ts");

const RAW = () => ({
  summary: "Věcný a úsečný hlas.",
  directives: "Oslovuj zákazníka příjmením a vykej. Piš krátce a věcně, bez omluv.",
  traits: ["věcný", "úsečný"],
  lengthHint: "2–4 věty",
  constraints: [
    { kind: "do", rule: "Vždy vykej." },
    { kind: "dont", rule: "Nikdy nepoužívej emoji." },
    { kind: "dont", rule: "Nikdy nezačínej omluvou." },
  ],
  examples: ["Dobrý den, termín potvrzuji na úterý.", "Děkuji, ozvu se zítra.", "Cenu pošlu do hodiny."],
  gapQuestions: ["Tykáte, nebo vykáte?", "Jak končíte zprávu?"],
});

const run = async (req) => {
  const res = await generateTwinStyle({ scope: "email", projectType: "eshop", ...req });
  return res.data.result;
};

test("no samples and no answers: invented constraints and examples are not saved", async () => {
  raw = RAW();
  const r = await run({});
  assert.deepEqual(r.constraints, [], "hard rules need a sample or an answer behind them");
  assert.deepEqual(r.examples, [], "sentences 'in this voice' need a voice that was shown");
  assert.ok(r.directives.length >= 40, "cautious directives from the business type stay");
  assert.ok(r.gapQuestions.length > 0, "the questions are the output");
});

test("floor: with samples the constraints and examples are kept", async () => {
  raw = RAW();
  const r = await run({ samples: ["Dobrý den, děkuji za dotaz. Termín potvrzuji na úterý."] });
  assert.equal(r.constraints.length, 3);
  assert.equal(r.examples.length, 3);
});

test("floor: answers alone are evidence, constraints are kept", async () => {
  raw = RAW();
  const r = await run({ answers: [{ question: "Tykáte, nebo vykáte?", answer: "Vykáme." }] });
  assert.equal(r.constraints.length, 3);
});

test("a blank answer is not evidence", async () => {
  raw = RAW();
  const r = await run({ answers: [{ question: "Tykáte, nebo vykáte?", answer: "  " }] });
  assert.deepEqual(r.constraints, []);
});

test("a question the owner already answered is not asked again", async () => {
  raw = RAW();
  const r = await run({ answers: [{ question: "  tykáte, nebo vykáte? ", answer: "Vykáme." }] });
  assert.deepEqual(r.gapQuestions, ["Jak končíte zprávu?"]);
});

test("floor: an unanswered model question survives; a mature voice may end with none", async () => {
  raw = { ...RAW(), gapQuestions: ["Tykáte, nebo vykáte?"] };
  const answers = ["Tykáte, nebo vykáte?", "a", "b"].map((question) => ({ question, answer: "ano" }));
  const r = await run({ answers });
  assert.deepEqual(r.gapQuestions, [], "all open questions answered and the voice is mature");
  raw = RAW();
  const fresh = await run({ samples: ["x"] });
  assert.equal(fresh.gapQuestions.length, 2);
});
