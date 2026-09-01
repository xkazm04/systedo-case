#!/usr/bin/env node
/** Do the seam fences still FIRE? — the linter, asked a violation it must refuse.
 *
 *  WHAT WAS MISSING. `eslint.config.mjs` carries three architectural constraints
 *  that AGENTS.md states in prose and that nothing else in the editor enforces: one
 *  LLM chokepoint, the store seam between a route and a driver, and no route
 *  segment-config opt-out under Cache Components. They are BLOCKING — `npm run lint`
 *  sits inside `npm run check`, inside `check:ci`, inside `.husky/pre-push`.
 *
 *  `test-unit/lint-fences.test.mjs` holds them to the tree, and it holds them as
 *  TEXT: the restricted names are still spelled out in the config, the messages
 *  still name an ADR. That is the right check for "somebody quietly deleted a name
 *  from the list", and it is blind to the failure that actually costs something —
 *  the fence is still written down and no longer MATCHES. A flat-config `files:`
 *  glob that stops covering the tree, a merge order that lets a later block replace
 *  an earlier block's options, an ESLint or `eslint-config-next` major that changes
 *  how `no-restricted-imports` treats `allowImportNames`, a widened `globalIgnores`:
 *  each of those leaves every string this repository asserts exactly where it is,
 *  and turns the rule off. A fence that silently passes is indistinguishable from a
 *  codebase with no violations — which is precisely what a green `npm run lint`
 *  would then report, on every build, for as long as nobody noticed.
 *
 *  SO THIS ASKS THE LINTER. Each case below is a small violating (or deliberately
 *  legal) module, linted through the real `ESLint` API against this repository's own
 *  `eslint.config.mjs`, at a real path inside the glob whose fence is under test.
 *  A case that must FIRE and does not is the finding, and so is a case that must
 *  stay QUIET and does not: a fence which has widened until it refuses legal code is
 *  the other way these rules die, because the first thing that happens then is an
 *  `eslint-disable` or a deletion.
 *
 *  THE CONTROLS ARE THE POINT. `geminiAvailable`, the `Type` schema enum,
 *  `maxDuration`, `firebase-admin` inside `src/lib/`, and `@google/genai` inside
 *  `src/lib/llm/` are all legal on purpose. Without them a drill that reported
 *  "everything errors" would pass, and a rule that fires on everything is a rule
 *  somebody switches off by the end of the week.
 *
 *  NO NEW DEPENDENCY (docs/adr/0008-zero-dependency-tooling.md): `eslint` is already
 *  a devDependency here, and this runs the same binary `npm run lint` does.
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md): BLOCKING. Every case passes on the
 *  tree as it stands, so a red one is a fence that stopped matching — never
 *  pre-existing debt. It runs inside `npm run test:unit`
 *  (test-unit/lint-fence-firing.test.mjs) rather than as its own stage of
 *  `check:ci`, so it costs one ESLint config load and still refuses a push.
 *
 *  WHAT IT CANNOT SEE. Whether the fence is drawn in the right PLACE — that a new
 *  provider adapter got added to `src/lib/llm/` and nobody listed it, or that a
 *  fourth seam deserves a fence — is a judgment, and it stays with
 *  `test-unit/lint-fences.test.mjs`'s census of the config's own blocks. This
 *  answers the narrower question that had no answer at all: given the fence that IS
 *  declared, does the linter still act on it?
 *
 *  Usage:
 *    npm run lint:fences          # the table: every case, and what the linter said
 *    npm run lint:fences:check    # exit 1 when a fence stopped firing
 *    node scripts/lint-fence-drill.mjs --list
 */
import { ESLint } from "eslint";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const LIST = argv.includes("--list");
// `--check` is the exit-code form. The drill exits non-zero on a broken fence
// either way; the flag exists so the npm script reads like every other gate here.
const CHECK = argv.includes("--check");
/** The negative control, and the reason this drill can be believed.
 *
 *  A check that has stopped detecting looks exactly like a tree with nothing wrong
 *  in it — which is the failure this whole file exists to end, so it would be absurd
 *  to leave the drill itself standing on the same assumption. `--without-fences`
 *  runs every case above against this repository's OWN config with the `adamant/*`
 *  blocks removed, in memory, and must go RED. test-unit/lint-fence-firing.test.mjs
 *  requires exactly that, so a drill that has quietly stopped measuring anything
 *  fails the unit suite instead of printing a confident tick. */
const WITHOUT_FENCES = argv.includes("--without-fences");

/** The blocks in eslint.config.mjs this drill claims to exercise, by their `name:`.
 *
 *  `test-unit/lint-fence-firing.test.mjs` reads the same names out of the config and
 *  fails when one of them has no case here — so a FOURTH fence cannot land with
 *  nothing rehearsing it, which is how the first three came to be untested. */
