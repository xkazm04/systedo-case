# Local-SEO consolidation — enriching Adamant with `03-local-seo-agency`

## Goal

Fold the strongest ideas from the standalone **local-seo-agency** app into Adamant as a
first-class **Local SEO** project type, plus reusable animation/loading craft. Adamant keeps its
architecture (module registry, Offering/Catalog spine, token-driven design); local-seo contributes
*features, UX patterns and visual craft*, not code — the two apps share a framework baseline but
not a data layer.

## Why this is low-friction

Both apps are **Next.js 16.3.0-preview.5 / React 19 / Tailwind v4 / token-driven CSS variables**,
reduced-motion-safe, with the same "async read-boundary" data seam. So the port is a *translation*
into Adamant's idioms, not a rewrite against a foreign stack.

## What differs (the translation table)

| Concern | local-seo | Adamant | Consolidation rule |
|---|---|---|---|
| Charts | Recharts | hand-rolled inline SVG | **Keep hand-rolled SVG** — rebuild the chart *feel* natively |
| Animation | framer-motion (`LazyMotion`) | CSS tokens (`.stagger`, keyframes) | **Hybrid**: add framer-motion for marquee interactive heroes only; CSS for the rest |
| Maps | Leaflet/OSM + SVG fallback | none | **Add Leaflet/OSM** for the map-pack module |
| Theme | "Neon Cartograph" cream/ink/lime | teal `brand-*` / `onyx-*`, dark-mode token pairs | **Adamant tokens only** — never port local-seo colors; dark-mode both triggers |
| Data | Firestore + token ledger + Gemini | Offering/Catalog spine + `generateStructured()` chokepoint | **Adamant spine only** — ground new modules on `ServiceOffering` + `Locality` + `seed01()` |

## Decisions locked (2026-07-07)

- **Animation strategy: Hybrid.** framer-motion enters Adamant *scoped to hero/interactive moments*
  (rank-climb pin animation, count-up tallies). All charts stay hand-rolled SVG themed on CSS vars.
- **This effort: plan doc → Phase 1** (new `local` project type + first module), path-scoped commits
  to master.
- **Map rendering: real Leaflet/OpenStreetMap**, with an SVG "cartograph" fallback when a listing has
  no lat/lng (local-seo already proves this seam).

---

## The new project type

Add `local` to `ProjectType` (`src/lib/projects/types.ts`). It is a **dedicated 5th type**, not an
extension of `leadgen` — but it *reuses* leadgen's existing local machinery internally (`lokalni`
module, `src/lib/local/{compute,sample,catalog}.ts`, service×area coverage, SERP rank buckets, AI
review replies) rather than duplicating it.

Proposed metadata:

- **label**: `Lokální SEO` / `Local SEO`  ·  **icon**: `local`  ·  **accent**: a brand-ramp hex
- **primaryGoal**: `Pozice v mapě & recenze` / `Map rank & reviews`
- **KPI preset** (reuses the shared metrics engine, relabeled): map-pack position, review rating,
  local visibility %, conversions/calls.

### Module scoping (`availableFor`)

| Module | For `local`? | Notes |
|---|---|---|
| Přehled / Výkon / Klíčová slova / Katalog / Reporty / Nastavení | yes | shared spine |
| `lokalni` (Local dominance) | yes | add `local` to `availableFor` |
| `mapa` (**new** — map pack + ranking ladder) | yes | Leaflet + rank ladder |
| `firmy` / companies (**new** — multi-location roster) | yes | Offering-grounded |
| `recenze` (**new** — Review Inbox) | yes | adapts local-seo `ReviewInbox` UX |
| `obsahovy-engine` + content schedule (**new** surface) | yes | GBP-post scheduling |
| kampane, socialni | optional | include if paid/social is in scope for the type |
| zisk, ltv, sklad-sezonnost, experimenty-lp, produktova-kreativa | no | e-shop/app only |

---

## Phased plan

### Phase 1 — Foundation: the `local` project type  *(this session)*
Framework-free core first (typecheck + `seed:check` gates it), then wiring.
1. `types.ts`: add `local` to `ProjectType` + `PROJECT_TYPES` + `PROJECT_TYPE_META`.
2. `modules.ts`: add `local` to the right `availableFor` arrays + a `KPI_PRESETS.local` entry.
3. `src/lib/catalog/seeds.ts`: add a `localSeoCatalog` + `demo-local` project (a multi-location
   local business, e.g. a dental/HVAC/gastro chain) so demo routes light up.
4. `src/lib/catalog/resolve.ts`: switch `local` → `localSeoCatalog`; enable `localitiesFor(local)`.
5. Add the `local` demo project to the project list/switcher so `/app/demo-local/...` resolves.
6. Verify: `npm run typecheck && npm run seed:check`, then click through `/app/demo-local`.

### Phase 2 — Reusable animation & loading craft  *(point 1)*
7. Add `framer-motion` + a `MotionProvider` (`LazyMotion`/`domAnimation`) at the marketing shell
   only; establish easing tokens in `src/lib/motion.ts` mirroring local-seo.
