# Account features backlog — consolidation phase 6

The sixth workstream of the [local-SEO consolidation](./local-seo-consolidation.md). The local-SEO
app ships six account-level features; the owner's brief is explicit: **port the pattern, but take
each to production quality — the polish local-SEO lacks.** So this is a backlog of *epics*, not a
sprint. Each is account/deployment-level (not local-SEO-specific), so it targets the **system**
section for **all** project types.

**Status: ALL SIX SHIPPED.** Integration status set the quality bar; the other five followed,
each as a system-section module (all project types), one commit each, verified against the shared
DoD below. Two plan deviations, noted per-epic: Monthly report shipped as its own module
(`mesicni-report`) rather than folded into `reporty`, and Branding shipped as its own module
(`branding`) rather than folded into `nastaveni` — in both cases to keep concerns separate and
avoid disturbing the existing surfaces. Suite: 580/580 unit tests, build + typecheck green.

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

### 2. Activity — `aktivita`  ·  P1  ·  **SHIPPED**
- **Adamant today:** a per-campaign activity/alerts feed exists (see `integration-backlog.md` "project activity feed — exists for campaigns → widen").
- **local-seo ref:** `activity/*` — 30-day autopilot proof-of-work log + CSV.
- **Shipped:** `src/lib/activity/{sample,compute}.ts` + `ActivityModule` — a **project-wide** timeline unifying every module's actions; filter by module + severity + window (7/30/all), severity summary, localized event titles (template-key + params), CSV export (BOM + RFC-4180). Seeded on the real activity shape; live seam is `recordActivity()`.
- **Follow-up:** wire real `recordActivity()` emissions from every module's mutation/sync path (shared activity/signal model) so the feed stops being seeded.

### 3. Monthly report — `mesicni-report`  ·  P1  ·  **SHIPPED** (own module, not folded)
- **Adamant today:** a `reporty` module already exists (shared client reports + white-label microsite).
- **local-seo ref:** `report/MonthlyReport.tsx` — AI narrative + white-label PDF + shareable link + history.
- **Shipped:** `src/lib/report/compute.ts` (delta-tone + tile specs, tested) + `MonthlyReport` — KPI tiles grounded in `buildSnapshot()` (same illustrative dataset the AI reads → tiles + narrative stay consistent), on-demand AI narrative **reusing the existing `analysis` operation** (no new op → **no gate**), period switch, Print/PDF + Markdown export.
- **Deviation:** shipped as its own module rather than folded into `reporty` — `reporty` is the shareable client microsite; this is the performance recap. Different concern.
- **Follow-up:** per-project (per-type) grounding — the `analysis` op is eshop-metric / case-study grounded, so tiles read eshop-style on any type. A structured recap op grounded on `getProjectDataset(project)` would fix this (**that** would trigger the gate). Also: share link + history.

### 4. Usage — `spotreba`  ·  P2  ·  **SHIPPED**
- **Adamant today:** BYOM + the LLM quality matrix model per-operation/provider cost; per-call telemetry is recorded at `recordLlmCall` (`src/lib/llm/telemetry.ts`) against the cost tiers in `src/lib/llm/cost.ts`.
- **local-seo ref:** `usage/*` — credit-spend receipts by action/client, over-time, billing-period filter, CSV.
- **Shipped:** `src/lib/spend/{sample,compute}.ts` (rollups: filter, totals, byOperation/byModel, costShare — tested incl. a cross-rollup total invariant) + `SpendModule` — window (7/30/all), totals tiles, cost-share bars by operation, per-model table, CSV export. Seeded on the real telemetry/cost shape.
- **Follow-up:** the live rollup needs `llmTelemetry` to carry `userId`/`projectId` (added once at the `recordLlmCall` chokepoint) for a per-project view; then swap the seed for the real aggregate.

### 5. Branding — `branding`  ·  P2  ·  **SHIPPED** (own module, not folded)
- **Adamant today:** `nastaveni` already owns name + brand accent; `Project.accentColor` persists per project.
- **local-seo ref:** `branding/*` — white-label name/accent/logo for client-facing reports.
- **Shipped:** a new **persisted** `project.logoUrl` end-to-end (types + PATCH whitelist + both stores: Firestore merge + sqlite schema column + additive migration + row-map/UPDATE + seed schema — roundtrip-verified), `src/lib/branding/compute.ts` (hex validation + luminance-based contrast pick + initials, tested), and `BrandingModule` — accent swatches + color/hex input + logo URL with a **live, contrast-correct report-header preview**, saved via PATCH + `router.refresh()`.
- **Deviation:** its own module rather than a section inside `nastaveni` — kept `nastaveni` untouched (concurrent-agent safety); accent lives in both but both PATCH the same field.
- **Follow-up:** true logo *upload* (Firebase Storage) vs the current hosted-URL field.

### 6. Account & Security — `ucet`  ·  P2  ·  **SHIPPED**
- **Adamant today:** NextAuth (`src/auth.ts`), Firebase/local users, admin gating. Session exposes `{id,name,email,image}` + `signOut`; dev-auth is synthetic (no provider/session store).
- **local-seo ref:** `account/*` — profile, last sign-in, "sign out everywhere", GDPR delete.
- **Shipped:** `src/lib/account/compute.ts` (honest security checklist — dev-auth checks read "unavailable", not green — + email masking, tested) + `AccountSecurity` — profile (masked email, avatar/initials), the checklist, **real sign-out** via a server action (gated off in dev-auth), and a GDPR deletion **request** (confirm flow that never executes — deletion is irreversible + handled manually). Reads the real `currentSession()` + `DEV_AUTH`.
- **Guardrail honored:** no destructive account action is auto-executed; deletion routes to a manual request.
- **Follow-up:** true session-revocation (sign-out-everywhere, currently gated) + persisted sign-in metadata (last/created) require new reads against the NextAuth adapter collections.

---

## What's left (follow-ups, not blocking)

All six modules ship and are wired into the sidebar (system section, every project type). What
remains is turning seeded/gated surfaces into fully live ones — captured per-epic above and summed
here:

1. **Real data emission** — ✅ **done (live-read with seed fallback).** Usage: `llmTelemetry`
   now carries `userId`/`projectId` (attributed at the chokepoint via an AsyncLocalStorage request
   context set by the AI route); the Usage page reads the live per-project rollup, seed fallback
   when empty. Activity: `recordActivity()` now fires on project settings/branding changes (the
   project PATCH route); the Activity page reads the live tenant feed, seed fallback when empty.
   Both are Firestore-only, so "live" is visible in production, not local/dev. Activity emitters now
   fire on project **create**, **settings/branding** changes, **catalog** save, **warehouse**
   connect/disconnect, and **Google Ads** link (all via one `emitProjectActivity` helper). *Remaining:*
   emitters for content/reviews/map/keywords/social/experiment mutations, and a `projectId` on more
   AI call payloads so per-project spend covers every operation, not just the grounded ones.
2. **Monthly report per-type grounding** — a structured recap op on `getProjectDataset(project)`
   (this one *would* trigger the ~10-min LLM gate) so tiles/narrative fit non-eshop types.
3. **Account** — true session-revocation + persisted sign-in metadata (NextAuth adapter reads).
4. **Branding** — logo *upload* (storage) beyond the hosted-URL field.
5. **Integration status** — live probes for connectors that currently report from env presence only.
