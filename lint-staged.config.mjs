/**
 * lint-staged configuration.
 *
 * Staged .ts/.tsx files are linted (and auto-fixed) with ESLint. Type-checking
 * runs once over the whole project via `tsc --noEmit` — TypeScript cannot
 * type-check an isolated subset of files without losing project context, so the
 * function form ignores the staged file list and checks everything. This mirrors
 * the `check` npm script and the CI gate.
 */
const config = {
  "*.{ts,tsx}": ["eslint --fix", () => "tsc --noEmit"],
};

export default config;
