# Environment recipe — reaching a known, reproducible start state

Everything downstream depends on a *reproducible* start state. Pin this before trusting any run.

## App + server
- Start: `npm run dev` (Next.js 16, http://localhost:3000), **or** let Playwright spawn `next dev` on `E2E_PORT` (default **3100**) as the existing `tests/*.spec.ts` do.
- UI language: **Czech**. Drive with Czech role-based selectors (see `tests/kampane-triage.spec.ts` for the pattern).

## Data / seed
- Performance dashboard data is a committed, seeded series — regenerate with `npm run seed` if needed. Deterministic.
- Campaigns: on `/kampane`, click **"Synchronizovat z Google Ads"** to populate from the **deterministic sample provider** (no API key, reproducible — the sample always contains rule-breaching campaigns). Data persists to a local SQLite file.

## LLM provider (for the *app's* own AI features, not the UAT driver)
- Dev: the app's AI calls route through the Claude Code CLI wrapper (Sonnet via subscription). Prod: Gemini. With no provider configured it degrades to a deterministic demo.
- Note: the **UAT Character driver is a separate capable LLM** driving the browser; it does not collide with the app's provider. AI-tool journeys will be slower (real model calls; the page has a 30s/60s client ceiling) — budget for it.

## Surfaces

### Public (pilot here — no auth)
`/` · `/dashboard` · `/kampane` · `/ai-asistent` · `/clanek` · `/cena`

### Authed product (`/app/[projectId]/*`) — RESOLVED: offline local mode
~22 tools (keywords, creative, LTV, lead-quality, review-response, SEO-comparison, profit, audience…). Drive them with no Google OAuth and no Firebase, via the local-dev seam:

1. **Auth** — `DEV_AUTH=true` bypasses Google and signs in a fixed test user (`src/auth.ts`, hard-gated off in production). Identity overridable via `DEV_AUTH_USER_*`.
2. **Data** — `LOCAL_DB=true` persists users + projects to local `node:sqlite` (`.data/systedo.db`) instead of Firestore (`src/lib/local-mode.ts`, `src/lib/projects/store.local.ts`). No Firebase creds needed.
3. **Seed** — `npm run seed:local` creates the dev user + stable sample projects.

Recipe:
```
npm run seed:local
npm run dev:local        # = DEV_AUTH=true LOCAL_DB=true next dev
# entry points: /app  (project hub),  /app/demo-eshop  (eshop workspace),  /app/demo-leadgen
```
Seeded `projectId`s for journeys: **`demo-eshop`** (type eshop → full campaigns/creative/content sidebar) and **`demo-leadgen`** (type leadgen → CPL-focused).

> Caveat: this makes the **project hub + authed shell** work offline. Individual module data stores (campaigns/social/keywords/etc.) may still expect Firestore in the cloud path — verify per module when a journey first touches one; widening offline coverage to those stores is a tracked follow-up, not done here.

## Driver mechanism
- Prefer an interactive browser MCP (chrome-devtools / playwright) if connected.
- Else: small per-run Playwright driver scripts under `runs/<id>/driver/` — navigate, `page.screenshot(...)`, `page.accessibility.snapshot(...)`, iterate action-by-action. Mirror the existing test setup (port, selectors, `reuseExistingServer`).
