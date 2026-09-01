/** What is actually in a build of this app, asserted rather than assumed.
 *
 *  THE GAP THIS CLOSES. Ask "if an agent added a dependency, what would catch it
 *  before the release?" and the honest answer here was: `npm audit` in
 *  .github/workflows/supply-chain.yml, which is REPORTING rung and exits 0 by
 *  design, plus Dependabot, which arrives afterwards. Both are about ADVISORIES —
 *  known-vulnerable versions of packages that are otherwise exactly what they claim
 *  to be. Neither of them looks at the other half of the supply chain, which is
 *  cheaper to check and worse to get wrong: WHERE each package comes from and
 *  whether its bytes are verified at all.
 *
 *  `npm ci` enforces the lockfile, and the lockfile is what makes a build
 *  reproducible — but only for entries that carry an `integrity` hash and a
 *  registry `resolved` URL. An entry sourced from a git ref, a bare tarball URL, or
 *  http, or one with no integrity hash, installs code that nothing verifies, and it
 *  is one hand-edit or one `npm i <url>` away. Master ships to Vercel on push
 *  (docs/deploy.md), so "the release" is a push, and a check that only runs
 *  afterwards is not a guardrail.
 *
 *  So this suite reads package-lock.json — committed data, no network, no install —
 *  and states four properties:
 *
 *    1. every package resolves to the public npm registry over https;
 *    2. every one of those carries a sha512 integrity hash, so `npm ci` verifies
 *       the tarball it downloaded;
 *    3. an entry with no `resolved` is bundled inside a parent whose tarball IS
 *       hashed — never a workspace link or an unverified stub;
 *    4. the packages that RUN CODE at install time are a named, pinned set.
 *
 *  (4) is the one that reads oddly and is the most useful. A `postinstall` script
 *  executes with the developer's or the runner's privileges the moment the package
 *  is installed — before any of this repository's gates, lint rules or tests get to
 *  look at it. Six packages here do that, all of them for the ordinary reason
 *  (native or wasm binaries). The list is not an exception list and nothing is
 *  waived by being on it: it is an ASSERTION, so a seventh package acquiring an
 *  install script — including one that arrives transitively, which is the case
 *  nobody would otherwise notice — turns this suite red and has to be named, and
 *  argued for, in the diff that adds it.
 *
 *  WHAT THIS DOES NOT DO, so nobody reads more into a green run: it does not know
 *  which versions are vulnerable (that is `npm audit`, weekly and on every push),
 *  it does not read the packages' code, and it says nothing about anything the
 *  build pulls at RUNTIME. It is the "what is in here and where did it come from"
 *  half, and that half now blocks: `npm run test:unit` is a stage of `check:ci`,
 *  which .husky/pre-push runs before the push that ships master.
 *
 *  Rung: blocking (ADR-0007 — it passes on the tree today). Pure: reads one file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

const lock = JSON.parse(read("package-lock.json"));
const pkg = JSON.parse(read("package.json"));

/** Every entry except the root project itself, which describes this repo. */
const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path !== "");

const REGISTRY = "https://registry.npmjs.org/";

/** The packages that execute code at install time, and why each one is allowed to.
 *  A name arriving here is a real decision — see the file header. */
const INSTALL_SCRIPTS = {
  "node_modules/@firebase/util": "firebase-admin's shared utilities; the script is Firebase's own postinstall.",
  "node_modules/@google/genai": "the Gemini SDK, the app's production LLM provider.",
  "node_modules/@sentry/cli": "downloads the Sentry CLI binary for its platform (@sentry/nextjs).",
  "node_modules/fsevents": "macOS file-watching native addon; optional, and dev-only.",
  "node_modules/protobufjs": "gRPC wire format for firebase-admin; pinned by an override in package.json.",
  "node_modules/unrs-resolver": "the ESLint resolver's native binding (dev-only, via eslint-config-next).",
};

