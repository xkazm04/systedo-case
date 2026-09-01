/** FAULT INJECTION at the LLM chokepoint — what happens when a provider LIES.
 *
 *  The rest of the suite proves the code is right. Nothing proved it degrades
 *  well. `test-llm/golden/` pins each tool's contract, `npm run llm:quality`
 *  scores the answers, `test-unit/llm-retryability.test.mjs` pins the error
 *  taxonomy and `test-unit/llm-deadline.test.mjs` pins the deadline helper — and
 *  every one of them asks about a PART. The composition was never executed:
 *  `generateStructured` itself, with a provider that errors, exhausts its retries,
 *  returns JSON of the wrong shape, or simply is not there.
 *
 *  That matters more here than the coverage number suggests, because the
 *  degradation is a PRODUCT PROPERTY, stated in README.md and in AGENTS.md: with
 *  no provider configured every AI operation falls back to a deterministic demo,
 *  which is what makes a clean checkout usable and what makes `check:ci` free to
 *  run. A property that is documented, load-bearing and never exercised is a
 *  property held by reasoning. The interesting case is not the absence of config
 *  (an empty provider list) but a provider that is present and answers badly, so
 *  every scenario below injects a fault into a CONFIGURED provider.
 *
 *  What is faked and why: the three provider adapters (`./claude`, `./codex`,
 *  `./gemini`) and telemetry. The adapters are the seam a fault enters through —
 *  their own HTTP/CLI behaviour is pinned by llm-retryability and the bench
 *  suites, and re-testing it here would just be a second copy. Telemetry is faked
 *  to be READ: several of these assertions are about what the durable record says
 *  happened, which is the difference between a silent fallback and a visible one.
 *  Everything between them — the retry ladder, the cross-provider walk, schema
 *  pruning, the corruption verdict, the demo return — is the real wrapper.
 *
 *  Runs in `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`. No
 *  provider, no network, no spend. Needs --experimental-test-module-mocks, which
 *  the `test:unit` script already passes.
 */
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { contract } from "./contract.mjs";

/** What a failure here MEANS, in the words of the rule rather than of the value.
 *  Every scenario below runs INSIDE `generateStructured` — the one chokepoint
 *  `llm-chokepoint` requires every LLM text call to pass through — so the retry
 *  ladder, the cross-provider walk and the degrade path are that rule's behaviour
 *  and not incidental detail. `scripts/mutation-catalogue.mjs` points its
 *  `byom-fault-absorbed` and `retry-bound-off-by-one` mutants at this file: both
 *  are wrong answers that cost real spend or leak a user's key fault into the
 *  app's own providers, so a red assertion here is that rule breaking and the
 *  message says so. See test-unit/contract.mjs. */
const chokepoint = contract("llm-chokepoint");

const { LlmCallError, ByomUserError } = await import("@/lib/llm/errors");

// `./claude` is faked below for its ADAPTER surface (availability + run) — but the same module also
// exports `extractJson`, a pure parser that `byom/adapters.ts` imports and that this test does not
// fake, because it is not part of the seam a fault enters through. A `namedExports` map is the WHOLE
// surface of the replacement, so omitting it made `adapters.ts` fail to LINK ("does not provide an
// export named 'extractJson'") and the file died before a single scenario ran. Capture the genuine
// helper first — importing it here, ahead of `mock.module`, binds the real implementation.
const { extractJson } = await import("@/lib/llm/claude");

// ── the injectable providers ─────────────────────────────────────────────────
//
// Each provider is driven by a QUEUE of behaviours: an Error is thrown, anything
// else is returned as the parse. A queue that runs dry keeps repeating its last
// entry, so "this provider is down for the whole request" is one entry, not four.

const calls = { claude: 0, codex: 0, gemini: 0 };
const script = { claude: [], codex: [], gemini: [] };
/** Providers the availability probe reports as configured this run. */
const configured = new Set(["claude", "codex", "gemini"]);

function next(who) {
  calls[who] += 1;
  const q = script[who];
  const step = q.length > 1 ? q.shift() : q[0];
  if (step === undefined) throw new Error(`no behaviour scripted for ${who}`);
  if (step instanceof Error) throw step;
  return step;
}

