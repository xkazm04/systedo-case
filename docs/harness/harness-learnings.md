# systedo-case — harness learnings

A Czech marketing case-study app (Next.js 16 + React 19 + Tailwind 4, TypeScript,
`node:sqlite`, Claude CLI in dev / Gemini in prod). 20 contexts in 6 groups.

## Structural facts
- **2026-06-15** — Every LLM call goes through ONE chokepoint: `generateStructured`
  in `src/lib/llm/index.ts`. Providers are `src/lib/llm/claude.ts` (CLI, dev) and
  `src/lib/llm/gemini.ts` (API, prod), picked by `NODE_ENV`. The tools layer
  (`src/lib/gemini.ts`) defines ads/brief/analysis/campaign-eval, each tagged with
  a `// llm-tool:` comment.
- **2026-06-15** — An LLM test gate enforces the chokepoint: `test-llm/coverage.test.mjs`
  asserts (a) every `generateStructured` call site is `// llm-tool`-tagged, (b)
  each tag has a registered test, (c) no provider SDK/CLI access exists outside the
  wrapper. **Run `node --test test-llm/coverage.test.mjs` after touching `src/lib/llm/`
  or the tools layer** — it's fast and catches chokepoint leaks. `npm run llm:gate`
  additionally runs *real* model calls (slow, hash-cached) — avoid unless needed.
- **2026-06-15** — SQLite store (`src/lib/db.ts`): one `DatabaseSync` handle cached
  on `globalThis.__systedoDb` (survives HMR), schema is one `CREATE TABLE IF NOT
  EXISTS` block in `SCHEMA`. Tables: `campaigns`, `sync_meta` (pinned `CHECK id=1`,
  single-tenant), `reports` (now with `input_hash`), `rate_limits` (Wave 5),
  `campaign_snapshots` (Wave 3). `.data/systedo.db` is gitignored. **Adding a column
  to an existing table needs a guarded `ALTER` in `getDb` after `db.exec(SCHEMA)`** —
  `CREATE TABLE IF NOT EXISTS` won't alter an existing table (see the `input_hash`
  migration). Client components must import DB-derived *types* from `types.ts`
  (framework-free), never from `store.ts` (server-only, pulls in `node:sqlite`).
- **2026-06-15** — The `AiMeta` envelope (`src/lib/ai-types.ts`) is the contract the
  client UI renders and the store persists; extend it with **optional** fields only.
- **2026-06-15** — Quality pipeline: `npm run check` = `typecheck && lint && build`.
  Husky pre-commit + lint-staged + a single GitHub Actions CI (`ci.yml`, Node 22)
  mirroring `npm run check`. Playwright e2e + visual-regression suites under `tests/`
  (need browsers/dev server — not run in the harness baseline).

## Conventions enforced
- **Czech, server-only, zero-dep.** User-facing strings are Czech; AI/db/route code
  is server-only (no client imports of server modules); the project prides itself on
  no native build step and minimal deps — keep new code dependency-free.
- **Demo fallback is sacred.** Every AI tool has a deterministic `demo()` so the app
  works key-less from a clean checkout. Don't break the no-provider path.
- **Limits live in `ai-types.ts`** (`AD_LIMITS`, `SEO_LIMITS`) — reference them, never
  hardcode the numbers.

## Anti-patterns to avoid
- **Single-shot provider branching** (fixed Wave 5) — don't `if (dev) claude else
  gemini` and drop to demo on any throw; iterate availability-filtered providers
  with retry + fallback.
- **Asking the model for a limit but not enforcing it** (fixed Wave 5) — prompts
  promised char limits the server never clamped. Validate + clamp server-side.
- **Unauthenticated paid endpoints** (fixed Wave 5) — `/api/ai` and the campaign
  routes were public POSTs spawning paid calls with no throttle. New such routes
  must reuse `src/lib/ai/rate-limit.ts`.

## Open follow-ups (from the 2026-06-15 feature+moonshot scan)
- 100 opportunities triaged in `docs/harness/feature-moonshot-scan-2026-06-15/INDEX.md`
  (7-wave plan). **Done: Wave 5 (API hardening), Wave 1 (analytics core), Wave 1b
  (analytics UI surfacing), Wave 2 (steering — budget moves), Wave 3 (persistence —
  campaign_snapshots + eval dedupe + change strip).** Open: Waves 4 (AI content),
  6 (locale), 7 (pipeline/SEO).
- Steering leftovers (see `FIXES-WAVE-2.md`): the dashboard "Co kdyby?" channel
  simulator is blocked on real per-channel daily series (channel shares are static);
  recommend→simulate→*measure* and the autonomous agent both need Wave 3 persistence.
- The analytics core (`detectAnomalies`, delta `significance`, `channelRowsCompared`,
  pacing `projectionLow/High` + `goalProbability`, `buildMetricsSnapshot`) is in
  `metrics.ts`, wired into the AI grounding (`snapshot.ts`) AND rendered on the
  dashboard (anomaly markers + feed, noise-dimmed KPI deltas, channel delta column,
  pacing confidence band). See `FIXES-WAVE-1.md` + `FIXES-WAVE-1b.md`.
- Optional leftover: the side-rail `buildInsights` is still inline JSX in
  `DashboardClient.tsx` — could be ported into the engine as structured data
  (metrics-engine.md #5) so dashboard + AI share one insight source.
- Deferred from the API/wrapper reports (adjacent to Wave 5): streaming
  (`generateStructuredStream`), AI-output caching/persistence (`generations` table),
  versioned-prompt eval harness, eval fingerprint dedupe, non-destructive sync
  diff/history, scheduled cron sync guarded by `CRON_SECRET`.
- **Repo state caveat:** as of 2026-06-15 the working tree carries a large
  uncommitted WIP layer (whole campaigns feature, `llm/`, `db.ts`, design-system
  untracked) on top of 7 commits. Scope commits to specific files; don't `git add -A`.
- Drift contradiction to fix (Wave 7): `Footer.tsx:59` "JSON persistence (bez DB)"
  vs `nav.ts:46` "do SQLite". Dead link: `categoryHubPath()` → `/clanek?kategorie=`
  with no listing page.
