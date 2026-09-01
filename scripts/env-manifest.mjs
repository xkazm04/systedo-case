#!/usr/bin/env node
/** The deploy target, read back: does the repository still assume what the
 *  environment manifest declares? (zero-dependency, offline)
 *
 *  WHY THIS EXISTS. Fifteen gates run before a change lands here, and past the merge
 *  there was nothing. Vercel ships `master` on push, so the push is the release act
 *  — and what that release runs on was described in exactly two places, both of them
 *  unreviewable: the Vercel project's settings screen, and prose in `docs/deploy.md`
 *  that nothing compares against the tree. There was no environment declaration an
 *  agent could read to know what runs where, and therefore no check that could go red
 *  when the production target and the repository's assumptions came apart. A
 *  well-gated repository still ships a surprise through that gap.
 *
 *  `.github/environments.json` is the declaration — the smallest description of the
 *  target that is still worth diffing in a pull request: the runtime the platform
 *  must provide, the schedules it must fire, and every environment variable the
 *  deployment reads, each classified by what its absence costs. This script is the
 *  drift check over it.
 *
 *  WHAT IT COMPARES, and it is all committed data:
 *
 *    R1  runtime.node          vs package.json `engines.node`
 *    R2  runtime.framework     vs package.json `dependencies.next`
 *    R3  runtime.ciNode        vs EVERY `node-version:` in .github/workflows
 *                                 (and its major against the engines range)
 *    R4  runtime.nextConfig    vs next.config.ts (cacheComponents, partialPrefetching)
 *    R5  runtime.timezone      vs the TZ the CI job renders in
 *    C1  crons.schedules       vs vercel.json, set for set, path AND schedule
 *    C2  every cron path       resolves to a route module under src/app/api/cron
 *    E1  every variable in .env.example is CLASSIFIED in the manifest
 *    E2  every manifest entry that claims `source: env-example` is really there
 *    E3  every `required` variable is named in docs/deploy.md
 *    E4  `scope: public` and the NEXT_PUBLIC_ prefix agree, in both directions
 *    E5  nothing on `productionForbidden` is also classified required or optional
 *    D1  the docs this manifest routes to still have the sections it names
 *
 *  WHAT IT CANNOT SEE is in the manifest's own `cannotSee` list rather than left for
 *  a reader to assume: it reads the repository, not the platform. Whether a secret is
 *  actually set in the Vercel project, which region a function landed in, whether the
 *  Firestore TTL policy exists — those need an API token and an operator, and
 *  docs/deploy.md § Post-deploy verification is where they live. A check that
 *  overstated its reach would be worse than this one, because the gap would then be
 *  invisible AND believed closed.
 *
 *  RUNG: blocking (ADR-0007 — it passes on the tree today). It is deliberately NOT a
 *  new stage of `check:ci`: the same comparison runs inside
 *  test-unit/environment-manifest.test.mjs, which is already in `npm run test:unit` →
 *  `npm run check:ci` → `.husky/pre-push`, so the drift is refused on the machine
 *  that made it without lengthening the chain by a fourteenth stage. This CLI is the
 *  readable half — the one you run to see what the target is.
 *
 *  Usage:
 *    npm run env:manifest              # print the declared target
 *    npm run env:manifest:check        # …and exit 1 on drift
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST_PATH = ".github/environments.json";

/** Every variable name `.env.example` declares — the annotated reference a human
 *  reads, and therefore the list the manifest may not be shorter than. A name is
 *  declared when it starts its line (commented out or not) and is immediately
 *  followed by `=`; a sentence that merely mentions one is not a declaration. */
