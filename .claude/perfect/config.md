---
product: "Adamant (systedo-case)"
stack: "an adtech/marketing-automation SaaS: Next.js 16.3 (App Router, cacheComponents + partialPrefetching) + React 19 + TypeScript + Tailwind 4; Firestore (firebase-admin) with a LOCAL_DB sqlite twin behind store dispatchers; next-auth v5"
vault: ["C:/Users/kazda/Documents/Obsidian/systedo", "<repo>/.perfect"]
vault_subdir: ""
base_branch: master
wave_size: 3
lot_caps: {}
pool_target: 10
round_shape: pool
cooldown_rounds: 2
commit_format: "feat(<context>): <title>"
context_map: context-map.json
active_runs_ledger: ""
locale_count: 2
---

# perfect overlay - systedo-case (Adamant)

Default vault for this repo is `<repo>/.perfect/` (`vault_subdir` empty: notes live directly under it) -
an Obsidian-openable folder that is **git-ignored and must NOT enter commits**: a concurrent vibeman
agent shares this `master`. Context-map keys: `filePaths`, `crossRefs`; context-note `category` set
includes `logic`.

**Concurrent-vibeman-agent discipline (this repo's law):** another agent commits to this master in
parallel. Stage ONLY your paths (`git commit --only`, never whole dirty files, never `git add -A` on the
main tree), verify each commit builds in isolation, keep commits path-scoped to the direction's context.
Only ONE `next dev` per machine (dev-lock); Turbopack caches can go stale across worktrees - verify with
`npx tsc --noEmit` + targeted unit tests, not by racing for the dev server.

## Gates
- always: `npm run check` (tsc + eslint + next build), `npm run test:unit`
- when `scripts/generate-data.mjs` or seed data touched: `npm run seed:check`
- slow: the LLM pre-commit hook (~10 min, real models) auto-runs on commits touching `/api/ai` or LLM
  tool/registry files - run those commits `run_in_background`, keep reviewing, read the output before
  the next state-changing action.
- builder: `npx tsc --noEmit`, targeted `npm run test:unit` where suites exist, `npm run lint`; report
  what you COULD NOT verify honestly.

## Class B
- barrel exports
- the cs/en typed Messages dictionary (colocated TDict; anchored insert per key)

## Class C
- the git index
- `context-map.json`
- effectively nothing else: colocated TDict i18n needs no Director-applied locale step - say so in
  briefs rather than importing another project's locale machinery.

## Repo law
Authority: `node_modules/next/dist/docs/` for route/data code; Design System Primitives in
`components/ui.tsx` + `icons.tsx`.
- This is NOT the Next.js you know: read the relevant guide in `node_modules/next/dist/docs/` before
  writing route/data code. Cache Components is ON - NEVER add `export const dynamic = "force-dynamic"`
  or runtime exports; wrap dynamic reads (cookies/session/fetch) in `<Suspense>` instead.
- Reuse Design System Primitives (`components/ui.tsx`: Container/Eyebrow/Pill/Button; `icons.tsx`;
  `components/app/Modal.tsx`) - never hand-roll buttons/modals/spinners.
- Dark mode is token-driven: use `onyx-*`, `brand-accent`, `*-soft` semantic tokens - never raw
  navy-800/brand-700/hex pairs.
- UI strings go through the cs/en locale system (typed Messages dictionary + `{placeholder}`
  interpolation) - cs is the primary locale; add both languages.
- Session/project reads via the cached helpers in `@/lib/session` (React `cache()`) - never re-read
  Firestore auth/project state ad hoc.
- Data surfaces follow the store+resolver seam: live/persisted data resolves over sample/seed data
  (`resolve.ts`/`load.ts` pattern) - never hardcode demo data into a component. Scouts trace this seam:
  is the surface sample-data-only, or wired to live/persisted data?
- All LLM calls go through the `generateStructured` chokepoint (`src/lib/llm`) - new AI operations
  register a tool + validator + gate coverage; never call a provider SDK directly.
- New dashboard module roots get the `stagger` class; heavy modal-gated components are lazy-loaded via
  `next/dynamic` + `SectionSkeleton`.
- Review conventions (Director): Design System Primitives, dark-mode tokens, Cache Components rules,
  the cs/en Messages dictionary, store/resolver seams, the `generateStructured` chokepoint.
- Doc-sync: user-visible changes update the mapped `docs/` page (features/contexts/roadmap) when one
  exists for the surface.
- Commit footer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Context sources
- `context-map.json` for the queue. Coverage names: `.personas/contexts.txt` (the registered-name list,
  refreshed when the app rescans); fall back to the map name only when that file is absent.

## Smoke
- One `next dev` per machine; the Director drives live flows from the main checkout. No fixed port
  recorded - probe for the app's `<title>` marker.

## Opportunity arcs
- Judged from context-map metadata, `docs/`, and memory. The ship-loop verdict: lean on Sklik
  unification + diagnostics + price. Honor cooldowns implied by freshly-shipped arcs.

## Vetoes
- "SPA rewrite rejected - don't re-suggest"; "commit on master"; "concurrent vibeman agent".

## User taste
- (defaults: outcome-value over cosmetic churn; engine depth over chrome)

## Skill improvement log
- (migrate the existing entries from `$VAULT/config.md` on the first 2.3 run, then append here)
