/** The published HTTP contract still describes the routes the router serves.
 *
 *  `docs/api/openapi.json` is the boundary an integrator and an agent both read,
 *  and until this file existed nothing compared it to `src/app/api/`. That is the
 *  worst state for a spec to be in: `npm run docs:parity` keeps the bilingual prose
 *  honest, so a reader reasonably assumes the machine-readable document is held to
 *  the same standard — while a route could gain a verb, rename the path parameter
 *  every caller interpolates, or quietly stop requiring a session, and the document
 *  would keep saying otherwise with complete confidence.
 *
 *  scripts/lib/api-surface-core.mjs derives the pinned half out of the tree and
 *  scripts/api-surface.mjs is the CLI. THIS is the wiring: the comparison runs on
 *  every build, inside `npm run test:unit` → `check:ci` → `.husky/pre-push`, rather
 *  than as another `check:ci` stage, because it is a few milliseconds of file reads
 *  and the stage list is ordered by a clock (`npm run gates:timings`).
 *
 *  RUNG: blocking (docs/adr/0007-gate-rung-discipline.md). It passes on the tree as
 *  it stands — 88 route modules, 88 documented paths — so a red one is a regression
 *  this change introduced, never inherited debt. The way back is never to edit the
 *  derived half: `npm run api:surface:write` re-derives it, keeps every written
 *  sentence, and leaves a diff to read.
 *
 *  Threat-model flow TM-05 (docs/security/threat-model.md § Credentials, by flow):
 *  `GOOGLE_ADS_DEVELOPER_TOKEN` travels to the Google Ads API alongside a tenant's own
 *  OAuth token, and what stands on it is `sast` `route-auth` — caller identity on every
 *  route that can reach it. The posture assertions below classify handlers with the
 *  SAME regex the security gate uses, so the document and the gate cannot hold two
 *  opinions about whether a route knows who is calling.
 *
 *  Pure — reads files, runs nothing, spends nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GUARD_RE,
  POSTURES,
  RETRYABLE,
  compareErrorContract,
  compareSurface,
  deriveSurface,
  routeFiles,
} from "../scripts/lib/api-surface-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const SPEC_REL = "docs/api/openapi.json";

const surface = deriveSurface(ROOT);
const spec = JSON.parse(read(SPEC_REL));

test("the spec describes exactly what the router serves", () => {
  const findings = compareSurface(surface, spec);
  const detail = findings.map((f) => `  • ${f.path} — [${f.kind}] ${f.detail}`).join("\n");
  assert.deepEqual(
    findings,
    [],
    `${SPEC_REL} and src/app/api disagree:\n${detail}\n\n` +
      "The disagreement IS the change being caught — do not edit the derived half to silence it. " +
      "Re-derive with `npm run api:surface:write`, describe anything new, and read the diff."
  );
});

test("every route module is in the document, and the document invents none", () => {
  // compareSurface already catches both directions; this states the count on its
  // own, because "88 handlers, 88 paths" is the sentence that tells a reader the
  // artefact is a census rather than a sample.
  const files = routeFiles(ROOT);
  assert.ok(files.length > 50, `only ${files.length} route module(s) found — the derivation stopped seeing the tree.`);
  assert.equal(
    Object.keys(spec.paths ?? {}).length,
    Object.keys(surface).length,
    `${SPEC_REL} documents ${Object.keys(spec.paths ?? {}).length} path(s) and the router serves ` +
      `${Object.keys(surface).length}.`
  );
});

test("no route establishes no caller identity at all", () => {
  // The same finding `npm run sast` raises as `route-auth`, asserted here from the
  // document's side: an `unguarded` posture is not a posture, it is the finding.
  const unguarded = Object.entries(surface)
    .filter(([, r]) => r.auth === "unguarded")
    .map(([path, r]) => `${path} (${r.source})`);
  assert.deepEqual(unguarded, [], `${POSTURES.unguarded}\n  ${unguarded.join("\n  ")}`);
});

test("the document and the security gate cannot hold two opinions about a guard", () => {
  // GUARD_RE in api-surface-core.mjs is copied verbatim from scripts/sast.mjs. Two
  // classifiers for "does this handler know who is calling?" is worse than one, and
  // a copy is only safe while something notices it drifting.
  const sast = read("scripts/sast.mjs");
  assert.ok(
    sast.includes(GUARD_RE.source),
    "scripts/sast.mjs no longer contains the guard pattern scripts/lib/api-surface-core.mjs uses. The spec's " +
      "`x-adamant.auth` and the SAST `route-auth` rule have started disagreeing about what counts as a guard — " +
      "copy the gate's version back, or move both to one module."
  );
});

test("the check still detects — a spec that has drifted is refused", () => {
  // A comparison nobody has watched fail is a comparison nobody knows is wired. Run
  // the real comparator against a document mutated in the four ways that matter and
  // require a finding for each.
  const [samplePath] = Object.keys(surface);
  const clone = () => JSON.parse(JSON.stringify(spec));

  const droppedVerb = clone();
  for (const verb of ["get", "post", "put", "patch", "delete", "head", "options"]) {
    delete droppedVerb.paths[samplePath][verb];
  }
  assert.ok(
    compareSurface(surface, droppedVerb).some((f) => f.path === samplePath && f.kind === "methods"),
    "a spec that stopped documenting a route's verbs passed the comparison."
  );

  const movedAuth = clone();
  movedAuth.paths[samplePath]["x-adamant"].auth = "public";
  assert.ok(
    compareSurface(surface, movedAuth).some((f) => f.kind === "auth"),
    "a spec claiming a session route is public passed the comparison — that is the one drift that is a " +
      "security change rather than a documentation one."
  );

  const phantom = clone();
  phantom.paths["/api/does-not-exist"] = { "x-adamant": { source: "nowhere", auth: "public" } };
  assert.ok(
    compareSurface(surface, phantom).some((f) => f.kind === "phantom"),
    "a spec describing a route the router does not serve passed the comparison."
  );

  const undescribed = clone();
  const item = undescribed.paths[samplePath];
  const verb = ["get", "post", "put", "patch", "delete"].find((v) => v in item);
  item[verb].summary = "TODO — one sentence on what this operation does.";
  assert.ok(
    compareSurface(surface, undescribed).some((f) => f.kind === "undescribed"),
    "a route that landed with a TODO summary passed the comparison, so a new route can arrive undescribed."
  );
});

// --- the failure half -------------------------------------------------------
//
// The surface check above answers "does this route exist, and who may call it?".
// These answer the question a caller asks immediately afterwards and the document
// used to be silent on: "and what happens when it says no?". A spec that describes
// only success is worse than none — every integration invents its own error
// contract, and the guesses diverge without any of them being wrong enough to fix.

test("every operation says how it refuses, not only how it succeeds", () => {
  const findings = compareErrorContract(spec).filter((f) => f.kind === "no-error-response");
  assert.deepEqual(
    findings,
    [],
    "operation(s) documenting only success:\n" +
      findings.map((f) => `  • ${f.path} — ${f.detail}`).join("\n") +
      "\n\nAdd the refusal(s) the handler really answers, referencing an existing " +
      "`#/components/responses/…` class. If a genuinely new class is needed, add it there with its " +
      "`content` and `x-retryable`."
  );
});

test("every documented response resolves to a shared class", () => {
  const findings = compareErrorContract(spec).filter(
    (f) => f.kind === "response-ref" || f.kind === "dangling-ref" || f.kind === "responses"
  );
  assert.deepEqual(
    findings,
    [],
    "response reference problem(s):\n" + findings.map((f) => `  • ${f.path} — ${f.detail}`).join("\n")
  );
});

test("every response class states its body and whether retrying is the right move", () => {
  const findings = compareErrorContract(spec).filter(
    (f) => f.kind === "error-body" || f.kind === "retryability" || f.kind === "unused-response"
  );
  assert.deepEqual(
    findings,
    [],
    "response class problem(s):\n" + findings.map((f) => `  • ${f.path} — ${f.detail}`).join("\n")
  );
});

test("the pinned failure body is the one the handlers actually write", () => {
  // The success bodies are deliberately unpinned and the document says so. The
  // FAILURE body is pinned, so it has to keep matching the helper every route
  // reaches for — otherwise the one shape a caller was promised drifts silently.
  const schemas = spec.components?.schemas ?? {};
  assert.ok(schemas.Error, "components.schemas.Error is gone — the failure body is no longer described anywhere.");
  assert.deepEqual(
    schemas.Error.required,
    ["error"],
    "`error` is the only field every refusal carries; a caller told otherwise will branch on a missing key."
  );
  assert.ok(
    schemas.RateLimited?.properties?.retryAfter,
    "the 429 body no longer documents `retryAfter`, which is the only refusal a client can act on unattended."
  );

  const rateLimit = read("src/lib/ai/rate-limit.ts");
  assert.match(
    rateLimit,
    /code:\s*"rate_limited"/,
    "src/lib/ai/rate-limit.ts no longer answers `code: \"rate_limited\"`, and docs/api/openapi.json still says it does."
  );
  assert.match(
    rateLimit,
    /"Retry-After":\s*String\(retryAfter\)/,
    "the 429 no longer mirrors `retryAfter` into the `Retry-After` header — the document promises both."
  );
});

test("the failure rules still detect — a spec that goes quiet about failure is refused", () => {
  // Same discipline as the surface mutations above: a rule nobody has watched fail
  // is a rule nobody knows is wired. Each mutation is a real way this document
  // could rot, and each one must produce its own finding.
  const clone = () => JSON.parse(JSON.stringify(spec));
  const anyVerb = (item) => ["get", "post", "put", "patch", "delete"].find((v) => v in item);
  const [samplePath] = Object.keys(spec.paths);

  const successOnly = clone();
  {
    const item = successOnly.paths[samplePath];
    const verb = anyVerb(item);
    item[verb].responses = { 200: { $ref: "#/components/responses/Ok" } };
    assert.ok(
      compareErrorContract(successOnly).some((f) => f.kind === "no-error-response"),
      "an operation that documents only its 200 passed — which is exactly the state this rule set exists to end."
    );
  }

  const inlineBody = clone();
  {
    const item = inlineBody.paths[samplePath];
    const verb = anyVerb(item);
    item[verb].responses = { 200: { $ref: "#/components/responses/Ok" }, 418: { description: "a second opinion" } };
    assert.ok(
      compareErrorContract(inlineBody).some((f) => f.kind === "response-ref"),
      "a body described inline at one call site passed — the error contract has to be written once."
    );
  }

  const dangling = clone();
  {
    const item = dangling.paths[samplePath];
    const verb = anyVerb(item);
    item[verb].responses = {
      200: { $ref: "#/components/responses/Ok" },
      500: { $ref: "#/components/responses/Envelope" },
    };
    assert.ok(
      compareErrorContract(dangling).some((f) => f.kind === "dangling-ref"),
      "a `$ref` to a component nobody defined passed — it reads as a documented error and resolves to nothing. " +
        "(`Envelope` is not hypothetical: it is what `api:surface:write` used to emit for every new route.)"
    );
  }

  const noRetryAnswer = clone();
  {
    delete noRetryAnswer.components.responses.TooManyRequests["x-retryable"];
    assert.ok(
      compareErrorContract(noRetryAnswer).some((f) => f.kind === "retryability"),
      "a refusal class with no retry answer passed — the one question a status code cannot answer."
    );
  }

  const wrongRetryWord = clone();
  {
    wrongRetryWord.components.responses.BadGateway["x-retryable"] = "sometimes";
    assert.ok(
      compareErrorContract(wrongRetryWord).some((f) => f.kind === "retryability"),
      `the vocabulary is closed (${Object.keys(RETRYABLE).join(", ")}) and an invented value passed. ` +
        "A field with an open vocabulary is prose with a colon in it."
    );
  }

  const bodilessClass = clone();
  {
    delete bodilessClass.components.responses.Unprocessable.content;
    assert.ok(
      compareErrorContract(bodilessClass).some((f) => f.kind === "error-body"),
      "a response class with no `content` passed — a status code and no answer to \"what will I receive?\"."
    );
  }

  const orphanClass = clone();
  {
    orphanClass.components.responses.Teapot = {
      description: "nobody points at this",
      content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      "x-retryable": "no",
    };
    assert.ok(
      compareErrorContract(orphanClass).some((f) => f.kind === "unused-response"),
      "a response class nobody references passed — a stale one reads exactly like a live one."
    );
  }
});

test("the gate is reachable by name", () => {
  const scripts = JSON.parse(read("package.json")).scripts ?? {};
  for (const name of ["api:surface", "api:surface:check", "api:surface:write"]) {
    assert.ok(scripts[name], `package.json defines no \`${name}\` script — the check has no way in.`);
  }
});