8. Port, **rethekied to Adamant tokens**: `Kinetics` primitives (`Kinetic`, `Tally`, `ChartReveal`,
   `Marquee`) and the rank-climb hero (`RankClimbDemo` → CSS-radial-ring map, framer `layout` pin).
9. Rebuild the 3 signature charts as **hand-rolled SVG** on CSS vars: rank-climb area (inverted Y),
   visibility radial gauge, competitor share bars. Reduced-motion + print safe (globals.css family).
10. Adopt the "mirror-the-live-shell" skeleton pattern for the new modules' `loading.tsx`.

### Phase 3 — Company management & analysis  *(point 3)*
11. New `firmy` module: multi-location/multi-client roster — summary tiles (locations, on-autopilot,
    needs-you, drafts) + table (GBP status, flagged, reviews, open). Grounded on Offering + Locality.
12. Active-location settings block (GBP health, budget cap, branding link). Honest control gating.

### Phase 4 — Map pack & ranking ladder  *(point 4)*
13. New `mapa` module: Leaflet/OSM map (you vs named competitors) + ranked listings + share-of-voice.
14. **Ranking ladder**: per-keyword position history climb, hand-rolled SVG (inverted-Y like the
    landing chart). SVG cartograph fallback when a listing lacks geo.
15. Compute layer `src/lib/mappack/{compute,sample}.ts` + `test-unit/mappack.test.mjs`.

### Phase 5 — Content management baseline  *(point 5)*
16. **Review Inbox** (`recenze`): filter/sort/search reviews, per-review AI reply via
    `generateStructured()` (registry entry + `// llm-tool` tag), batch "draft all", flag-for-owner,
    sentiment bar, saved-reply macros. Persist filters per project. (Adapts local-seo `ReviewInbox`.)
17. **Content Schedule**: GBP-post drafting (AI, near-duplicate detection) → approve → calendar grid.
    Reuse `WeekPlanner` / `obsahovy-engine`; extend for local GBP posts.

### Phase 6 — Account features backlog  *(point 6)*
Each is a *production-quality* target (local-seo has the feature but not the polish). Specs below.

---

## Account features backlog (point 6)

local-seo ships all six but the owner flags production-quality/UX gaps. Port the **pattern**, raise
the bar. Each item lists the local-seo reference and the Adamant production bar.

| Feature | local-seo reference | Adamant production bar |
|---|---|---|
| **Activity** | `activity/*`, `src/lib/activity/*` — 30-day autopilot proof-of-work log + CSV | Project-wide activity feed unified with the existing campaign `activity`; every module action on one timeline; filter by module/severity; empty & loading states |
| **Monthly report** | `report/MonthlyReport.tsx`, `src/lib/recap/*` — AI narrative + white-label PDF + shareable link | Fold into existing `reporty` module; AI narrative via `generateStructured()`; brand-tokened PDF; share link with access control; past-reports history |
| **Branding** | `branding/*`, `src/lib/theme/*` — white-label name/accent/logo | Fold into `nastaveni`; live preview against Adamant tokens; per-project accent already exists — extend to logo + client-report theming |
| **Usage** | `usage/*`, `src/lib/tokens/*` — credit-spend receipts, by action/client, over-time bars | Ties to the BYOM/quality-matrix cost model; spend by operation/model/project; billing-period filter; CSV; hand-rolled SVG bars |
| **Account & Security** | `account/*`, `src/lib/auth/*` — profile, last sign-in, sign-out-everywhere, GDPR delete | Match Adamant auth (Firebase); sign-out-everywhere (revoke refresh tokens); consent record; account-deletion flow |
| **Integration status** | `status/page.tsx`, `IntegrationStatusPanel` — `/api/health` dot grid | On-demand deployment readiness board: Google Ads, GBP OAuth, Firestore, LLM providers (per BYOM), cron, feeds — configured/missing per project |

**Each account feature is its own backlog epic** — do not ship any as a stub. Definition of done
per module: real data read, loading + empty + error states, dark-mode tokens, cs/en strings, a11y,
and a `test-unit` for any pure compute.

---

## Guardrails (must-follow for every phase)

- **Read `node_modules/next/dist/docs/` before writing any Next.js code** (modified Next — AGENTS.md).
- **Cache Components**: wrap auth/param/data reads in `<Suspense>` with a skeleton fallback; reuse the
  `cache()`-deduped session/project reads. No `force-dynamic`/`runtime` exports.
- **Dark-mode tokens only** — no raw hex; keep both `data-theme="dark"` and `prefers-color-scheme`
  branches in sync; the contrast guard test must pass.
- **LLM calls** go through `generateStructured()` with a `// llm-tool` tag + registry entry, or the
  pre-commit LLM gate fails.
- **Pure compute** in `src/lib/<domain>/compute.ts` with a matching `test-unit/<domain>.test.mjs`.
- **Framework-free core**: keep `types.ts`/`modules.ts`/`offering.ts`/`resolve.ts` React- and
  firebase-free.
- **Path-scoped commits** to master (concurrent vibeman agent runs here); update `context-map.json`
  when a context's `filePaths` change.
- **i18n**: every user-facing string gets cs + en.
