#!/usr/bin/env node
/** The HTTP contract, as a document a change can be compared against.
 *
 *  WHAT WAS MISSING. `SECURITY.md` names `src/app/api/` in scope, the README and the
 *  design records describe those 88 handlers well, and every word of it is prose. An
 *  agent changing a route therefore had no artefact saying what the contract WAS —
 *  and, the half that costs something, nothing went red when the change moved it. A
 *  route that quietly stops requiring a session, gains a verb, or renames the path
 *  parameter every caller interpolates is a breaking change that no gate in this
 *  repository could see. `npm run sast -- --inventory` derives the same facts and
 *  prints them; printing is not a contract.
 *
 *  WHAT THIS IS. `docs/api/openapi.json` is an OpenAPI 3.1 description of every
 *  route the App Router serves. It is half derived and half written, and the split
 *  is the design:
 *
 *    DERIVED and pinned — path template, exported verbs, path parameters, the
 *      identity posture the handler establishes, and the Vercel `maxDuration`.
 *      `scripts/lib/api-surface-core.mjs` reads all five out of the tree; `--check`
 *      fails when the document and the tree disagree about any of them.
 *    WRITTEN and required — one sentence per operation. Not generated, because a
 *      generated sentence about a route reads as informative and says nothing; but
 *      not optional either, so a route cannot land undescribed.
 *    WRITTEN and required — HOW IT FAILS. Every operation documents at least one
 *      refusal next to its success; every response is a `$ref` into
 *      `#/components/responses`; and every component there carries the body a caller
 *      receives (`content`) plus `x-retryable` — `no` / `after` / `yes` / `n/a`.
 *      That last one is the fact a status code cannot carry and every client has to
 *      decide anyway: 429 and 502 are both "try again", 400 and 404 are both
 *      "never", and the number says neither. `compareErrorContract()` in
 *      scripts/lib/api-surface-core.mjs enforces all four, so an operation that
 *      lands documenting only its 200 is refused the way a `TODO` summary is.
 *
 *      The failure BODY is pinned where success bodies are not, because there is one
 *      of it: `Response.json({ error, code? }, { status })` from every handler under
 *      `/api`, with the 429 additionally carrying `retryAfter` and the matching
 *      `Retry-After` header (src/lib/ai/rate-limit.ts).
 *
 *  RUNG (docs/adr/0007-gate-rung-discipline.md): BLOCKING. It passes on the tree as
 *  it stands, so a red one is a regression this change introduced. It blocks through
 *  `test-unit/api-surface.test.mjs` — inside `npm run test:unit`, inside
 *  `npm run check:ci`, inside `.husky/pre-push` — rather than as another `check:ci`
 *  stage, because the comparison is a few milliseconds of file reads and the stage
 *  list is ordered by a clock.
 *
 *  THE WAY BACK. Never hand-edit the derived half to make the check green: the
 *  disagreement IS the change being caught. Regenerate it and read the diff:
 *
 *      npm run api:surface            # what the tree serves, vs what the spec says
 *      npm run api:surface:write      # re-derive, keeping every written sentence
 *
 *  A route that appears for the first time is written in with a TODO summary that
 *  the check refuses, which is the prompt to describe it.
 *
 *  Usage:
 *    node scripts/api-surface.mjs                 # report
 *    node scripts/api-surface.mjs --check         # blocking comparison
 *    node scripts/api-surface.mjs --write         # re-derive, preserving prose
 *    node scripts/api-surface.mjs --summary FILE  # append the report to FILE
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSurface, deriveSurface, POSTURES, VERBS } from "./lib/api-surface-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_REL = "docs/api/openapi.json";
const SPEC = join(ROOT, ...SPEC_REL.split("/"));

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null;
};
const CHECK = argv.includes("--check");
const WRITE = argv.includes("--write");
const SUMMARY = flag("--summary");

const out = [];
const say = (s = "") => {
  out.push(s);
  console.log(s);
};

const surface = deriveSurface(ROOT);
const paths = Object.keys(surface);

if (!existsSync(SPEC) && !WRITE) {
  console.error(`✗ ${SPEC_REL} does not exist. Next: npm run api:surface:write`);
  process.exit(1);
}

const spec = existsSync(SPEC) ? JSON.parse(readFileSync(SPEC, "utf8")) : { openapi: "3.1.0", paths: {} };

/** The security requirement each posture states, so the written half of an
 *  operation can never contradict the derived half. */
const SECURITY = {
  session: [{ sessionCookie: [] }],
  cron: [{ cronBearer: [] }],
  public: [],
  authjs: [],
  unguarded: [],
};

const ref = (name) => ({ $ref: `#/components/responses/${name}` });

/** The response set a route is written in with when it appears for the first time.
 *
 *  It used to be `{ default: { $ref: "#/components/responses/Envelope" } }` — a
 *  reference to a component this document has never defined, which resolved to
 *  nothing on arrival and which nothing noticed, because until the error-contract
 *  rules landed no check read an operation's responses at all. It is a posture
 *  default now: the refusals a route of this shape certainly has, all resolving,
 *  and narrow enough that the author's job is to ADD the ones specific to their
 *  handler rather than to repair a broken reference.
 *
 *  Deliberately not a derivation. Which codes a handler can actually emit is not
 *  read out of the tree (`info.description` § WHAT IS DELIBERATELY NOT PINNED), so
 *  this is a starting point a human corrects — the same relationship the `TODO`
 *  summary has to the sentence that replaces it. */