export const FENCES = [
  "adamant/seams",
  "adamant/seams-lib",
  "adamant/seams-llm-chokepoint",
  "adamant/route-segment-config",
];

/** A real file inside the glob under test. The fixture's TEXT is what gets linted —
 *  nothing is written to disk — but the PATH has to be one the flat config actually
 *  resolves, which is the whole property being measured. Candidates rather than one
 *  hard-coded path so a rename moves the drill instead of breaking it. */
function pathInside(label, candidates) {
  const found = candidates.find((rel) => existsSync(join(ROOT, rel)));
  if (!found) {
    throw new Error(
      `lint fence drill: no file exists for the "${label}" position (tried ${candidates.join(", ")}). ` +
        "The drill lints fixture TEXT at a real path — pick another file in that directory and list it here."
    );
  }
  return found;
}

const AT_APP = pathInside("under src/app/", ["src/app/layout.tsx", "src/app/page.tsx"]);
const AT_COMPONENT = pathInside("under src/ but outside src/lib/", [
  "src/components/ui.tsx",
  "src/auth.ts",
]);
const AT_LIB = pathInside("under src/lib/ but outside src/lib/llm/", [
  "src/lib/cron-auth.ts",
  "src/lib/session.ts",
]);
const AT_CHOKEPOINT = pathInside("under src/lib/llm/", ["src/lib/llm/index.ts"]);

/** id      — stable, so a failure names one case.
 *  fence   — the block in eslint.config.mjs it exercises.
 *  at      — which position (and therefore which config blocks apply).
 *  code    — the fixture, linted as text.
 *  fires   — rule ids that MUST report on it.
 *  quiet   — rule ids that must NOT report on it.
 *  why     — what a red on this case means, in the failure message. */