export function envExampleNames(text) {
  const names = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^#? ?([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

/** Every `node-version:` a workflow pins, as `{ file, value }`. */
export function workflowNodeVersions(files) {
  const out = [];
  for (const { name, text } of files) {
    for (const m of String(text).matchAll(/^\s*node-version:\s*"?([^"\s#]+)"?\s*$/gm)) {
      out.push({ file: name, value: m[1] });
    }
  }
  return out;
}

const majorOf = (v) => String(v).split(".")[0];

/**
 * The whole comparison, as data. Pure: it is handed the file contents and returns
 * the findings, so the unit test runs exactly what the CLI runs.
 *
 * @param {{
 *   manifest: object, pkg: object, vercel: object, nextConfig: string,
 *   envExample: string, deployDoc: string,
 *   workflows: Array<{name: string, text: string}>,
 *   cronRouteExists: (path: string) => boolean,
 * }} sources
 * @returns {string[]} one sentence per drift, empty when the declaration holds
 */
export function environmentFindings(sources) {
  const { manifest, pkg, vercel, nextConfig, envExample, deployDoc, workflows, cronRouteExists } = sources;
  const findings = [];
  const rt = manifest.runtime ?? {};

  // --- R1/R2/R3: the runtime the platform must give us -----------------------
  const engines = pkg.engines?.node ?? "";
  if (rt.node?.value !== engines) {
    findings.push(
      `R1 runtime.node: the manifest declares \`${rt.node?.value}\` and package.json engines.node says ` +
        `\`${engines}\`. The deployment's Node range is a fact about the target — move both in the same diff.`
    );
  }
  const nextVersion = pkg.dependencies?.next ?? "";
  if (rt.framework?.version !== nextVersion) {
    findings.push(
      `R2 runtime.framework: the manifest declares next \`${rt.framework?.version}\` and package.json depends on ` +
        `\`${nextVersion}\`. A framework upgrade changes what production runs; it belongs in the declaration.`
    );
  }
  const pinned = workflowNodeVersions(workflows);
  if (!pinned.length) {
    findings.push(
      "R3 runtime.ciNode: no workflow pins a `node-version:` any more, so CI renders on whatever the runner " +
        "defaults to — and the format goldens are minted against one exact version."
    );
  }
  for (const p of pinned) {
    if (p.value !== rt.ciNode?.value) {
      findings.push(
        `R3 runtime.ciNode: ${p.file} pins node \`${p.value}\` and the manifest declares \`${rt.ciNode?.value}\`. ` +
          "One workflow bumped alone is how the ICU-sensitive goldens start failing in a single job."
      );
    }
  }
  if (rt.ciNode?.value && rt.node?.value && majorOf(rt.ciNode.value) !== majorOf(rt.node.value)) {
    findings.push(
      `R3 runtime.ciNode: CI runs node ${rt.ciNode.value} and the engines range is ${rt.node.value} — CI is not ` +
        "building on the major the deployment declares."
    );
  }

  // --- R4/R5: the framework configuration production actually renders under ---
  for (const [key, want] of Object.entries(rt.nextConfig ?? {})) {
    if (typeof want !== "boolean") continue; // `from` / `why` are prose, not settings
    const stated = new RegExp(`\\b${key}\\s*:\\s*${want}\\b`).test(nextConfig);
    if (!stated) {
      findings.push(
        `R4 runtime.nextConfig: the manifest declares \`${key}: ${want}\` and next.config.ts does not set it that ` +
          "way. Cache Components decides whether a route is dynamic-by-default — production renders differently."
      );
    }
  }
  const tz = rt.timezone?.value;
  if (tz && !workflows.some((w) => new RegExp(`TZ:\\s*${tz}\\b`).test(w.text))) {
    findings.push(
      `R5 runtime.timezone: no workflow renders in ${tz}, which is the zone the committed format goldens were ` +
        "minted in. A CI job in another zone fails the date goldens for a reason nobody will look for here."
    );
  }

  // --- C1/C2: the schedules the platform must fire ---------------------------
  const declared = new Map((manifest.crons?.schedules ?? []).map((c) => [c.path, c.schedule]));
  const actual = new Map((vercel.crons ?? []).map((c) => [c.path, c.schedule]));
  for (const [path, schedule] of actual) {
    if (!declared.has(path)) {
      findings.push(
        `C1 crons: vercel.json fires \`${path}\` and the manifest declares no such schedule. A cron is a job the ` +
          "platform runs against production on its own; one nobody declared is one nobody reviewed."
      );
    } else if (declared.get(path) !== schedule) {
      findings.push(
        `C1 crons: \`${path}\` runs on \`${schedule}\` in vercel.json and is declared as ` +
          `\`${declared.get(path)}\`. The schedule is the fact — say which one is right in the diff.`
      );
    }
  }
  for (const path of declared.keys()) {
    if (!actual.has(path)) {
      findings.push(
        `C1 crons: the manifest declares \`${path}\` and vercel.json does not fire it. Either the schedule was ` +
          "dropped (and the declaration should follow) or it was lost (and production is silently not running it)."
      );
    }
    if (!cronRouteExists(path)) {
      findings.push(
        `C2 crons: \`${path}\` has no route module under src/app/api/cron. Vercel would call it and get a 404 on ` +
          "a schedule, which is the failure mode that looks like nothing at all."
      );
    }
  }

  // --- E1..E5: the configuration surface -------------------------------------
  const env = manifest.env ?? {};
  const documented = envExampleNames(envExample);
  for (const name of documented) {
    if (!env[name]) {
      findings.push(
        `E1 env: \`${name}\` is in .env.example and is classified nowhere in ${MANIFEST_PATH}. A new knob on the ` +
          "deployment is a change to the deploy target — say whether production needs it, and what its absence costs."
      );
    }
  }
  for (const [name, spec] of Object.entries(env)) {
    if (spec.source === "env-example" && !documented.has(name)) {
      findings.push(
        `E2 env: the manifest says \`${name}\` is documented in .env.example, and it is not. Either add it there ` +
          'with the comment a human needs, or mark it `"source": "code"`.'
      );
    }
    if (spec.class === "required" && !deployDoc.includes(name)) {
      findings.push(
        `E3 env: \`${name}\` is declared REQUIRED and docs/deploy.md never names it, so nobody setting up a ` +
          "deployment would know to set it."
      );
    }
    const isPublic = name.startsWith("NEXT_PUBLIC_");
    if (isPublic && spec.scope !== "public") {
      findings.push(
        `E4 env: \`${name}\` is inlined into the browser bundle by its prefix and the manifest calls it ` +
          `\`${spec.scope}\`. Anything behind NEXT_PUBLIC_ is published — SAST rule \`public-env-secret\` refuses ` +
          "a secret-shaped one, and this refuses a mislabelled one."
      );
    }
    if (!isPublic && spec.scope === "public") {
      findings.push(
        `E4 env: \`${name}\` is declared \`public\` and carries no NEXT_PUBLIC_ prefix, so it never reaches the ` +
          "browser at all. The label is wrong in the direction that makes a server secret look reviewed."
      );
    }
  }
  for (const name of manifest.productionForbidden?.names ?? []) {
    const spec = env[name];
    if (!spec) {
      findings.push(`E5 env: \`${name}\` is forbidden in production and classified nowhere.`);
    } else if (spec.class === "required" || spec.class === "optional") {
      findings.push(
        `E5 env: \`${name}\` must never be set in production and is classified \`${spec.class}\`, which reads as ` +
          "a variable a deployment may set. Those two statements cannot both be acted on."
      );
    }
  }

  // --- D1: the documents this declaration routes to --------------------------
  for (const section of ["## Delivery contract", "## Deploy + rollback (Vercel)", "## Crons"]) {
    if (!deployDoc.includes(section)) {
      findings.push(
        `D1 docs: ${MANIFEST_PATH} routes a reader to docs/deploy.md \`${section}\`, which the document no longer ` +
          "has. A manifest that points at a heading that moved sends the next operator nowhere."
      );
    }
  }

  return findings;
}

/** Read every source the comparison needs, from a checkout root. */
export function readSources(root) {
  const read = (rel) => readFileSync(join(root, rel), "utf8");
  const wfDir = join(root, ".github", "workflows");
  const workflows = existsSync(wfDir)
    ? readdirSync(wfDir)
        .filter((f) => /\.ya?ml$/.test(f))
        .map((name) => ({ name, text: readFileSync(join(wfDir, name), "utf8") }))
    : [];
  return {
    manifest: JSON.parse(read(MANIFEST_PATH)),
    pkg: JSON.parse(read("package.json")),
    vercel: JSON.parse(read("vercel.json")),
    nextConfig: read("next.config.ts"),
    envExample: read(".env.example"),
    deployDoc: read("docs/deploy.md"),
    workflows,
    cronRouteExists: (p) => {
      const slug = String(p).replace(/^\/api\/cron\//, "");
      return ["route.ts", "route.tsx"].some((f) => existsSync(join(root, "src/app/api/cron", slug, f)));
    },
  };
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
  const CHECK = process.argv.slice(2).includes("--check");

  let sources;
  try {
    sources = readSources(ROOT);
  } catch (err) {
    console.error(`✗ env manifest: could not read the sources — ${err.message}`);
    process.exit(1);
  }

  const { manifest } = sources;
  console.log(`The deploy target, as declared in ${MANIFEST_PATH} (schema ${manifest.schema}, ${manifest.declaredOn}).`);
  console.log("");
  for (const e of manifest.environments ?? []) {
    console.log(`  ${e.id}  [${e.platform}] branch ${e.branch} · store ${e.dataStore} · NODE_ENV=${e.nodeEnv}`);
    console.log(`      promotion: ${e.promotion}`);
    console.log(`      rollback:  ${e.rollback}`);
  }
  console.log("");
  console.log(
    `  runtime: node ${manifest.runtime?.node?.value} (CI ${manifest.runtime?.ciNode?.value}) · ` +
      `next ${manifest.runtime?.framework?.version} · TZ ${manifest.runtime?.timezone?.value}`
  );
  console.log(`  crons:   ${(manifest.crons?.schedules ?? []).length}, guarded by ${manifest.crons?.guardedBy}`);
  const byClass = {};
  for (const spec of Object.values(manifest.env ?? {})) byClass[spec.class] = (byClass[spec.class] ?? 0) + 1;
  console.log(
    `  env:     ${Object.keys(manifest.env ?? {}).length} variables — ` +
      Object.entries(byClass)
        .sort()
        .map(([k, n]) => `${n} ${k}`)
        .join(", ")
  );
  console.log("");
  console.log("  What this cannot see (it reads the repository, not the platform):");
  for (const line of manifest.cannotSee ?? []) console.log(`    · ${line}`);
  console.log("");

  const findings = environmentFindings(sources);
  if (!findings.length) {
    console.log("✓ env manifest: the declared target and the repository agree — runtime, schedules and every");
    console.log("  configuration variable. The platform half is the operator's: docs/deploy.md § Post-deploy verification.");
    process.exit(0);
  }

  console.error(`✗ env manifest: ${findings.length} drift(s) between the declaration and the tree:`);
  console.error("");
  for (const f of findings) console.error(`  • ${f}`);
  console.error("");
  console.error("  → what to do next (`env:manifest:check`):");
  console.error("      npm run env:manifest        # what the target is declared to be");
  console.error(`      Move the declaration in ${MANIFEST_PATH} in the SAME diff as the change it describes.`);
  console.error("      Never delete a row to go green: the row firing IS the drift being caught.");
  console.error("      The same comparison runs on every build — test-unit/environment-manifest.test.mjs.");
  console.error("");
  process.exit(CHECK ? 1 : 0);
}
