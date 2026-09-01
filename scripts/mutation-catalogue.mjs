/** The mutation-drill catalogue: wrong answers, and the tests that must notice.
 *
 *  Data only — no I/O, nothing runs on import. Two readers, deliberately:
 *  `scripts/mutation-drill.mjs` applies these (reporting rung, weekly), and
 *  `test-unit/mutation-census.test.mjs` asserts the catalogue still describes the
 *  tree on every build (blocking). A drill whose anchors have drifted still prints
 *  a score, which is why the second reader exists.
 *
 *  WHICH SEAMS EARN A MUTANT. The ones where a wrong answer is not a bug report
 *  but a bill or a breach — AGENTS.md § Red, in code. Adding a seam here is the
 *  cheapest way to widen the measure; the census will hold you to it.
 *
 *  Each mutant TYPE-CHECKS, is one line, and is the shape a careless refactor or a
 *  generated "simplification" actually produces — an inverted early return, a `>`
 *  that became `>=`, an exact-match that became truthiness. Nothing here is a typo.
 */

/** `find` is matched literally and must occur EXACTLY ONCE in `file`. `tests`
 *  names the files that claim the seam — only those are run, which is what makes a
 *  full pass cheap enough to do every mutant in one go. `killedBy` names the
 *  assertion expected to fire; it is reported, never asserted, because which
 *  assertion bites is the measurement. */
