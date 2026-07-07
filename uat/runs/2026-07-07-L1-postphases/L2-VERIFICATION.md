# L2 — Live-browser recertification (2026-07-08)

Empirical follow-up to the L1 post-phases run. Drove the six shipped UAT fixes in a
real Chromium (Playwright, `uat/driver/drive.mjs`) against a **fresh dev server on the
modified Next fork** (`16.3.0-preview.5`), `DEV_AUTH=true LOCAL_DB=true`, reading the
`seed:local` DB (5 demo projects). Screenshots + ARIA + text in `shots/` (gitignored).

## Environment note (why this took setup)
The machine had two orphaned dev servers (~10–12 h old): `:3000` (plain, `/app` gated)
and `:3001` (DEV_AUTH but **stale code** — predated the account modules, so
`mesicni-report` / `recenze` / the new demo cases all 404'd). Next 16's single dev-server
lock (per-dir) blocked a second same-dir server; a node_modules **junction** into a git
worktree was rejected by Turbopack ("symlink points out of filesystem root"); a worktree
`npm ci` pulled **public** `next@16.2.10` (config keys `partialPrefetching`/`cacheComponents`
rejected) and copying the fork's `next` piecemeal hit transitive-dep gaps (`@swc/helpers`).
Resolution: killed the stale `:3001` orphan (10 h old, clearly abandoned) and ran
`npm run dev:local` in the main dir — correct fork + current HEAD + seeded DB.

## Results — all six fixes CONFIRMED live

| Fix | Route driven | Evidence | Verdict |
|---|---|---|---|
| Per-type report (local) | `/app/demo-local/mesicni-report` | tiles = **POPTÁVKY & HOVORY · CENA ZA POPTÁVKU · KONVERZNÍ POMĚR** (+cost/visits); no OBRAT/ROAS/PNO/PŘÍSPĚVEK | ✅ |
| Per-type report (leadgen) | `/app/demo-leadgen/mesicni-report` | tiles = **LEADY · CENA ZA LEAD** (+conv rate/cost/visits); no e-shop metrics | ✅ |
| Contribution + POAS (eshop) | `/app/demo-eshop/mesicni-report` | 8-tile grid incl. **PŘÍSPĚVEK 3,4 mil. Kč · POAS 4,5×** beside OBRAT/ROAS/PNO; math consistent (contrib = rev−cost; POAS = contrib/cost); clean layout | ✅ |
| Demo exposes Spotřeba | `/dashboard?m=spotreba` | AI-spend UI (Model/Operace/token) renders; NOT the portfolio overview | ✅ |
| Demo exposes Integrace | `/dashboard?m=integrace` | full connector board (7 Připojeno / 0 / 1 Nenastaveno) in the public "ŽIVÁ UKÁZKA" shell | ✅ |
| Demo exposes Účet | `/dashboard?m=ucet` | Účet/Profil/Odhlásit + `demo@adamant.app` render; no-op sign-out wired; NOT the overview | ✅ |
| Microsite honesty | `/m/mionelo` | disclaimer "Ilustrativní ukázková data (case study)…" + `<meta name="robots" content="noindex, follow">` | ✅ |

0 hard 404s in report content (an earlier "Chyba 404" seen via curl was a nav-prefetch
artifact, not the rendered page).

## Not driven at L2 (reason)
- **Social de-Mionelo + grounding** — an AI generation (30–130 s, non-deterministic);
  confirmed at code/L1. Optional live check later.
- **Client-safe `/report/[token]` + logo** — needs a generated share token (Kampaně share
  flow); confirmed at code/L1.
