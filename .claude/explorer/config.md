---
product: "Adamant (systedo-case)"
stack: "an adtech/marketing-automation SaaS: Next.js 16.3 (App Router, cacheComponents + partialPrefetching) + React 19 + TypeScript + Tailwind 4; Firestore (firebase-admin) with a LOCAL_DB sqlite twin behind store dispatchers; next-auth v5"
vault: ["<repo>/.explorer"]
vault_subdir: ""
context_map: context-map.json
coverage_context_source: ".personas/contexts.txt"
active_runs_ledger: ""
---

# explorer overlay - systedo-case (Adamant)

Sibling of `.claude/perfect/config.md`; the repo law below is the same law, restated for a sweep that
lands small fixes rather than a wave. The vault is `<repo>/.explorer/` (`vault_subdir` empty: notes live
directly under it) - git-ignored and **must never enter a commit**: a concurrent vibeman agent shares
this `master`.

**Concurrent-vibeman-agent discipline (this repo's law):** another agent commits to this master in
parallel. Stage ONLY your paths (`git add <paths>` then `git commit <same paths>`, never `-A`, never a
bare `git commit`), verify the commit builds in isolation, never stash/reset work that is not yours.
Only ONE `next dev` per machine (dev-lock).

## Context sources
- `context-map.json` - the area taxonomy (keys: `filePaths`, `crossRefs`; 116 contexts / 16 groups).
  It is an index, not an inventory: `npm run agents:surface` reports the unmapped-file count.
- `CLAUDE.md` -> `AGENTS.md` - repo rules; the vendor block and the Project Context Map section are
  generator-owned, pinned in `.github/agent-surface.lock.json`, and must never be hand-edited.
- `docs/adr/` - read the decision record for a seam before changing it (start at `docs/adr/README.md`).
  `docs/adr/0007-gate-rung-discipline.md` defines which gates block and which only ratchet.
- `.personas/contexts.txt` - the registered-name list; the ONLY authority for the `context` field in
  `.personas/memory-outbox.jsonl`. The context-map name is a fallback only when that file is absent.

## Area menu
Derived from the context map's 16 groups; these 8 are the standing menu (the rest reachable via
option 1, free text):
1. AI & Content Engine / AI & Content Generation - `src/lib/llm`, `src/lib/ai`, `src/app/api/ai`
2. Campaign & Ads Management - campaigns stores, Sklik/Ads seams
3. Performance & Analytics / Analytics & Reporting - reporting surfaces, recap
4. Authenticated Product Shell - `/app` shell, sidebar, session
5. Project & Catalog / Catalog & Inventory - the Offering spine, resolve/load seam
6. Social & Content Publishing - twin, sprava-kanalu, schranka, kanaly
7. Lead & CRM Management - `src/lib/leads`, `/api/crm`
8. Local SEO & Maps - the `local` ProjectType surfaces
Site & Marketing / App Shell & Site / Platform Operations reachable by name.

## Gates
- always: `npx tsc --noEmit` then `npm run lint` for the touched paths; `npm run check` (tsc + eslint +
  next build) before the last commit of the run.
- unit suites: `npm run test:unit` when `src/lib/**` or anything under `test-unit/` is touched.
- seed data: `npm run seed:check` when `scripts/generate-data.mjs` or seed data is touched.
- security: `npm run sast` when a route under `src/app/api/` is added or its auth/validation changed.
- llm: a commit touching `/api/ai` or LLM tool/registry files triggers the LLM pre-commit gate
  (~10 min, real models) - run that commit `run_in_background` and read the output before the next
  state-changing action.
- surface lock: `npm run agents:surface` if `CLAUDE.md`/`AGENTS.md` changed; accept a generator reword
  deliberately with `-- --accept "<why>"`, never by editing the pinned block.

## Repo law
Authority: `node_modules/next/dist/docs/` for route/data code; Design System Primitives in
`src/components/ui.tsx` + `icons.tsx`.
- This is NOT the Next.js you know. Cache Components is ON - NEVER add `export const dynamic`,
  `runtime`, or `revalidate` under `src/app/` (Part A of the agent-review rubric blocks it); wrap
  dynamic reads (cookies/session/fetch) in `<Suspense>` instead.
- Reuse Design System Primitives (`ui.tsx`: Container/Eyebrow/Pill/Button; `icons.tsx`;
  `components/app/Modal.tsx`) - never hand-roll a button, modal, spinner, or empty state.