export const MUTANTS = [
  {
    id: "cron-fails-open",
    seam: "Cron auth — the Bearer guard on six /api/cron/* endpoints",
    file: "src/lib/cron-auth.ts",
    tests: ["test-unit/cron-auth.test.mjs"],
    find: "  if (!secret) return false; // disabled until a secret is configured",
    replace: "  if (!secret) return true; // disabled until a secret is configured",
    why:
      "the fail-CLOSED branch is inverted, so a deployment with no CRON_SECRET configured authorizes " +
      "everyone instead of nobody — six unauthenticated endpoints, and every local run still green.",
    killedBy: "fails CLOSED: with no CRON_SECRET configured, nobody is authorized",
  },
  {
    id: "cron-undigested-compare",
    seam: "Cron auth — equal-length inputs to timingSafeEqual",
    file: "src/lib/cron-auth.ts",
    tests: ["test-unit/cron-auth.test.mjs"],
    find: "  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));",
    replace: "  return timingSafeEqual(Buffer.from(header), Buffer.from(`Bearer ${secret}`));",
    why:
      "both sides stop being hashed to a fixed 32 bytes. `timingSafeEqual` throws on unequal-length " +
      "buffers, so every probe with a wrong-length header becomes a 500 rather than a 401 — and the " +
      "secret's LENGTH starts leaking through the difference between the two.",
    killedBy: "a wrong-LENGTH header is a false, not a throw",
  },
  {
    id: "ceiling-off-by-one",
    seam: "Spend ceiling — AI_GLOBAL_DAILY_CEILING (src/lib/ai/durable-limit.ts delegates every decision here)",
    file: "src/lib/ai/durable-limit-core.ts",
    tests: ["test-unit/durable-limit-core.test.mjs"],
    find: "  return ceiling > 0 && used + units > ceiling;",
    replace: "  return ceiling > 0 && used + units >= ceiling;",
    why:
      "one comparison moves by a unit, so the last allowed paid call of the day is refused. It is off by " +
      "one in the SAFE direction; the same edit the other way is what overspends, and a suite that cannot " +
      "see this one cannot see that one.",
    killedBy: "ceilingExceeded gates on used+units vs ceiling",
  },
  {
    id: "window-forgets-current",
    seam: "Per-IP rate limit — the fixed-window reset",
    file: "src/lib/ai/durable-limit-core.ts",
    tests: ["test-unit/durable-limit-core.test.mjs"],
    find: "  if (stored && (stored.windowStart ?? 0) >= windowStart) return stored.count ?? 0;",
    replace: "  if (stored && (stored.windowStart ?? 0) > windowStart) return stored.count ?? 0;",
    why:
      "the CURRENT window's stored count stops counting, so every request reads 0 and no per-IP cap ever " +
      "binds. The limiter still runs, still writes its documents, and refuses nobody.",
    killedBy: "currentCount keeps the stored count only within the same window",
  },
  {
    id: "rate-doc-id-path-escape",
    seam: "Rate-limit document ids — a Firestore path component",
    file: "src/lib/ai/durable-limit-core.ts",
    tests: ["test-unit/durable-limit-core.test.mjs"],
    find: '  return `${bucket}__${ip}`.replace(/\\//g, "_").slice(0, 1400);',
    replace: "  return `${bucket}__${ip}`.slice(0, 1400);",
    why:
      "a slash in a bucket or an IP survives into the document id, so the counter escapes into a nested " +
      "sub-collection — a caller is then counted somewhere the guard never reads back.",
    killedBy: "rateDocId joins bucket + ip, strips slashes",
  },
  {
    id: "truthy-arms-sklik-writes",
    seam: "Live ad writes, rail 3 — SKLIK_WRITES_ENABLED (AGENTS.md § Red)",
    file: "src/lib/campaigns/mutator.ts",
    tests: ["test-unit/campaigns-mutator.test.mjs"],
    find: '  return env[SKLIK_WRITES_ENV] === "1";',
    replace: "  return Boolean(env[SKLIK_WRITES_ENV]);",
    why:
      'the exact-"1" rule becomes truthiness, so any non-empty value — a typo, a copied `.env` line, the ' +
      'string "false" — arms real mutations on a live Sklik account. Of every edit in this repository, ' +
      "this is the one with the largest gap between how it reads and what it does.",
    killedBy: 'the env name is SKLIK_WRITES_ENABLED and only the exact string "1" arms it',
  },
  {
    id: "unsettled-money-unit-writable",
    seam: "Live ad writes, rail 2 — the Sklik money-unit verdict",
    file: "src/lib/campaigns/mutator.ts",
    tests: ["test-unit/campaigns-mutator.test.mjs"],
    find: '  return conn.halereConfirmed === true || conn.moneyVerdict === "czk-plausible";',
    replace: '  return conn.halereConfirmed === true || conn.moneyVerdict !== "halere-suspected";',
    why:
      "the rule flips from `we checked and it reconciles` to `we have not seen a problem`, so a brand-new " +
      "account with no verdict at all becomes writable. A budget written under an unsettled money unit is " +
      "off by two orders of magnitude on a real advertiser's spend.",
    killedBy: "sklikWritable is a full verdict × confirmed table",
  },
  {
    id: "byom-fault-absorbed",
    seam: "LLM chokepoint — a user-side BYOM fault must not reach the app's own paid providers",
    file: "src/lib/llm/index.ts",
    tests: ["test-unit/fault-injection-llm.test.mjs"],
    find: "      if (err instanceof ByomUserError) throw err;",
    replace: "      if (err instanceof ByomUserError && idx > 0) throw err;",
    why:
      "the guard becomes conditional on having already fallen back, so a bad or expired USER key on the first " +
      "provider falls straight through to the operator's own metered provider. The caller gets a plausible " +
      "answer, the operator pays for it, and the user never learns their key is broken.",
    killedBy: "a BYOM user fault surfaces instead of quietly moving onto the app's own provider",
  },
  {
    id: "retry-bound-off-by-one",
    seam: "LLM chokepoint — the bounded retry ladder (every attempt is a paid call)",
    file: "src/lib/llm/index.ts",
    tests: ["test-unit/fault-injection-llm.test.mjs"],
    find: "      const first = await runWithRetry(provider, baseCall, 3);",
    replace: "      const first = await runWithRetry(provider, baseCall, 4);",
    why:
      "the retry bound moves by one, so a provider having a bad day costs a third more model calls on every " +
      "request that reaches it — across three providers and a self-repair re-prompt. It is the same edit that " +
      "turns a bound into no bound at all, and nothing about the answer changes, so only a count can see it.",
    killedBy: "the wrapper's bounded retry is three attempts — no more, and no fewer",
  },
  {
    id: "tenant-key-loses-project-scope",
    seam: "Store seam — the tenant key that makes cross-project reads impossible by construction (ADR-0002)",
    file: "src/lib/campaigns/store-keys.ts",
    tests: ["test-unit/campaigns-tenant-keys.test.mjs"],
    find: "    ? `u_${safeKeyComponent(userId)}_proj_${safeKeyComponent(projectId)}`",
    replace: "    ? `u_${safeKeyComponent(userId)}`",
    why:
      "the two ternary branches collapse into one — the shape a 'both sides are the same, simplify it' refactor " +
      "actually produces — and every project a user owns starts sharing a single tenant. Nothing 401s and no " +
      "query changes: one advertiser's campaigns, budgets and audit history are simply served under another " +
      "project's view.",
    killedBy: "buildTenantKey is per-user, per-project, per-account and composes in that order",
  },
  {
    id: "tenant-key-unsanitised",
    seam: "Store seam — key components are sanitised before they become a document path",
    file: "src/lib/campaigns/store-keys.ts",
    tests: ["test-unit/campaigns-tenant-keys.test.mjs"],
    find: '  return s.replace(/[^A-Za-z0-9_-]/g, "_");',
    replace: "  return s;",
    why:
      "a `/` in a userId, a projectId or a customerId survives into the tenant key, so the tenant escapes the " +
      "document id and becomes a nested sub-collection path. The same class as `rate-doc-id-path-escape`, on " +
      "the key ADR-0002 makes the whole tenancy boundary out of — and every builder here shares this one helper, " +
      "so the read, sync and audit paths all escape together.",
    killedBy: "every key component is sanitised so a '/' can't break out of the Firestore path",
  },
];