export const CASES = [
  // --- the LLM chokepoint ----------------------------------------------------
  {
    id: "chokepoint-client-outside-llm",
    fence: "adamant/seams",
    at: AT_COMPONENT,
    code: 'import { GoogleGenAI } from "@google/genai";\nexport const client = GoogleGenAI;\n',
    fires: ["no-restricted-imports"],
    quiet: [],
    why:
      "a module outside src/lib/llm/ can construct its own Gemini client again, skipping the provider order, " +
      "BYOM keys, the demo fallback, metering and telemetry (docs/adr/0003-single-llm-chokepoint.md).",
  },
  {
    id: "chokepoint-client-inside-lib",
    fence: "adamant/seams-lib",
    at: AT_LIB,
    code: 'import { GoogleGenAI } from "@google/genai";\nexport const client = GoogleGenAI;\n',
    fires: ["no-restricted-imports"],
    quiet: [],
    why:
      "src/lib/ relaxes the STORE seam and must not relax the chokepoint — a lib module is no more entitled to " +
      "build its own client than a route is.",
  },
  {
    id: "chokepoint-adapter-outside-llm",
    fence: "adamant/seams",
    at: AT_COMPONENT,
    code: 'import { generateWithGemini } from "@/lib/llm/gemini";\nexport const gen = generateWithGemini;\n',
    fires: ["no-restricted-imports"],
    quiet: [],
    why: "a provider adapter is importable as an entry point again, so a call site can pick its own provider.",
  },
  {
    id: "chokepoint-availability-probe-is-legal",
    fence: "adamant/seams",
    at: AT_COMPONENT,
    code: 'import { geminiAvailable } from "@/lib/llm/gemini";\nexport const ok = geminiAvailable;\n',
    fires: [],
    quiet: ["no-restricted-imports"],
    why:
      "`allowImportNames` has stopped working, so the one export the fence deliberately permits is refused. A " +
      "fence that refuses legal code is the shortest path to an eslint-disable.",
  },
  {
    id: "chokepoint-schema-enum-is-legal",
    fence: "adamant/seams",
    at: AT_COMPONENT,
    code: 'import { Type } from "@google/genai";\nexport const t = Type;\n',
    fires: [],
    quiet: ["no-restricted-imports"],
    why:
      "`importNames` has widened from `GoogleGenAI` to the whole package, and the `Type` schema enum — which " +
      "every registered tool's schema uses — is now a lint error.",
  },
  {
    id: "chokepoint-exempts-itself",
    fence: "adamant/seams-llm-chokepoint",
    at: AT_CHOKEPOINT,
    code: 'import { GoogleGenAI } from "@google/genai";\nexport const client = GoogleGenAI;\n',
    fires: [],
    quiet: ["no-restricted-imports"],
    why:
      "src/lib/llm/ is the chokepoint and is allowed to be the exception it enforces; if this fires, the " +
      "wrapper itself cannot be written and the next change will widen the fence rather than the wrapper.",
  },

  // --- the store seam --------------------------------------------------------
  {
    id: "store-seam-driver-in-a-route",
    fence: "adamant/seams",
    at: AT_APP,
    code: 'import { getFirestore } from "firebase-admin/firestore";\nexport const db = getFirestore;\n',
    fires: ["no-restricted-imports"],
    quiet: [],
    why:
      "a route can reach a driver directly again — it picks a backend, breaks LOCAL_DB, and bypasses the " +
      "`u_{userId}_proj_{projectId}` key the store applies (docs/adr/0001-dual-store-seam.md, " +
      "docs/adr/0002-tenant-key-embeds-user-id.md).",
  },
  {
    id: "store-seam-sqlite-in-a-component",
    fence: "adamant/seams",
    at: AT_COMPONENT,
    code: 'import { DatabaseSync } from "node:sqlite";\nexport const db = DatabaseSync;\n',
    fires: ["no-restricted-imports"],
    quiet: [],
    why: "the local driver is importable outside src/lib/ again, which is the same breach from the other side.",
  },
  {
    id: "store-seam-relaxed-inside-lib",
    fence: "adamant/seams-lib",
    at: AT_LIB,
    code: 'import { getFirestore } from "firebase-admin/firestore";\nexport const db = getFirestore;\n',
    fires: [],
    quiet: ["no-restricted-imports"],
    why:
      "src/lib/ is the layer that OWNS both drivers. If this fires, the store modules themselves cannot be " +
      "written and the relaxation block has stopped applying — which usually means block ordering changed.",
  },

  // --- route segment config --------------------------------------------------
  {
    id: "segment-config-refused-under-app",
    fence: "adamant/route-segment-config",
    at: AT_APP,
    code: 'export const dynamic = "force-dynamic";\n',
    fires: ["no-restricted-exports", "no-restricted-syntax"],
    quiet: [],
    why:
      "a whole-route opt-out under `cacheComponents` is legal again. BOTH rules must fire: one refuses the " +
      "export, the other is the only one that can carry the sentence naming <Suspense> as the alternative.",
  },
  {
    id: "segment-config-refused-as-a-re-export",
    fence: "adamant/route-segment-config",
    at: AT_APP,
    code: 'export { dynamic } from "./route-config";\n',
    fires: ["no-restricted-exports"],
    quiet: [],
    why:
      "the re-export spelling is the one the `no-restricted-syntax` selector cannot see, which is why " +
      "`no-restricted-exports` is kept alongside it.",
  },
  {
    id: "segment-config-allows-vercel-settings",
    fence: "adamant/route-segment-config",
    at: AT_APP,
    code: "export const maxDuration = 30;\nexport const preferredRegion = \"fra1\";\n",
    fires: [],
    quiet: ["no-restricted-exports", "no-restricted-syntax"],
    why:
      "`maxDuration` and `preferredRegion` are Vercel function settings, not caching opt-outs, and this " +
      "repository uses both. Refusing them is the false positive that gets the whole rule turned off.",
  },
  {
    id: "segment-config-does-not-reach-outside-app",
    fence: "adamant/route-segment-config",
    at: AT_LIB,
    code: 'export const dynamic = "force-dynamic";\n',
    fires: [],
    quiet: ["no-restricted-exports", "no-restricted-syntax"],
    why:
      "the fence is about ROUTE segment config; a library module may name a variable `dynamic`. A fence that " +
      "has escaped its glob reports on files it was never about.",
  },
];

if (LIST) {
  console.log("lint fence drill — the cases, and the fence each one measures\n");
  for (const c of CASES) {
    const expectation = c.fires.length ? `must fire: ${c.fires.join(", ")}` : `must stay quiet: ${c.quiet.join(", ")}`;
    console.log(`  ${c.id}`);
    console.log(`    fence ${c.fence} · at ${c.at} · ${expectation}`);
  }
  console.log(`\n${CASES.length} case(s) over ${FENCES.length} fence(s) in eslint.config.mjs.`);
  process.exit(0);
}

/** The real config, or the same config with the fences taken out (see
 *  `--without-fences`). `overrideConfigFile: true` stops ESLint searching for a
 *  config file at all, so the array below is the whole configuration and its
 *  `files:` globs stay relative to the repository root — which is the property that
 *  makes the control comparable to the real run rather than a different experiment. */
