# Account features backlog — consolidation phase 6

The sixth workstream of the [local-SEO consolidation](./local-seo-consolidation.md). The local-SEO
app ships six account-level features; the owner's brief is explicit: **port the pattern, but take
each to production quality — the polish local-SEO lacks.** So this is a backlog of *epics*, not a
sprint. Each is account/deployment-level (not local-SEO-specific), so it targets the **system**
section for **all** project types.

**Status:** Integration status ships now as the reference implementation (sets the quality bar).
The other five are specified below, prioritized.

## Definition of done (applies to every epic)

Non-negotiable for "production quality" — an epic is not done until all hold:

1. **Real data read** through a typed seam (no hard-coded fixtures in the component).
2. **Every state**: loading (mirror-the-shell skeleton), empty, error, and populated.
3. **Dark-mode tokens only** — no raw hex; both `data-theme` + `prefers-color-scheme` branches pass the contrast guard.
4. **cs + en** for every user-facing string.
5. **a11y**: keyboard-reachable controls, aria labels, `tnum` on figures.
6. **Pure compute** in `src/lib/<domain>/compute.ts` with a matching `test-unit/<domain>.test.mjs`.
7. **Honest gating**: controls that need a live connection are disabled with a note until it exists (no fake affordances).
8. **Path-scoped commit**; `context-map.json` updated (or left to vibeman) when file ownership changes.

---

## Epics

### 1. Integration status — `integrace`  ·  P1  ·  **SHIPPED (exemplar)**
- **Adamant today:** connectors exist but scattered (Google Ads, Gemini/BYOM, Resend, cron, Firestore/local, LightTrack, Meta/LinkedIn, Leonardo) — no single readiness view.
- **local-seo ref:** `status/page.tsx`, `IntegrationStatusPanel` over `/api/health` (dot grid).
- **Shipped:** `src/lib/integrations/{compute,status}.ts` (pure row-derivation + a server-only env reader) + `IntegrationStatusModule` — a per-category readiness board (connected / action / missing / manual / planned / optional) grounded on the project's real config (env presence + `project.adsCustomerId`). This is the "on-demand deployment" readiness the brief asked for.
- **DoD met:** pure compute + test; honest statuses; cs/en; tokens.

### 2. Activity — `aktivita`  ·  P1  ·  effort M
- **Adamant today:** a per-campaign activity/alerts feed exists (see `integration-backlog.md` "project activity feed — exists for campaigns → widen").
- **local-seo ref:** `activity/*`, `src/lib/activity/*` — 30-day autopilot proof-of-work log + CSV.
- **Production bar / DoD:** a **project-wide** activity timeline unifying every module's actions (not just campaigns) on one feed; filter by module + severity; 30/90-day window; CSV export; empty + loading states. Build on the shared `Insight`/activity model the integration-backlog proposes rather than a new silo.
- **Reuse:** generalize the campaign activity model; `src/lib/activity/` compute + test.
- **Depends on:** the shared activity/signal model (connective-tissue layer).

### 3. Monthly report — fold into `reporty`  ·  P1  ·  effort M
- **Adamant today:** a `reporty` module already exists (shared client reports + white-label microsite).
- **local-seo ref:** `report/MonthlyReport.tsx`, `src/lib/recap/*` — AI narrative + white-label PDF + shareable link + history.
- **Production bar / DoD:** extend `reporty` with a **monthly recap**: metric tiles + an on-demand AI narrative **through `generateStructured()`** (registry entry + `// llm-tool` — this one *does* trigger the real-model gate), brand-tokened PDF/print export, a share link with access control, and a past-reports history. Reuse the existing report/microsite plumbing.
- **Reuse:** `reporty` module, `RecapBlocks` pattern, the print CSS already in globals.css.
- **⚠ Gate:** the AI narrative is a new LLM operation → the ~10-min real-model gate applies to that commit.

### 4. Usage — `spotreba`  ·  P2  ·  effort M
- **Adamant today:** BYOM + the LLM quality matrix already model per-operation/provider cost (`src/lib/usage.ts`, `BYOM_MATRIX`); the ledger concept exists.
- **local-seo ref:** `usage/*`, `src/lib/tokens/*` — credit-spend receipts by action/client, over-time bars, billing-period filter, CSV.
- **Production bar / DoD:** spend by **operation / model / project** over a billing period; over-time bars (hand-rolled SVG on tokens); period filter; CSV export; ties to the real BYOM/quality cost model, not invented credits.
- **Reuse:** `src/lib/usage.ts`, the BYOM cost data; a `usage/compute.ts` rollup + test.

### 5. Branding — fold into `nastaveni`  ·  P2  ·  effort S
- **Adamant today:** `nastaveni` already owns name + brand accent; `Project.accentColor` exists per project.
- **local-seo ref:** `branding/*`, `src/lib/theme/*` — white-label name/accent/logo for client-facing reports.
- **Production bar / DoD:** extend `nastaveni` with **logo upload** + accent, a **live preview** against Adamant tokens, applied to client reports/microsite. Persist on the project. Contrast-safe accent (reuse the brand-accent split).
- **Reuse:** existing accent field + reports theming; a small `theme/compute.ts` (contrast pick) + test.

### 6. Account & Security — `ucet`  ·  P2  ·  effort M
- **Adamant today:** NextAuth (`src/auth.ts`), Firebase/local users, admin gating.
- **local-seo ref:** `account/*`, `src/lib/auth/*` — profile, last sign-in, "sign out everywhere" (revoke refresh tokens), GDPR delete.
- **Production bar / DoD:** profile + session metadata (last sign-in, created), **sign-out-everywhere** (revoke sessions), consent record, and an **account-deletion** request flow (GDPR). Honest gating in local/dev-auth mode.
- **⚠ Guardrail:** deletion / credential changes are irreversible & auth-sensitive — build the request/confirm flow; never auto-execute destructive account actions.

---

## Sequencing

1. **P1 now-ish:** Integration status (done), Activity, Monthly report — the three that most visibly "complete" the product surface.
2. **P2 next:** Usage, Branding, Account & Security.
3. **Cross-cutting prerequisite** for Activity (and a better Overview): the shared `Insight`/activity model from `integration-backlog.md`. Landing that first makes Activity a thin consumer instead of a new silo.