mock.module("@/lib/llm/claude", {
  namedExports: {
    claudeAvailable: () => configured.has("claude"),
    runClaude: async () => ({ value: next("claude"), rung: "direct" }),
    extractJson,
  },
});
mock.module("@/lib/llm/codex", {
  namedExports: {
    codexAvailable: () => configured.has("codex"),
    runCodex: async () => ({ value: next("codex"), rung: "direct" }),
  },
});
mock.module("@/lib/llm/gemini", {
  namedExports: {
    geminiAvailable: () => configured.has("gemini"),
    runGemini: async () => ({ parsed: next("gemini"), usage: undefined }),
  },
});

/** The durable record, kept in memory so the tests can read what the wrapper says
 *  happened — not just what it returned. */
const telemetry = { calls: [], errors: [] };
mock.module("@/lib/llm/telemetry", {
  namedExports: {
    promptFingerprint: () => "fp-test",
    recordLlmCall: async (entry) => {
      telemetry.calls.push(entry);
    },
    recordLlmError: (model, toolId, message) => {
      telemetry.errors.push({ model, toolId, message });
    },
    recordLlmErrorEntry: async (entry) => {
      telemetry.calls.push(entry);
    },
  },
});

const { generateStructured } = await import("@/lib/llm/index.ts");

// ── the request under test ───────────────────────────────────────────────────

const SCHEMA = {
  type: "OBJECT",
  properties: { headline: { type: "STRING" }, body: { type: "STRING" }, cta: { type: "STRING" } },
  required: ["headline", "body", "cta"],
};

const GOOD = { headline: "Nadpis", body: "Text", cta: "Koupit" };
const DEMO = { headline: "demo-headline", body: "demo-body", cta: "demo-cta" };

let demoCalls = 0;
const request = (over = {}) => ({
  id: "fault-injection-probe",
  system: "Jsi tester.",
  prompt: "Vygeneruj inzerát.",
  schema: SCHEMA,
  normalize: (parsed) => parsed,
  demo: () => {
    demoCalls += 1;
    return { ...DEMO };
  },
  ...over,
});

beforeEach(() => {
  calls.claude = calls.codex = calls.gemini = 0;
  script.claude = [GOOD];
  script.codex = [GOOD];
  script.gemini = [GOOD];
  configured.clear();
  for (const p of ["claude", "codex", "gemini"]) configured.add(p);
  telemetry.calls.length = 0;
  telemetry.errors.length = 0;
  demoCalls = 0;
});

const retryable = () => new LlmCallError("server", "poskytovatel vrátil 503");

// ── control: the mocks are actually in the loop ──────────────────────────────

test("control: a healthy provider serves, and the fakes are the ones serving", async () => {
  // If mock.module ever stopped applying, every assertion below would pass for
  // the wrong reason (a real provider is unavailable in CI, so everything would
  // degrade to the demo and "it degraded" would look true). The call counter is
  // what makes the rest of this file mean what it says.
  const { result, meta } = await generateStructured(request());
  assert.equal(calls.claude, 1, "the injected Claude adapter was never called — mock.module is not in the loop.");
  assert.deepEqual(result, GOOD);
  assert.equal(meta.demo, false);
  assert.equal(meta.fellBack, false);
  assert.equal(meta.attempts, 1);
  assert.equal(demoCalls, 0, "the demo builder must not run when a provider answered.");
});

// ── the documented degradation, executed ─────────────────────────────────────

test("every provider down → the deterministic demo, stamped as one", async () => {
  // The property README.md and AGENTS.md both state, and the reason `check:ci`
  // costs nothing to run. It has to hold when providers are CONFIGURED and
  // failing, not only when the provider list is empty.
  script.claude = [retryable()];
  script.codex = [retryable()];
  script.gemini = [retryable()];

  const { result, meta } = await generateStructured(request());

  assert.deepEqual(result, DEMO, "with every provider down the caller must still get the tool's demo result.");
  assert.equal(demoCalls, 1, "the demo builder ran exactly once — not per provider, not zero times.");
  assert.equal(meta.demo, true, "a demo answer that is not stamped `demo: true` renders as a real one.");
  assert.equal(
    meta.fellBack,
    true,
    "providers were configured and tried, so the demo is a FALLBACK — `fellBack: false` would read as 'no " +
      "provider was ever set up', which is a different and much less alarming thing."
  );
});