const DEFAULT_RESPONSES = {
  session: () => ({ 200: ref("Ok"), 400: ref("BadRequest"), 401: ref("Unauthorized") }),
  cron: () => ({ 200: ref("Ok"), 401: ref("Unauthorized"), 500: ref("ServerError") }),
  public: () => ({ 200: ref("Ok"), 400: ref("BadRequest"), 429: ref("TooManyRequests") }),
  authjs: () => ({ 200: ref("Ok"), 400: ref("BadRequest"), 500: ref("ServerError") }),
  unguarded: () => ({ 200: ref("Ok"), 400: ref("BadRequest") }),
};

if (WRITE) {
  const next = {};
  for (const path of paths) {
    const actual = surface[path];
    const previous = spec.paths?.[path] ?? {};
    const item = {
      "x-adamant": {
        source: actual.source,
        auth: actual.auth,
        ...(actual.maxDuration ? { maxDuration: actual.maxDuration } : {}),
      },
    };
    if (actual.parameters.length) {
      item.parameters = actual.parameters.map((p) => ({
        name: p.name,
        in: "path",
        required: true,
        schema: { type: "string" },
        ...(p.catchAll ? { "x-catch-all": true } : {}),
        description:
          previous.parameters?.find((q) => q.name === p.name)?.description ?? `The \`${p.name}\` path segment.`,
      }));
    }
    for (const verb of actual.methods) {
      const key = verb.toLowerCase();
      const prior = previous[key] ?? {};
      item[key] = {
        operationId: prior.operationId ?? `${key}${path.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))}`,
        summary: prior.summary ?? "TODO — one sentence on what this operation does.",
        ...(prior.description ? { description: prior.description } : {}),
        tags: prior.tags ?? [path.split("/")[2] ?? "root"],
        security: SECURITY[actual.auth],
        responses: prior.responses ?? (DEFAULT_RESPONSES[actual.auth] ?? DEFAULT_RESPONSES.unguarded)(),
      };
    }
    next[path] = item;
  }
  spec.paths = next;
  writeFileSync(SPEC, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  say(`✓ wrote ${SPEC_REL} — ${paths.length} route(s).`);
  say("  Every operation that arrived new carries a TODO summary; `--check` refuses those.");
  process.exit(0);
}

const findings = compareSurface(surface, spec);

const counts = paths.reduce((acc, p) => {
  acc[surface[p].auth] = (acc[surface[p].auth] ?? 0) + 1;
  return acc;
}, {});

say("API surface (src/app/api → docs/api/openapi.json)");
say("");
say(`  ${paths.length} route(s), ${paths.reduce((n, p) => n + surface[p].methods.length, 0)} operation(s).`);
for (const posture of Object.keys(POSTURES)) {
  if (counts[posture]) say(`  ${String(counts[posture]).padStart(3)} ${posture.padEnd(10)} ${POSTURES[posture]}`);
}

// The failure contract, printed. "Which of these can I retry?" is the first
// question a caller asks and the last thing an OpenAPI file usually answers, so it
// is a column here rather than something to be reconstructed from thirteen
// component descriptions.
{
  const components = spec.components?.responses ?? {};
  const errorClasses = Object.entries(components).filter(([, c]) => c?.["x-retryable"] !== "n/a");
  say("");
  say(`  ${errorClasses.length} refusal class(es), each with a body schema and a retry answer:`);
  for (const [name, component] of errorClasses) {
    const retryable = component?.["x-retryable"] ?? "(undeclared)";
    const media = Object.keys(component?.content ?? {}).join(", ") || "(no content)";
    say(`    ${name.padEnd(18)} retry: ${String(retryable).padEnd(6)} ${media}`);
  }
}

if (!CHECK) {
  say("");
  for (const path of paths) {
    const r = surface[path];
    const errors = new Set();
    for (const verb of r.methods) {
      for (const code of Object.keys(spec.paths?.[path]?.[verb.toLowerCase()]?.responses ?? {})) {
        if (/^[45]\d\d$/.test(code)) errors.add(code);
      }
    }
    say(
      `  ${path.padEnd(52)} [${VERBS.filter((v) => r.methods.includes(v)).join(",") || "—"}]  ` +
        `${r.auth.padEnd(9)} ${[...errors].sort().join(",") || "—"}`
    );
  }
}

let code = 0;
say("");
if (findings.length) {
  say(`✗ ${findings.length} disagreement(s) between the tree and ${SPEC_REL}:`);
  for (const f of findings) say(`  • ${f.path} — [${f.kind}] ${f.detail}`);
  say("");
  say("  The disagreement IS the change being caught — do not edit the derived half to silence it.");
  say(`  Next: npm run api:surface:write, then describe anything new and read the diff.`);
  if (CHECK) code = 1;
} else {
  say(`✓ ${SPEC_REL} describes exactly what the router serves.`);
}

if (SUMMARY) {
  try {
    appendFileSync(SUMMARY, `### API surface\n\n\`\`\`\n${out.join("\n")}\n\`\`\`\n`);
  } catch (err) {
    console.error(`(could not write summary: ${err.message})`);
  }
}

process.exit(code);