/** The number of mutants this catalogue must carry, and the floor no diff may take
 *  it below.
 *
 *  WHY A FLOOR AND NOT JUST A SCORE. The drill already fails on a SURVIVOR: a wrong
 *  answer the tests call green exits 1 and turns the weekly job red. What nothing
 *  measured is the measure itself SHRINKING. A mutant deleted — because it started
 *  surviving, because a refactor moved its anchor and re-anchoring looked like work,
 *  because an agent under a wall clock reached for the fastest green — costs nothing:
 *  the census still passes, the drill still prints a perfect score, and it is a
 *  perfect score over less of the tree. That is the one direction in which this
 *  repository's sensitivity measure can get worse without a single build going red.
 *
 *  So the count is pinned, and the pin is in .github/contract-ledger.json (rule
 *  `mutation catalogue floor`) like every other number that decides what red means:
 *  moving it is a two-line diff with the sentence next to it, not a digit. It may
 *  rise freely — widening the measure is the point — and it may not fall.
 *  test-unit/mutation-census.test.mjs enforces it on every build. */
export const MUTANT_FLOOR = 11;

/** …and PER SEAM, which is the honest shape. A repo-wide count can stay level while
 *  the coverage moves off the seam that matters: drop both Sklik mutants, add two
 *  more to the rate limiter, and the total is unchanged while the only path in this
 *  repository that spends an advertiser's money is no longer measured at all.
 *
 *  Keyed by the file, valued by the minimum number of mutants it must carry. Every
 *  entry is a seam where a wrong answer is a bill or a breach (AGENTS.md § Red), and
 *  each floor is what the catalogue holds today — green on arrival (ADR-0007). A new
 *  money seam belongs here WITH its mutants; a seam that stops existing comes off in
 *  the diff that deletes it, which is a line a reviewer reads. */
export const SEAM_FLOORS = {
  "src/lib/cron-auth.ts": 2,
  "src/lib/ai/durable-limit-core.ts": 3,
  "src/lib/campaigns/mutator.ts": 2,
  // The two seams eslint.config.mjs draws a LINT FENCE around — the only two
  // constraints in this repository important enough to be enforced in the editor.
  // A fence says the call must go through here; it says nothing about whether
  // "here" still behaves. Both were unmeasured by this drill until 2026-09-01.
  "src/lib/llm/index.ts": 2,
  "src/lib/campaigns/store-keys.ts": 2,
};

/** What a green drill still does NOT prove. Printed with every run, because a
 *  score with no honest limit next to it reads as a guarantee. */
export const CANNOT_SEE = [
  "a property with no observable behaviour — a constant-time compare replaced by `===` changes no answer, " +
    "so no unit test can kill it and no mutant here pretends otherwise",
  "a seam with no mutant in the catalogue: this is five modules, not the tree",
  "anything that needs a real store, a real provider or a browser (that is test:e2e and llm:drift)",
  "a test that is vacuous about something no mutant touches — a kill proves THIS wrong answer is seen",
];

/** The node flags `npm run test:unit` uses, parsed out of package.json rather than
 *  restated — a suite that grows a loader flag must not silently stop being
 *  runnable here. Everything between `node` and `--test` is the flag set; the glob
 *  after it is replaced by the files a mutant's seam is claimed by. Returns null
 *  when the script no longer has that shape, which the drill treats as fatal and
 *  the census reports as a red build. */
export function unitTestFlags(testScript) {
  const m = /^node\s+([\s\S]*?)\s*--test\s/.exec(String(testScript));
  if (!m) return null;
  return m[1].trim().split(/\s+/).filter(Boolean);
}