test("a whole-provider outage is written down, not swallowed", async () => {
  // The failure mode this guards is the quiet one: the user gets a plausible
  // answer, the account is degraded, and nothing durable says so. The admin
  // route and the digest read the telemetry, so the entries ARE the visibility.
  script.claude = [retryable()];
  script.codex = [retryable()];
  script.gemini = [retryable()];

  await generateStructured(request());

  assert.equal(
    telemetry.errors.length,
    3,
    "each exhausted provider must be mirrored as an error; a silent cross-provider walk is invisible to " +
      "everything that reads telemetry."
  );
  const durable = telemetry.calls.filter((e) => e.status === "error");
  assert.equal(durable.length, 3, "each exhausted provider must also leave a DURABLE entry, not just a log line.");
  const demoEntry = telemetry.calls.find((e) => e.demo === true);
  assert.ok(demoEntry, "the demo answer itself must be recorded, or a degraded account looks like an idle one.");
  assert.equal(demoEntry.status, "demo");
  assert.equal(demoEntry.estCostUsd, 0, "the demo touches no provider, so 0 is the honest cost — not `unpriced`.");
});

// ── a provider that errors part-way through ──────────────────────────────────

test("a retryable failure is retried a bounded number of times, then handed on", async () => {
  // Bounded matters as much as retried: an unbounded ladder against a provider
  // that is down is how one hiccup becomes a request that never returns.
  script.claude = [retryable(), retryable(), retryable(), GOOD];
  script.codex = [GOOD];

  const { result, meta } = await generateStructured(request());

  assert.equal(
    calls.claude,
    3,
    chokepoint("the wrapper's bounded retry is three attempts — no more, and no fewer")
  );
  assert.equal(
    calls.codex,
    1,
    chokepoint("the next configured provider serves once the first is exhausted")
  );
  assert.deepEqual(result, GOOD);
  assert.equal(meta.demo, false, "a second healthy provider means there is no reason to degrade to the demo.");
  assert.equal(meta.fellBack, true, "the answer came from a fallback provider and the envelope must say so.");
});

test("a NON-retryable failure is handed on immediately, not retried three times", async () => {
  // Retrying a safety block re-pays for the same refusal. The decision is
  // code-based, so this also proves the wrapper reads the code and not the text.
  script.claude = [new LlmCallError("safety_blocked", "blokováno")];
  script.codex = [GOOD];

  const { meta } = await generateStructured(request());

  assert.equal(calls.claude, 1, "a non-retryable error must cost exactly one call.");
  assert.equal(meta.fellBack, true);
});

test("malformed JSON is survivable: the same provider recovers within its retries", async () => {
  // The observed dev-CLI fault (~1-in-7 calls under model variance). It must not
  // cost a cross-provider fallback, and it must not surface as a degraded answer.
  script.claude = [new LlmCallError("malformed_json", "nevrátil platný JSON"), GOOD];

  const { result, meta } = await generateStructured(request());

  assert.equal(calls.claude, 2);
  assert.equal(calls.codex, 0, "recovering within a provider's own retries must not reach the next provider.");
  assert.deepEqual(result, GOOD);
  assert.equal(meta.attempts, 2, "the envelope must report the attempts the answer actually cost.");
  assert.equal(meta.fellBack, false);
  assert.equal(meta.status, undefined, "a recovered call is an ordinary success — no degradation flag.");
});

// ── a provider that lies: the output parses and is still wrong ───────────────