test("the lockfile is a v3 lockfile, which is the one npm ci and the Dockerfile assume", () => {
  // The container base is pinned to Node 24 for exactly this reason (ADR-0005 and
  // the Dockerfile header): a lockfile written by a different major installs
  // differently.
  assert.ok(
    Number(lock.lockfileVersion) >= 3,
    `package-lock.json is lockfileVersion ${lock.lockfileVersion}; the toolchain assumes 3 or newer.`
  );
  assert.ok(entries.length > 100, `only ${entries.length} package entries — is this a truncated lockfile?`);
});

test("every package comes from the public npm registry, over https", () => {
  const offRegistry = entries
    .filter(([, meta]) => typeof meta.resolved === "string" && !meta.resolved.startsWith(REGISTRY))
    .map(([path, meta]) => `${path} → ${meta.resolved}`);
  assert.deepEqual(
    offRegistry,
    [],
    "a dependency resolves somewhere other than the public npm registry. A git ref, a tarball URL or an http " +
      "source is code that arrives from somewhere nobody enumerated, and `npm audit` has nothing to say about " +
      "it. If one is genuinely needed it is a decision for the operator, not a lockfile line."
  );
});

test("every downloaded package is verified by a sha512 integrity hash", () => {
  const unverified = entries
    .filter(([, meta]) => typeof meta.resolved === "string")
    .filter(([, meta]) => !/^sha512-/.test(String(meta.integrity ?? "")))
    .map(([path, meta]) => `${path} (integrity: ${meta.integrity ?? "none"})`);
  assert.deepEqual(
    unverified,
    [],
    "a package is installed with no sha512 integrity hash, so `npm ci` cannot tell the tarball it got from a " +
      "tarball somebody else published. This is the property that makes the lockfile a supply-chain control " +
      "rather than a version list."
  );
});

test("a package with no download URL is bundled inside one that has an integrity hash", () => {
  // Six entries under @tailwindcss/oxide-wasm32-wasi ship INSIDE their parent's
  // tarball, so the parent's hash covers their bytes. Anything else with no
  // `resolved` — a workspace link, a stub — would be code with no verified source.
  const unaccounted = entries
    .filter(([, meta]) => typeof meta.resolved !== "string")
    .filter(([, meta]) => meta.inBundle !== true)
    .map(([path]) => path);
  assert.deepEqual(
    unaccounted,
    [],
    "a lockfile entry has neither a `resolved` URL nor `inBundle: true`, so nothing says where its code comes " +
      "from or what verifies it."
  );
});

test("the packages that run code at install time are exactly the pinned set", () => {
  const found = entries.filter(([, meta]) => meta.hasInstallScript === true).map(([path]) => path);
  assert.deepEqual(
    found.slice().sort(),
    Object.keys(INSTALL_SCRIPTS).sort(),
    "the set of packages with an install script has changed. An install script runs with your privileges the " +
      "moment `npm ci` reaches it — before any gate in this repository sees the tree — so a new one is a " +
      "decision, including when it arrives transitively under something else. Read what it does, then add it " +
      "to INSTALL_SCRIPTS with the reason, or remove the dependency that dragged it in. Note that the image " +
      "build runs `npm ci --ignore-scripts` (Dockerfile); a developer's install does not."
  );
});

test("every dependency package.json declares is actually in the lockfile", () => {
  // Drift between the manifest and the lockfile means `npm ci` installs a tree the
  // manifest does not describe. npm itself fails on this — but only after somebody
  // runs an install, which on the push-to-deploy path is the Vercel build.
  const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  assert.ok(declared.length > 0, "package.json declares no dependencies at all — that cannot be right.");
  const missing = declared.filter((name) => !lock.packages?.[`node_modules/${name}`]);
  assert.deepEqual(
    missing,
    [],
    "a dependency in package.json has no top-level entry in package-lock.json. The manifest and the lockfile " +
      "have drifted, so what a fresh `npm ci` installs is not what this repository says it depends on."
  );
});
