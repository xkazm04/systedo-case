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
# entry points: /app (hub), /app/demo-eshop, /app/demo-leadgen, /app/demo-app, /app/demo-content
```
**Fixture preflight (run before L2 — a Character whose surface has no fixture is untestable, not passing).** The seed creates one project of **every** project type, because module availability is gated by project type (`src/lib/projects/modules.ts` → each module's `availableFor`). Character → reachable surfaces by type:
- **`demo-eshop`** (eshop): zisk, sklad-sezonnost, produktova-kreativa, **ltv** (e-shop-framed), socialni, kreativa + shared → **Robert, Sofie, Dan**.
- **`demo-leadgen`** (leadgen): kvalita-leadu, rychla-reakce, lokalni + shared → **Hana**.
- **`demo-app`** (app): srovnani-seo, experimenty-lp, ltv, socialni + shared → **Tobias**.
- **`demo-content`** (content): obsahovy-engine, distribuce, publikum, kreativa + shared → **Eva**.
- shared / ALL: prehled, vykon, klicova-slova, obsah, knihovna, reporty, nastaveni → **Petra, Tomáš, Lucia**.

> **Client-facing surfaces need a generated token.** Lucia's white-label microsite (`/report/<token>`) is unreachable without first creating a shared report (Kampaně → "Sdílet report") and capturing its token — create one in the preflight, or that journey can't be driven live.

> Caveat: this makes the **project hub + authed shell** work offline. Individual module data stores (campaigns/social/keywords/etc.) may still expect Firestore in the cloud path — verify per module when a journey first touches one; widening offline coverage to those stores is a tracked follow-up, not done here.

## Driver mechanism
- Prefer an interactive browser MCP (chrome-devtools / playwright) if connected.
- Else the bundled drivers: **`driver/drive.mjs`** (navigate → screenshot + ARIA + text + one click) for static surfaces, **`driver/drive-ai.mjs`** (fill → generate → poll until the model result settles, optional grounding assertion) for AI surfaces. From repo root: `MSYS_NO_PATHCONV=1 BASE_URL=http://localhost:3100 SHOT_DIR=uat/runs/<id>/shots node uat/driver/drive.mjs /route shot [click]`. Use `locator.ariaSnapshot()` — `page.accessibility.snapshot()` was removed in Playwright ≥1.50; don't block on `networkidle` (HMR socket never idles).