test("output that parses but is degenerate is not recorded as a healthy success", async () => {
  // The nastiest fault, because nothing throws. A model that stopped mid-JSON, or
  // answered with a one-liner that happens to be valid JSON, reaches the user
  // looking exactly like a good answer unless someone classifies it.
  script.claude = [{ headline: "Nadpis" }]; // two of three required fields missing

  const { meta } = await generateStructured(request());

  assert.equal(
    meta.status,
    "corrupt",
    "a parse missing most of its required fields must be stamped `corrupt`, or the UI renders a truncated " +
      "answer identically to a complete one."
  );
  const entry = telemetry.calls.at(-1);
  assert.equal(
    entry.status,
    "corrupt",
    "the durable entry must carry the same verdict as the envelope — monitoring reading a truncated answer as " +
      "a success is how a broken prompt survives a week."
  );
});

test("fields the schema never declared are dropped before the tool sees them", async () => {
  // A prompt-embedded provider can return anything. Without pruning, an invented
  // field flows into validate()/normalize() and into whatever gets persisted.
  script.claude = [{ ...GOOD, sneaked: "instructions", nested: { x: 1 } }];

  const { result } = await generateStructured(request());

  assert.deepEqual(
    Object.keys(result).sort(),
    ["body", "cta", "headline"],
    "a field outside the schema reached the tool. pruneToSchema is the boundary that keeps a prompt-embedded " +
      "provider's output shaped like the contract."
  );
});

// ── faults that must NOT be absorbed ─────────────────────────────────────────

test("a caller abort surfaces — it never becomes a demo answer", async () => {
  // The caller is gone. Degrading would spend the demo path and, worse, teach the
  // envelope to say `demo: true` for a request nobody is reading.
  const ac = new AbortController();
  ac.abort();
  script.claude = [new LlmCallError("aborted", "zrušeno")];

  await assert.rejects(
    () => generateStructured(request({ signal: ac.signal })),
    (err) => err instanceof LlmCallError && err.code === "aborted"
  );
  assert.equal(calls.codex, 0, "an abort must not fall over to the next provider.");
  assert.equal(demoCalls, 0, "an abort must not degrade to the demo.");
});

test("a BYOM user fault surfaces instead of quietly moving onto the app's own provider", async () => {
  // The user's key is bad / out of credit / names a model they cannot reach.
  // Falling back would spend the operator's budget to hide the user's problem,
  // and the user would never learn their key is broken.
  script.claude = [new ByomUserError("auth", "openai", "Klíč je neplatný nebo vypršel.", 401)];

  await assert.rejects(() => generateStructured(request()), (err) => err instanceof ByomUserError);
  assert.equal(
    calls.codex,
    0,
    chokepoint("a user-side BYOM fault never reaches the app's own providers")
  );
  assert.equal(
    demoCalls,
    0,
    chokepoint("a user-side BYOM fault never degrades to the demo either")
  );
});

test("a bug in our own normalize is an app error, not a provider failure", async () => {
  // The subtle one the wrapper is deliberately structured around: normalize()
  // runs OUTSIDE the provider try. If it were inside, a mapper bug would be
  // recorded as phantom success telemetry and then charged again against the
  // next provider — a bug in our code, silently billed as an outage.
  script.claude = [GOOD];
  const boom = new Error("normalize is broken");

  await assert.rejects(
    () => generateStructured(request({ normalize: () => { throw boom; } })),
    (err) => err === boom
  );
  assert.equal(calls.claude, 1);
  assert.equal(
    calls.codex,
    0,
    chokepoint("a throw from our own normalize is never retried against another provider — that is real spend")
  );
  assert.equal(demoCalls, 0, "a mapper throw must not be hidden behind the demo.");
  assert.ok(
    telemetry.calls.every((e) => e.status !== "error"),
    "our own bug must not be written down as a provider error."
  );
});

// ── the empty case, for completeness ─────────────────────────────────────────

test("no provider configured at all → the demo, and it does not claim to have fallen back", async () => {
  configured.clear();

  const { result, meta } = await generateStructured(request());

  assert.deepEqual(result, DEMO);
  assert.equal(meta.demo, true);
  assert.equal(
    meta.fellBack,
    false,
    "nothing was tried, so nothing fell back. Telling a clean checkout its providers failed would send a " +
      "reader looking for an outage that does not exist."
  );
  assert.equal(telemetry.errors.length, 0, "an unconfigured install is not an incident.");
});
