# systedo-case — harness learnings

## Structural facts
- **2026-06-16** — App is far larger than its README: beyond the 3 case-study pages it has auth (NextAuth + Firestore adapter, `src/auth.ts`), per-tenant Firestore (`tenants/{tenant}/…`), cron jobs (`/api/cron/{sync,digest,report}`), a Creative Studio (Leonardo gen + Gemini vision scoring, `src/lib/images/`), a keyword engine, live Google Ads mutations with an audit ledger (`src/lib/campaigns/mutations.ts`), and a prove-once LLM gate.
- **Tenant resolution** — `resolveTenant(userId)` → `"sample"` (anon) / `"u_{userId}"` / `"u_{userId}_{customerId}"` (live Ads). Anonymous always maps to the `sample` tenant. All per-tenant data lives under `tenants/{tenant}/…`.
- **Two different `DailyPoint` types** — `@/lib/types` (`{date,visits,cost,conversions,revenue}`) for the dashboard vs `@/lib/campaigns/types` (`{date,cost,conversions,conversionValue}`) for synced series. Bridge with `revenue ← conversionValue`, `visits ← 0` (the anomaly detector ignores all-zero metrics).
- **LLM chokepoint** — every AI feature flows through `generateStructured` (`src/lib/llm/index.ts`); it computes rich `meta` (model/latency/usage/cost). Each call site is tagged `// llm-tool: <id>` and mirrored in `test-llm/registry.mjs`; the gate (`scripts/llm-gate.mjs`, husky pre-commit) proves coverage + runs real-model tests, hash-cached in `.llm-gate-cache.json`.
- **Article/snapshot bridge** — `buildMetricsSnapshot(performance, period)` → `snapshotToArticle(snapshot, client, asOf)` is deterministic (no AI); `ArticleBody` renders the blocks. Reused by M1 microsites.

## Conventions enforced
- **Pure model vs server store split** — when a client component needs a type/label/helper that lives next to a Firestore module, put the pure parts in a framework-free `*-types.ts` and keep `firebase-admin` I/O in a sibling `*.ts`. A `"use client"` file importing a *runtime value* (not just a type) from a firebase-importing module breaks `next build` (pulls firebase-admin into the client bundle). `tsc` does NOT catch this — only `next build` does. (Hit in F2; applied preemptively in F5/M2/M4/M5.)
- **`react-hooks/set-state-in-effect`** — synchronous `setState` in a `useEffect` body is an eslint error here; the codebase pattern is an `// eslint-disable-next-line` directly above the call (used to set post-mount values like `window.location.origin` without a hydration mismatch).
- **Per-tool telemetry attribution** — `generateStructured` now takes an optional `id` (matches the `// llm-tool:` tag); pass it at call sites so eval telemetry is tool-labeled.

## Anti-patterns to avoid
- **`cookies()` in the root layout makes the whole app dynamic** — F4 reads the locale cookie in `app/layout.tsx`, which opts every route into server-rendered-on-demand (`ƒ`). Acceptable here (the app is already auth/Firestore-dynamic) but it disables static generation site-wide; a per-segment `[locale]` route group would preserve static pages if that ever matters.
- **The LLM gate greps for `generateStructured(` as text** — writing that literal (with the paren) in a *comment* trips the coverage check as a phantom untagged call site. Don't write `generateStructured()` in prose; say "the wrapper call site". (Cost one blocked commit in M5.)
- **Worktree `node_modules` junction breaks Turbopack** — a junction/symlink pointing outside the worktree root fails `next build` ("Symlink invalid, points out of filesystem root"), though `tsc`/`eslint` follow it fine. For a build in an isolated worktree, materialize real `node_modules` (`npm install`).

## Open follow-ups (from the 2026-06-16 scan-and-decide run)
- **F4 i18n** — only the shared chrome (Nav + Footer) + `<html lang>` are localized; marketing-page bodies (`/`, `/cena`, `/clanek`) and the AI-tool Czech system prompts are still cs-only. Next surface: the landing + pricing copy.
- **F5 / M2** — per-variant and per-creative performance is entered manually; auto-pull of impressions/CTR/conv from the Google Ads connector per ad/creative is the next step. M2 also doesn't yet push winning creatives to Ads.
- **M1 microsites** — data source is the case-study `performance` dataset for all microsites; wiring a live tenant's synced series into the same snapshot is the next step.
- **M3 eval** — telemetry persists to Firestore + `/api/eval/telemetry` returns a rollup, but there's no in-app dashboard UI yet, and the Gemini (prod) provider path is still never exercised by the gate (cross-provider conformance).
- **M5 SDK** — only the `ads` tool is migrated to the Skill shape; brief/analysis/campaign-eval/social still use inline args. Opening the registry to 3rd-party skills (each shipping its own gate test) is the platform step.
- **Telemetry growth** — `llmTelemetry` grows unbounded; add a TTL/prune.