async function linter() {
  if (!WITHOUT_FENCES) return new ESLint({ cwd: ROOT });
  const { default: full } = await import("../eslint.config.mjs");
  const kept = full.filter((entry) => !String(entry?.name ?? "").startsWith("adamant/"));
  if (kept.length === full.length) {
    console.error(
      "✗ lint fence drill: --without-fences removed nothing. The blocks in eslint.config.mjs are no longer " +
        "named `adamant/…`, so the negative control cannot build a config with the fences absent — and the " +
        "drill's own detector is therefore unproven. Restore the block names, or teach this filter the new ones."
    );
    process.exit(1);
  }
  console.log(
    `(negative control: linting with ${full.length - kept.length} \`adamant/*\` block(s) removed — every case ` +
      "below that must FIRE is expected to fail.)\n"
  );
  return new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: kept });
}

const eslint = await linter();

const failures = [];
const rows = [];

for (const c of CASES) {
  const filePath = join(ROOT, c.at);
  let messages;
  try {
    const results = await eslint.lintText(c.code, { filePath, warnIgnored: false });
    if (!results.length) {
      failures.push(
        `${c.id}: ESLint returned no result for ${c.at} — the path is ignored, so the fence at that position ` +
          "cannot be measured at all. Check `globalIgnores` in eslint.config.mjs."
      );
      rows.push({ id: c.id, at: c.at, got: "(ignored)", ok: false });
      continue;
    }
    messages = results[0].messages ?? [];
  } catch (err) {
    failures.push(`${c.id}: ESLint threw while linting ${c.at} — ${err.message}`);
    rows.push({ id: c.id, at: c.at, got: "(threw)", ok: false });
    continue;
  }

  const fatal = messages.find((m) => m.fatal);
  if (fatal) {
    failures.push(
      `${c.id}: the fixture no longer parses at ${c.at} (${fatal.message}). The fixture is the drill's ` +
        "instrument — fix the fixture, never the expectation."
    );
    rows.push({ id: c.id, at: c.at, got: "(parse error)", ok: false });
    continue;
  }

  const reported = new Set(messages.map((m) => m.ruleId).filter(Boolean));
  const missing = c.fires.filter((r) => !reported.has(r));
  const unexpected = c.quiet.filter((r) => reported.has(r));

  for (const rule of missing) {
    failures.push(
      `${c.id}: \`${rule}\` did NOT report on a violation at ${c.at}. The fence is still written in ` +
        `eslint.config.mjs and is no longer acting on it — ${c.why}`
    );
  }
  for (const rule of unexpected) {
    failures.push(
      `${c.id}: \`${rule}\` reported on code this fence deliberately allows, at ${c.at} — ${c.why}`
    );
  }

  rows.push({
    id: c.id,
    at: c.at,
    got: reported.size ? [...reported].join(", ") : "(nothing)",
    ok: missing.length === 0 && unexpected.length === 0,
  });
}

console.log("## The seam fences, asked a violation\n");
console.log("| Case | Fence | Linted at | Rules reported | |");
console.log("| --- | --- | --- | --- | --- |");
for (const row of rows) {
  const c = CASES.find((x) => x.id === row.id);
  console.log(`| ${row.id} | \`${c.fence}\` | \`${row.at}\` | ${row.got} | ${row.ok ? "✓" : "✗"} |`);
}
console.log("");

if (failures.length) {
  console.error(`✗ lint fence drill: ${failures.length} fence(s) are not behaving as declared\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error(
    "\n  → what to do next (`lint:fences:check`):\n" +
      "      npm run lint:fences        # the table above, with what each case got\n" +
      "      node scripts/lint-fence-drill.mjs --list\n" +
      "      A fence that stopped firing is fixed in eslint.config.mjs — restore the glob, the restricted\n" +
      "      name or the block ordering. NEVER relax the expectation here: the case going red IS the\n" +
      "      regression being caught, and a fence nobody can see fail is the state this drill exists to end.\n" +
      "      A fence that fires on legal code is fixed the same way, and is the more urgent of the two.\n" +
      "    rung discipline: docs/adr/0007-gate-rung-discipline.md\n"
  );
  process.exit(1);
}

if (WITHOUT_FENCES) {
  console.error(
    "✗ lint fence drill: the `adamant/*` blocks were removed and every case still passed. The drill is not " +
      "measuring the fences — its fixtures, its paths or its expectations have drifted until they would hold " +
      "with no fence at all, which is the one result that must never be reported as green."
  );
  process.exit(1);
}

console.log(
  `✓ lint fence drill: ${CASES.length} case(s) over ${FENCES.length} fence(s) — every rule that must refuse a ` +
    "violation did, and every control the fences deliberately allow stayed quiet."
);
if (CHECK) process.exit(0);
