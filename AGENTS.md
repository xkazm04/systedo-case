<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Adamant (systedo-case) — agent guide

Adtech marketing-automation suite ("Adamant", ex-Systedo). Czech-first (cs is the
source locale, en derived). Public site at `/`, authed product at `/app` with
per-project tenancy. Deploys to Vercel serverless.

## Commands

```bash
npm run dev:local     # DEV_AUTH=true LOCAL_DB=true next dev — fully offline /app
npm run seed:local    # once: dev user + sample projects into .data/systedo.db
npm run dev           # real auth mode (needs Google OAuth + Firestore creds)
npm run check         # typecheck + lint + build
npm run test:unit     # node:test suites in test-unit/
npm run test:e2e      # Playwright (NOT in CI)
npm run check:ci      # what CI runs: check + seed:check + test:unit + llm:gate:check
npm run llm:gate      # LLM proof gate (llm:list shows call sites)
```

## Architecture in 10 lines

1. Next.js 16 App Router + React 19; pages `src/app/`, components `src/components/`, logic `src/lib/`.
2. Auth.js v5 (Google) + firebase-admin; prod sessions/data live in Firestore.
3. Dual-store pattern: prod = Firestore; local dev = node:sqlite under `.data/` (`LOCAL_DB=true`). Same store interfaces, env-switched; `DEV_AUTH`/`LOCAL_DB` are ignored when `NODE_ENV=production`.
4. Tenancy: the tenant key embeds userId (`u_{userId}_proj_{projectId}`) — no cross-user IDOR by construction.
5. Every LLM text call goes through ONE chokepoint: `generateStructured()` in `src/lib/llm/index.ts` (dev = Claude CLI on subscription, prod = Gemini flash; no provider → demo mode).
6. Non-chokepoint AI: Leonardo image gen + Gemini vision scoring + embeddings (Creative Studio, patterns RAG).
7. Billing/abuse rails are server-enforced: `usage.consume()` Firestore txn, durable per-IP limits + global daily spend ceiling (`src/lib/ai/durable-limit.ts`) on all paid routes.
8. i18n is colocated: each component owns `const T = { cs: {...}, en: {...} }` (`TDict`), consumed via `useT(T)` (client) / `await getT(T)` (server); central dict only for nav/footer chrome. Contract: `docs/i18n/contract.md`.
9. Five crons in `vercel.json` → `/api/cron/*`, guarded by `CRON_SECRET` through `src/lib/cron-auth.ts` (constant-time).
10. Design system: token-driven (`ink`/`muted`/`surface`/`brand-*`, dark mode via token overrides), shared `Button` in `src/components/ui.tsx`; conventions in `docs/design-system.md`.

## Conventions that bite

- **llm-tool tag contract**: every `generateStructured` call site must carry a
  `// llm-tool: <id>` comment with a registered test in the gate registry.
  `scripts/llm-gate.mjs` (pre-commit + CI) fails on an untagged call site,
  a chokepoint violation, or drifted contract goldens. Static-only since
  2026-08-05 — the hash-cached real-model re-prove was retired (too expensive
  long-term); prove on demand with `npm run test:llm` / `npm run llm:quality`.
- **Pathspec commits only** (shared checkout, concurrent agents):
  `git add <paths>` then `git commit <same paths>`. Never `-A`, never a bare
  `git commit`, never stash or reset work that is not yours.
- **Components under 200 LOC preferred** — extract sub-components and data
  hooks instead of growing module files. Existing debt is catalogued in
  `docs/roadmap/component-debt.md`.
- i18n parity is the type system: `TDict`/`Messages` make a key added to one
  locale column and not the other a `typecheck` failure. There is no parity
  script — do not invent one.
- `context-map.json` maps all files to feature contexts; read it at task start
  and scope edits to the relevant context's `file_paths`.
- Deploy/env questions (required env names, rollback, crons, host rename):
  `docs/deploy.md`.