## Process note (this run)
- A second agent/process was committing to the same checkout/branch concurrently (foreign `feat(social)`/`patterns` commits interleaved with ours). Per the concurrent-checkout hazard, the moonshot phases (M1–M5) were moved to an isolated git worktree (`vibeman/scan-decide-moonshots` off the F5 commit) so hooks/stashes couldn't collide. F1–F5 are on `vibeman/scan-decide-feature-moonshot`; M1–M5 on the worktree branch (a superset off F5).

---

# 2026-06-18 — feature-scout run (analytics workspace + the two commit landmines)

A 4-wave feature-scout build on `src/components/app/modules/*` (the per-project
analytics workspace). 21 ideas shipped, unit tests 7→72, all gates green. New
facts the 2026-06-16 notes above don't cover:

## Structural facts (analytics workspace)
- **2026-06-18** — Besides the case-study site + the Firestore/Ads backend above, there is a per-project **analytics workspace** at `src/app/app/[projectId]/<module>` whose UI lives in `src/components/app/modules/*.tsx` — *not* mentioned in the README or the 2026-06-16 facts.
- **2026-06-18** — It's driven by one declarative registry: `src/lib/projects/modules.ts` (`MODULES`). Each module has `key` (route segment), `section`, and `availableFor: ProjectType[]` (`eshop | app | leadgen | content`). The sidebar = this list filtered by the active project's type. Module file→route is NOT 1:1 by name — resolve via this registry + `src/app/app/[projectId]/<key>/page.tsx` (pages are `runtime="nodejs"`, `dynamic="force-dynamic"`, pass sample data as props).
- **2026-06-18** — Cross-module handoff bridge: write a `BriefSeed` to `sessionStorage[briefSeedKey(projectId)]` (`src/lib/projects/brief-seed.ts`) then `router.push('/app/${id}/obsah')`; `ContentBriefGenerator` reads it on mount. Reuse this verbatim for "send work to another module"; populate only existing `BriefSeed` fields so you don't touch the shared type.
- **2026-06-18** — Server-only stores (e.g. `src/lib/social/store.ts`) must be called from the client via their API route (`POST /api/social/posts`), not imported directly.
- **2026-06-18** — Module compute lives in `src/lib/<module>/compute.ts` with co-located `test-unit/<module>*.test.mjs` (run by `npm run test:unit` = `node --test`). Add a test for every new pure helper.

## Conventions enforced (additions)
- **Server shell + tiny `"use client"` child** for interactivity/exports (`DecayTable`, `CompareSeoTable`, `LtvReportButton`): keep the page server-rendered, push only the side-effect to a co-located client child.
- **Parameterize-with-default to stay backward compatible** (`scoreQueries(queries, weights = DEFAULT)`); assert the no-arg path matches prior output.
- **Deepen a model with OPTIONAL fields + graceful fallback** (funnel stages, subscriber sources, per-channel CAC, restock dates) — no migration, no regression; assert the legacy-shape path.
- **Hand-rolled `<svg>` for charts** (no chart lib), built from a pure points serializer so the cell stays server-renderable.
- **NextSteps targets must be `availableFor` the project's type** (`zisk` is eshop-only, etc.) or the route 404s.

## Anti-patterns to avoid — the two commit landmines
- **LANDMINE 1 — `llm-gate` hashes a fixed file set, not just coverage.** Beyond the coverage check the 2016-06-16 note describes, `scripts/llm-gate.mjs` hashes `HASHED_FILES` (`src/lib/llm/*`, `src/lib/ai/tools/{_shared,ads,brief,analysis,campaign-eval}.ts`, `src/app/api/ai/route.ts`, `src/app/api/campaigns/analyze/route.ts`, `test-llm/{registry,real.test,setup,resolve-hooks}.mjs`). **Changing any of them runs the real Claude test suite at pre-commit and blocks the commit unless a logged-in `claude` CLI passes it.** Adding a new server LLM tool edits `route.ts` + `registry.mjs` → triggers it. To stay commit-safe without a Claude CLI, **wire existing tools from the client and don't touch a HASHED file.** (This is exactly why the 2026-06-18 run deferred the whole AI-assist wave.)
- **LANDMINE 2 — React-Compiler eslint rules.** `react-hooks/refs` + `react-hooks/purity` forbid reading a ref's `.current` or calling `Date.now()`/`Math.random()` **during render**. Pin once-at-mount values with a **lazy `useState(() => …)` initializer** (NOT `if (!ref.current) ref.current = …`); read `localStorage` in an effect/lazy initializer; derive a "now" reference server-side and pass it in. Also a straight `"` in JSX text fails `react/no-unescaped-entities` — use „ … " (U+201E/U+201C). lint-staged runs `eslint --fix` + `tsc` on staged `*.{ts,tsx}` and **reverts the whole commit on any error** (cost one fix-cycle in wave 1).

