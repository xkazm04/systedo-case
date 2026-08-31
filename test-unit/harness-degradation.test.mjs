/** The half of the harness that can be ABSENT rather than red — drilled, not assumed.
 *
 *  Part B of the rubric review runs only when ANTHROPIC_API_KEY is configured, and
 *  the real-model prove was retired from `check:ci` in August and now runs weekly
 *  with a provider key. Both are the right call, and together they mean this
 *  harness can run at half strength while every build stays green: a key expires
 *  without a commit, so it expires without a build.
 *
 *  scripts/harness-degradation.mjs makes the absence an event, and these tests are
 *  the drill. Two of them SPAWN the real script — a fire alarm nobody has ever set
 *  off is a fire alarm nobody knows is wired:
 *
 *    • --drill removes each capability's key ON PURPOSE and asserts the real
 *      announce path still emits a `::warning` annotation, a job-summary line and
 *      an `absent` row that outlives the run;
 *    • --check goes red when a workflow reaches for a secret no capability
 *      declares, which is how the NEXT key-gated step is stopped from inheriting
 *      the same silence.
 *
 *  Both are offline, key-free and free, so they block: this file runs in
 *  `npm run test:unit` → `npm run check:ci` → `.husky/pre-push`, the hook that
 *  proves a change before Vercel ships master.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES, capabilityFor, isConfigured } from "../scripts/harness-degradation.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const SCRIPT = join(ROOT, "scripts", "harness-degradation.mjs");

const run = (args, env) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(env ?? {}) },
  });

const scratch = () => mkdtempSync(join(tmpdir(), "harness-degradation-"));

// --- the drill: take the key away and listen ---------------------------------

test("the drill removes each key on purpose, and the absence is audible", () => {
  const res = run(["--drill"]);
  assert.equal(
    res.status,
    0,
    `\`node scripts/harness-degradation.mjs --drill\` is red:\n\n${res.stdout}\n${res.stderr}\n\n` +
      "A red drill means a half of this harness could stop running without emitting anything — which is the " +
      "exact failure this script exists to make impossible."
  );
  for (const cap of CAPABILITIES.filter((c) => c.announces)) {
    assert.match(res.stdout, new RegExp(`✓ ${cap.id}`), `the drill did not prove \`${cap.id}\` announces itself.`);
  }
});

test("with no key the announce path degrades — it does not fail the build", () => {
  const dir = scratch();
  const out = join(dir, "harness-status.json");
  const summary = join(dir, "summary.md");
  writeFileSync(summary, "");
  const res = run(["--announce", "judgment-review", "--status", "auto", "--out", out, "--summary", summary], {
    ANTHROPIC_API_KEY: "",
    HAS_ANTHROPIC_API_KEY: "false",
  });

  assert.equal(res.status, 0, "a missing key is a degradation, not a build failure — Part B never blocks.");
  assert.match(res.stdout, /::warning/, "no check annotation, so the degraded run looks like a clean one.");
  assert.match(res.stdout, /ANTHROPIC_API_KEY/, "the annotation does not name the key that is missing.");
  assert.match(readFileSync(summary, "utf8"), /Harness degraded/);

  const recorded = JSON.parse(readFileSync(out, "utf8")).capabilities["judgment-review"];
  assert.equal(recorded.status, "absent");
  assert.equal(recorded.needs, "ANTHROPIC_API_KEY");
  assert.ok(
    String(recorded.absent ?? "").length > 40,
    "the recorded row says the capability was absent without saying what stopped happening, so the artifact " +
      "cannot be read a month later."
  );
});

test("with a key it records that it ran, so the trail can tell the two apart", () => {
  const dir = scratch();
  const out = join(dir, "harness-status.json");
  const res = run(["--announce", "judgment-review", "--status", "auto", "--out", out], {
    HAS_ANTHROPIC_API_KEY: "true",
  });
  assert.equal(res.status, 0);
  assert.doesNotMatch(res.stdout, /::warning/, "a run at full strength must not cry wolf.");
  assert.equal(JSON.parse(readFileSync(out, "utf8")).capabilities["judgment-review"].status, "ran");
});

test("presence can be reported without the secret ever being handed over", () => {
  // The weekly report binds `secrets.X != ''`, never `secrets.X`: it runs scripts
  // out of the checkout, so it is deliberately not a job that holds a key.
  const cap = capabilityFor("judgment-review");
  assert.equal(isConfigured(cap, { HAS_ANTHROPIC_API_KEY: "true" }), true);
  assert.equal(isConfigured(cap, { HAS_ANTHROPIC_API_KEY: "false", ANTHROPIC_API_KEY: "sk-real" }), false);
  assert.equal(isConfigured(cap, { ANTHROPIC_API_KEY: "sk-real" }), true);
  assert.equal(isConfigured(cap, {}), false);
});

// --- the anti-drift rule: nothing key-gated lands undeclared -------------------

test("every key-gated step in this repository is declared", () => {
  const res = run(["--check"]);
  assert.equal(
    res.status,
    0,
    `\`node scripts/harness-degradation.mjs --check\` is red on this tree:\n\n${res.stdout}\n${res.stderr}`
  );
});

test("a workflow reaching for an undeclared secret fails the check", () => {
  const dir = scratch();
  cpSync(join(ROOT, ".github", "workflows"), dir, { recursive: true });
  writeFileSync(
    join(dir, "zz-new-thing.yml"),
    ["name: New thing", "on:", "  push:", "permissions:", "  contents: read", "jobs:", "  go:", "    runs-on: ubuntu-latest", "    steps:", "      - env:", "          KEY: ${{ secrets.SOME_NEW_MODEL_KEY }}", "        run: node scripts/whatever.mjs", ""].join("\n")
  );
  const res = run(["--check", "--workflows", dir]);
  assert.equal(res.status, 1, "a step conditional on a new secret must not land without declaring how its absence shows.");
  const output = `${res.stdout}${res.stderr}`;
  assert.match(output, /SOME_NEW_MODEL_KEY/);
});

// --- the wiring, without which none of the above is load-bearing --------------

test("the review workflow announces on BOTH sides of its keyless branch", () => {
  const wf = read(".github/workflows/agent-review.yml")
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
  const announces = [...wf.matchAll(/harness-degradation\.mjs --announce judgment-review --status (\w+)/g)].map(
    (m) => m[1]
  );
  assert.ok(
    announces.includes("absent"),
    "the keyless branch of Part B no longer announces its own absence — the harness can run at half strength " +
      "with nothing on the run to show for it."
  );
  assert.ok(
    announces.includes("ran"),
    "nothing records the runs that DID have a key, so `absent` cannot be told apart from a workflow that was " +
      "never reached."
  );
  assert.match(
    wf,
    /name: harness-status/,
    "the harness verdict is not kept as an artifact, so which strength a given commit was reviewed at stops " +
      "being answerable once the run's logs age out."
  );
});

test("the drill runs weekly too, and its result is published, not just logged", () => {
  const history = read(".github/workflows/agent-review-history.yml");
  assert.match(
    history,
    /harness-degradation\.mjs --drill/,
    "the weekly trail no longer drills the harness, so 'is Part B still there?' goes back to being a question " +
      "somebody has to think to ask."
  );
  assert.match(
    history,
    /HAS_ANTHROPIC_API_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY != '' \}\}/,
    "the weekly report no longer reads whether the key is configured — the drill proves the alarm works, this " +
      "is the half that says whether it is ringing. It must stay a boolean: this job runs repository code."
  );
  assert.doesNotMatch(
    history.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n"),
    /:\s*\$\{\{ secrets\.[A-Z_]+ \}\}/,
    "the aggregating job now holds a real secret. It executes scripts out of the checkout; presence is all it " +
      "needs, and presence is a boolean."
  );
});

test("every declared capability says what its absence costs and where it shows", () => {
  assert.ok(CAPABILITIES.length >= 2, "the two conditional halves (Part B, the weekly prove) must both be declared.");
  for (const cap of CAPABILITIES) {
    assert.ok(/^[a-z0-9-]+$/.test(cap.id), `${cap.id}: ids are kebab-case slugs.`);
    assert.ok(String(cap.absent).length > 40, `${cap.id}: \`absent\` must say what stops happening.`);
    assert.ok(String(cap.visible).length > 40, `${cap.id}: \`visible\` must say how the absence is noticed.`);
    assert.ok(existsSync(join(ROOT, cap.workflow)), `${cap.id}: names ${cap.workflow}, which does not exist.`);
    if (!cap.announces) {
      assert.ok(existsSync(join(ROOT, cap.recordedBy)), `${cap.id}: names ${cap.recordedBy}, which does not exist.`);
      assert.ok(
        read(cap.recordedBy).includes(cap.marker),
        `${cap.id}: ${cap.recordedBy} no longer writes \`${cap.marker}\`, so the skip it records for itself may ` +
          "have become a silent green."
      );
    }
  }
});
