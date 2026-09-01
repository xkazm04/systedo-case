/** The seams AGENTS.md states in prose, asserted as lint rules that exist.
 *
 *  `eslint.config.mjs` was the vendor default and nothing else for the life of this
 *  repository, which meant the constraints an agent reads in AGENTS.md — one LLM
 *  chokepoint, a store seam between a route and a driver, no route segment-config
 *  opt-out under `cacheComponents` — were enforced by a reviewer noticing. ~97% of
 *  commits here are written by an agent, so "a reviewer notices" is a slow, lossy
 *  channel for a rule that should simply fail.
 *
 *  ESLint is the thing that now fails: `npm run lint` sits inside `npm run check`,
 *  inside `check:ci`, inside `.husky/pre-push`. These tests do not re-implement the
 *  rules — they assert the fences are still DECLARED, and declared at full width, so
 *  that quietly dropping a restricted name (the cheapest way to make a red build
 *  green) turns the unit suite red instead. Same shape and same reason as
 *  test-unit/delivery-contract.test.mjs.
 *
 *  WHAT IT CANNOT SEE, and where that half lives. Every assertion below is about the
 *  config's TEXT, so it passes unchanged when the fence is still written down and has
 *  stopped MATCHING — a `files:` glob that no longer covers the tree, a block order
 *  that lets a later rule replace an earlier one's options, an upstream change to how
 *  `allowImportNames` behaves. test-unit/lint-fence-firing.test.mjs asks the other
 *  question by running the linter over deliberate violations
 *  (`npm run lint:fences`). Keep the two together: this one says the fence is
 *  declared, that one says it still fires.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const config = read("eslint.config.mjs");
const scripts = JSON.parse(read("package.json")).scripts ?? {};

test("the linter is inside the blocking gate at all", () => {
  // A fence that no gate runs is a comment with a stricter syntax.
  assert.match(scripts.lint ?? "", /eslint/);
  assert.match(scripts.check ?? "", /npm run lint/, "`npm run check` no longer lints, so nothing runs these rules.");
  assert.match(scripts["check:ci"] ?? "", /npm run check\b/);
});

test("the LLM chokepoint is fenced, not merely documented", () => {
  // src/lib/llm/index.ts is where the provider order, BYOM keys, the demo
  // fallback, metering, telemetry and the language check live. A second client
  // built elsewhere opts out of all of them at once, and nothing about the code
  // that does it looks wrong in review.
  assert.match(
    config,
    /"no-restricted-imports"/,
    "eslint.config.mjs no longer restricts any import, so the chokepoint and the store seam are prose again."
  );
  assert.match(config, /@google\/genai/);
  assert.match(
    config,
    /importNames:\s*\["GoogleGenAI"\]/,
    "the fence on constructing a Gemini client outside src/lib/llm/ is gone."
  );
  for (const adapter of ["@/lib/llm/gemini", "@/lib/llm/claude", "@/lib/llm/codex"]) {
    assert.ok(
      config.includes(adapter),
      `${adapter} is a provider adapter and is no longer fenced — anything may now call it directly instead ` +
        "of going through generateStructured()."
    );
  }
});

test("the store seam is fenced: a route may not reach for a driver", () => {
  // Prod is Firestore, local dev is node:sqlite, and the pair is env-switched
  // behind one interface. A page that imports a driver picks a backend, breaks
  // LOCAL_DB, and skips the tenant key the store applies — which is the thing that
  // makes cross-user IDOR impossible by construction.
  assert.match(config, /"firebase-admin",\s*"firebase-admin\/\*",\s*"node:sqlite"/);
  assert.match(
    config,
    /files:\s*\["src\/lib\/\*\*\/\*\.\{ts,tsx\}"\]/,
    "the relaxation for src/lib/ is gone; either the drivers are now banned in the layer that owns them, or " +
      "the whole fence was rewritten."
  );
});

test("route segment config is refused at full width", () => {
  // cacheComponents is on, so a segment-level opt-out un-caches a whole route to
  // serve one dynamic read. Part A of the rubric refuses it in a diff; this refuses
  // it in the editor. Dropping one name from the list is the cheap way out.
  assert.match(config, /"no-restricted-exports"/);
  for (const name of ["dynamic", "runtime", "revalidate", "fetchCache", "dynamicParams"]) {
    assert.match(
      config,
      new RegExp(`"${name}"`),
      `\`export const ${name}\` is no longer refused under src/app/. scripts/agent-review.mjs (rule A2) ` +
        "refuses exactly these five; the two lists must not drift."
    );
  }
  // maxDuration and preferredRegion are Vercel function settings, not caching
  // opt-outs, and the repo uses both. Restricting them would be a false positive
  // that gets the whole rule switched off.
  assert.doesNotMatch(config, /restrictedNamedExports:[^\]]*"maxDuration"/);
});

test("a fence says which design it wanted, not only that it said no", () => {
  // The failure message is the one moment the constraint has the reader's full
  // attention, and an agent that has just been refused does one of two things:
  // finds the design the rule wanted, or reaches for a disable comment. Which one
  // happens is decided by the message — so every fence here names an ALTERNATIVE
  // and the record that argued for it, the same way scripts/gate-remedy.mjs makes
  // every gate in check:ci print its next command.
  for (const adr of ["docs/adr/0003-single-llm-chokepoint.md", "docs/adr/0001-dual-store-seam.md"]) {
    assert.ok(
      config.includes(adr),
      `no fence message points at ${adr} any more. A message that names the rule and not the decision leaves ` +
        "the reader to re-derive it, which is the cost eslint.config.mjs exists to stop paying."
    );
    assert.ok(existsSync(join(ROOT, adr)), `a fence message points at ${adr}, and that file does not exist.`);
  }
  // The segment-config fence is the one whose right answer is least guessable from
  // the refusal: `no-restricted-exports` can only print "'dynamic' is restricted
  // from being exported", and deleting the export is the wrong fix. The sentence
  // that names <Suspense> rides on `no-restricted-syntax`, which takes a message.
  assert.match(
    config,
    /"no-restricted-syntax"/,
    "the route segment-config fence no longer carries a message, so all it can tell an agent is the name of " +
      "the rule it broke — and the obvious next move from there is to delete the dynamic read."
  );
  assert.match(config, /Suspense/, "the segment-config message no longer names the boundary that replaces it.");
});
