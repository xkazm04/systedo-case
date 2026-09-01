/** The assertions `--update` may not rewrite (zero-dependency, no I/O).
 *
 *  THE FAILURE THIS EXISTS FOR. The contract goldens in test-llm/golden/ answer
 *  "did the prompt or the schema change?" and the provenance ledger answers "was
 *  the change accepted on purpose?" — both good, and both regenerable. So the way
 *  past a red `llm:gate:check` is not always a fix: it is
 *
 *      npm run llm:eval:update -- --reason "…"
 *
 *  which rewrites the expectation to agree with whatever the prompt now says. The
 *  reason is required and it is real, and the diff a reviewer sees is a hash and
 *  two hundred lines of Czech prose — in which one deleted sentence is invisible.
 *  Every rule below has been in these prompts for the product's whole life, none
 *  of them is what an author is thinking about when they re-bake, and dropping one
 *  changes what the product TELLS A CLIENT rather than what it returns.
 *
 *  So these are HELD OUT: never regenerated, checked against whatever the goldens
 *  now say. `scripts/llm-eval.mjs --update` runs them BEFORE it writes a byte and
 *  refuses, and `test-unit/golden-held-out.test.mjs` runs the same check against
 *  the committed goldens on every build — so a hand-edited golden, which matches
 *  the registry by construction and passes the drift check, is caught here.
 *
 *  THERE IS NO `--reason` FOR THESE, and that is the whole point of the tier. If
 *  one of these rules genuinely should go, it goes in a diff that says so in one
 *  line here, next to the sentence explaining why the claim it prevents is now
 *  acceptable — where a reviewer reads it as the decision it is, instead of
 *  finding it inside a prompt re-bake.
 *
 *  WHAT A HELD-OUT INVARIANT IS ALLOWED TO BE. A phrase whose ABSENCE is a
 *  behaviour change, not a wording preference. Deliberately narrow, deliberately
 *  few: a long list would be re-worded away one entry at a time, which is the
 *  failure it exists to prevent.
 */

/** Every tool whose prompt is grounded in the client's own numbers. Named rather
 *  than derived: a tool that stops being grounded leaves this list in a diff
 *  somebody reads, not by a regex noticing it has changed. */
const GROUNDED = [
  "ads-diagnosis",
  "ads",
  "analysis",
  "channel-research",
  "chat",
  "cohort-diagnosis",
  "comparison-outline",
  "keyword-clusters",
  "lead-source-diagnosis",
  "local-diagnosis",
  "local-page",
  "lp-variant-draft",
  "monthly-recap",
  "onboarding-scan",
];

export const HELD_OUT = [
  {
    id: "no-invented-figures",
    tools: GROUNDED,
    field: "system",
    mustContain: "nevymýšlej",
    why:
      "Every one of these operations answers about an advertiser's own account, and a model that invents a " +
      "figure produces a number that reads exactly like a measured one. This is the instruction that stops it, " +
      "and it is one line inside a long Czech prompt — the single easiest thing to lose in a re-bake.",
  },
  {
    id: "no-external-benchmarks",
    tools: ["analysis", "chat", "monthly-recap"],
    field: "system",
    mustContain: "Nezaváděj externí benchmarky",
    why:
      "A threshold the data does not contain (\"a good ROAS is 4\") is an invented fact wearing the clothes of " +
      "an industry standard, and it is the shape a client acts on hardest. These three are the reporting " +
      "surfaces a client reads directly.",
  },
  {
    id: "efficiency-is-not-profit",
    tools: ["analysis", "chat"],
    field: "system",
    mustContain: "Nezaměňuj efektivitu reklamy se ziskovostí",
    why:
      "PNO and ROAS measure spend against revenue, not profit, and without margin data no answer here can " +
      "speak about profitability. Losing this line does not make an output invalid — it makes it confidently " +
      "wrong about the only number the advertiser is actually managing.",
  },
];

/** `[]` when every held-out invariant still holds.
 *
 *  `tools` is `[{ id, system, schema }]` — the registry's current tools when the
 *  accept tooling calls it, the committed goldens when the unit test does. Pure:
 *  no reads, no writes, so both callers can hand it a fixture.
 */
export function heldOutViolations(tools) {
  const byId = new Map(tools.map((t) => [t.id, t]));
  const problems = [];

  for (const rule of HELD_OUT) {
    for (const id of rule.tools) {
      const tool = byId.get(id);
      if (!tool) {
        problems.push({
          rule: rule.id,
          tool: id,
          detail:
            `held out for \`${id}\`, and there is no such tool. Either it was renamed — in which case this ` +
            "list follows it — or it was removed, in which case the line goes in the same diff.",
        });
        continue;
      }
      const text = String(tool[rule.field] ?? "");
      if (!text.includes(rule.mustContain)) {
        problems.push({
          rule: rule.id,
          tool: id,
          detail:
            `\`${id}\` no longer says "${rule.mustContain}" in its ${rule.field}. ${rule.why}`,
        });
      }
    }
  }
  return problems;
}

/** The refusal, in the words the caller is meeting it in. Shared so the accept
 *  tooling and the unit suite say the same thing. */
export function heldOutRefusal(problems) {
  return [
    "",
    `✗ ${problems.length} held-out invariant(s) no longer hold:`,
    "",
    ...problems.map((p) => `  • [${p.rule}] ${p.detail}`),
    "",
    "  These are the assertions a golden update may NOT absorb (test-llm/held-out.mjs). There is no",
    "  --reason that gets past them, because the reason is exactly what nobody writes when a rule",
    "  disappears inside a two-hundred-line prompt diff.",
    "",
    "  Two honest answers: put the instruction back in the prompt, or — if the claim it prevents is",
    "  genuinely acceptable now — remove the entry from test-llm/held-out.mjs in the SAME diff, with",
    "  the sentence saying why. A reviewer reads that line; nobody reads a re-baked hash.",
    "",
  ].join("\n");
}