## Open follow-ups (from the 2026-06-18 feature-scout run)
- Full backlog: `docs/harness/feature-scout-2026-06-18/INDEX.md` (75 ideas); 21 implemented (waves 1–4), summaries in `FIXES-WAVE-1…4.md`.
- **AI-assist wave deferred** (LANDMINE 1): distribution AI-repurpose, speed-lead AI-reply, local review-responses, content-engine cluster map, content brief→draft, lead-quality #4, lp #3, ltv #4, compare-seo #5, keywords #1 — each needs a new server LLM tool + a `test-llm/registry.mjs` entry + a verified Claude CLI.
- **`keywords` and `project-settings`** left unworked (LLM/competitor-data-bound; Theme-G admin). Safe depth still open: profit #2/#3/#5, ltv #3, compare-seo #2/#4, several inventory/audience/lead-quality items.

---

# 2026-06-25 — ambiguity-guardian + business-visionary scan (combined, top-5/context)

A `/vibeman` Pipeline-B scan of all 20 mapped contexts through BOTH the ambiguity-guardian and
business-visionary lenses combined (top 5 by value each) → 100 findings; then a 7-track wave fix
run closing **34** (28 fix/feat/refactor commits, 0 regressions) on branch
`vibeman/ambiguity-business-fixes-2026-06-25` (unmerged). Full index + per-wave summaries +
gate-locked notes: `docs/harness/ambiguity-business-scan-2026-06-25/`.

## Structural facts (new)
- **2026-06-25** — The LLM gate's real pre-commit run exercises the **Claude (dev) path only** (`test-llm/setup.mjs` forces `NODE_ENV=development`); the prod **Gemini path is never proven** (llm-test-gate #2). Editing any `src/lib/llm/*` re-runs all 14 tools against the real Claude CLI (~340 s) — but only the Claude success path is covered, so Gemini-only edits (temperature, parse) pass without being exercised.
- **2026-06-25** — `src/lib/db.ts` (node:sqlite) now backs ONLY the rate-limiter + (LOCAL_DB) users/projects; campaigns/reports/snapshots live in Firestore (`campaigns/store.ts`). The four campaign SQLite tables were dead schema and were removed.
- **2026-06-25** — Export seam: `src/lib/export.ts` = `toCsv` (semicolon + CRLF for Czech Excel) + `downloadText`/`downloadDataUrl` (UTF-8 BOM). Reuse it; `exportBriefMarkdown`/`exportAdsCsv`/`exportChannelsCsv` (and now `exportAnalysisMarkdown` + the campaign CSV) are the precedents.
- **2026-06-25** — `clientIp()` (`src/lib/ai/rate-limit.ts`) now trusts `x-real-ip`/`x-vercel-forwarded-for` then right-indexed XFF (`TRUSTED_PROXY_HOPS`), NOT the spoofable leftmost XFF. A process-wide global anonymous budget cap is still NOT enforced (needs a hashed-route edit).

## Conventions reinforced
- **An English value under the `cs` locale block, byte-identical to `en`, is an untranslated leak** — and an exact-match Edit hits BOTH blocks (anchor on a locale-unique sibling line to target one).
- **Derive prose from its constant** — "pod 60 % cíle" must be `fmtPct(ROAS_CRITICAL_RATIO, 0)`, never a literal that drifts on retune.
- **Hashed-file commits cost ~340 s of real-model run each** — bundle gate-locked fixes into one commit; first confirm the change doesn't alter the Claude success-path contract.

## Anti-patterns to avoid (new)
- **Trusting `x-forwarded-for[0]`** for rate-limit identity — client-controlled; one header rotation defeats per-IP caps (hit on both AI endpoints).
- **`data as T` on imported JSON** with no runtime validation — validate at load and fail the build (`article.ts` `parseArticle`).
- **Constant-share projection** makes per-row deltas identical to the aggregate (the share cancels) — render such a delta once on the total, never per-row (it reads as fabricated data).

## Open follow-ups (from the 2026-06-25 run)
- **Product decisions (need human input):** contact/hire CTA (nav #1, home #4), in-article lead capture (article-reading #1), landing language vs English brand (home #2).
- **Gate-locked remainder (each needs its own ~340 s gate run):** llm-provider #3 (Claude-path token telemetry), #4 (probe-cache TTL), deeper #1 (de-couple retry from localized strings), llm-test-gate #1 (add `social.ts` to HASHED_FILES), #2 (prove the Gemini path in CI), #3 (broaden the two chokepoint regexes).
- **Bigger builds:** multi-article CMS loader (article-content #1), grade-your-account lead magnet (campaign-model #4), config-driven demo engine + channel-share drift (dataset-seed #3/#5), dashboard narrative export (dashboard-kpis #2), report/snapshot retention+pruning (campaign-sync #3, connector #5), metrics-engine dataset-invariant fields (#1).
- **Medium/Low tail:** ~66 of 100 findings remain (mostly outside the High-value plan); 2 Low are won't-fix-grade. Full list in the per-context reports.
