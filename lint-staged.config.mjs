/**
 * lint-staged configuration.
 *
 * Staged .ts/.tsx/.mjs files are linted (and auto-fixed) with ESLint — .mjs is
 * included because CI's repo-wide `npm run lint` covers the node:test suites and
 * scripts too, and a staged-but-unlinted .mjs edit could pass commit yet fail CI.
 * Type-checking runs once over the whole project via `tsc --noEmit` — TypeScript
 * cannot type-check an isolated subset of files without losing project context,
 * so the function form ignores the staged file list and checks everything. This
 * mirrors the `check` npm script and the CI gate (see `check:ci`).
 */
const config = {
  "*.{ts,tsx,mjs}": ["eslint --fix"],
  "*.{ts,tsx}": [() => "tsc --noEmit"],
  // Data drift guard: staging the dataset generator or its committed output must
  // keep the two in sync (seeded PRNG → byte-stable). Function form: run once,
  // ignore the file list. Deterministic, key-free, <1 s.
  "{scripts/generate-data.mjs,src/data/performance.json}": [() => "npm run seed:check"],
};

export default config;