- Dark mode is token-driven: `ink`/`muted`/`surface`/`brand-*`/`onyx-*`/`*-soft` semantic tokens -
  never raw hex or a raw navy/brand pair for a dark SURFACE. Rule is about the token's ROLE.
- i18n is COLOCATED: each component owns `const T = { cs: {...}, en: {...} }` (`TDict`), consumed via
  `useT(T)` / `await getT(T)`. Both locale columns in the same edit - parity is enforced by typecheck.
  en is the authoring source, cs transcreated (2026-08-05). Central dict only for nav/footer chrome.
- Session/project reads go through the cached helpers in `@/lib/session` (React `cache()`) - never
  re-read Firestore auth/project state ad hoc.
- Data surfaces follow the store+resolver seam (`resolve.ts` / `load.ts`): live/persisted data resolves
  over sample/seed data - never hardcode demo data into a component. Every Firestore store needs its
  LOCAL_DB twin, and `db.ts` SCHEMA changes need a migration.
- All LLM text calls go through the `generateStructured` chokepoint (`src/lib/llm/index.ts`); every call
  site carries a `// llm-tool: <id>` comment with a registered gate test. Never call a provider SDK
  directly. Accepting a golden needs `npm run llm:eval:update -- --reason "..."`.
- Tenancy key is `u_{userId}_proj_{projectId}` - never build a tenant key by hand.
- New dashboard module roots get the `stagger` class; heavy modal-gated components lazy-load via
  `next/dynamic` + `SectionSkeleton`.
- Agent-review Part A BLOCKS: a component past 200 LOC, a `dynamic|runtime|revalidate` export under
  `src/app/`, a deleted test, a new runtime dependency. The last two are unblocked only by an
  `Ack: <why>` line in the commit message.
- Commit footer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Commit subject for this skill: `explorer(<context>): <title>`.

## Baseline exclusions
- The unmapped-file count reported by `npm run agents:surface` (159 at the 2026-07-30 scan) - a
  ratcheted backlog, never a standalone item.
- The `npm run i18n:audit` RATCHET findings (cs values never written, tykani, strings that never
  reached a `T` table) - fix as-you-touch and lower the baseline in the same commit; never a
  standalone "extract N strings" item.
- The component-debt list in `docs/roadmap/component-debt.md` - existing >200-LOC modules are a known
  migration, not a finding. A NEW file crossing 200 LOC is a finding.
- Bulk locale extraction of any kind. A colocated-TDict item is fine; a sweep of literals is not.

## Smoke
- `npm run dev:local` (DEV_AUTH + LOCAL_DB, fully offline `/app`); `npm run seed:local` once if
  `.data/systedo.db` is missing. ONE `next dev` per machine - kill a listener on the port before
  trusting a run (the e2e suite uses :3100). Turbopack caches go stale across worktrees: verify with
  `npx tsc --noEmit` + targeted unit tests, not by racing for the dev server.

## Skill improvement log
- 2026-08-29: overlay created on adoption; law lifted from `.claude/perfect/config.md` and AGENTS.md.
- 2026-08-29: `npm run check` is red at HEAD for a reason no sweep causes -
  `uat/runs/2026-08-29-kanaly-l2/driver/lib.mjs:39` fails eslint with a parse error
  (committed by `0a9ff824`). Lint your own paths with `npx eslint <paths>` to get a
  clean signal; do not "fix" the UAT artifact, it is another loop's output.
- 2026-08-29: the pre-commit hook runs `tsc --noEmit` over a tsconfig that includes
  `.next/types/**`, so a stale generated validator blocks every commit. After a route
  is deleted (e.g. the `/lp` retirement in `d8c5196f`), `rm .next/types/validator.ts`
  and let the next build regenerate it. Never reach for `--no-verify`.
- 2026-08-29: the LLM pre-commit gate is FAST here (static since 2026-08-05, a few
  seconds) - the overlay's "background the commit" advice is stale for the everyday
  case. Only `npm run test:llm` / `llm:quality` are the ~10min real-model paths.
- 2026-08-29: `src/app/app/[projectId]/template.tsx` remounts every module on every
  navigation beneath it. Read it BEFORE proposing any "state survives a project
  switch" item in an `/app` module - it killed three candidates in one run.
