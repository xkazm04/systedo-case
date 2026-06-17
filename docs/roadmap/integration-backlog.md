# Integration backlog — from "set of features" to one product

## Diagnosis

Today every module is a **vertical silo**: it reads its own `sample.ts`, computes, and renders.
Three structural gaps make the app feel like a collection of features instead of one product:

1. **No shared data spine.** The dashboard reads static `performance.json`; campaigns read the
   per-user tenant; the 12 portfolio modules each read an isolated `sample.ts`. Nothing reflects the
   *same* project reality.
2. **No cross-module signals.** One module's output is never another's input. Profit can't move
   budget; keywords don't feed content; lead quality doesn't change bidding.
3. **No unifying surface.** The Overview is a KPI band + a module grid (a launcher). There is no
   place where the whole project's "what needs attention" is assembled.

The fix is three layers — a **data spine**, **connective tissue** (a shared recommendation/alert
model + a command-center Overview), and explicit **cross-module flows** — then live connectors.

---

## The interconnection graph (target)

```
                         ┌─────────────── Ad data spine (per project) ───────────────┐
 Campaigns sync ─────────┤→ Dashboard (Výkon)  → Profit/POAS  → Patterns  → Reports   │
                         └───────────────┬───────────────────────────────────────────┘
 Profit flags loss ──────────────────────┤→ Recommendation → Budget moves → Control plane → Campaigns
 Stock/Season ───────────────────────────┘   (pause low-stock, pace to forecast)

 Keywords → Content brief → Article → Distribution → Social     (content value chain)
        ↑__________ Content engine (clusters, decay) ← article traffic ←_____________↓
 Compare SEO ─────────────────→ feeds the content/brief queue

 Speed-to-lead inbox → outcome → Lead quality (CRM) → bidding toward *qualified* → Campaigns
 Local coverage gaps ─────────────────────────────→ new microsites / landing pages

 LTV cohorts → max-CAC / payback target → Campaign target CPA
 LP experiments winner ───────────────────────────→ deploy as the live landing page

 Patterns (learning layer) ← winners from campaigns + experiments + content → tunes AI everywhere

 OVERVIEW = command center: aggregates every module's top Insight/Recommendation/Alert
            into one prioritized "Needs attention" feed, each with a one-click action.
```

---

## Unifying primitives to build (the connective tissue)

- **`Insight` / `Recommendation` model** — one shared type every module emits:
  `{ id, module, severity, title, detail, metric?, action?: { label, href, mutation } }`. Modules
  become *producers*; the Overview + an Alerts inbox become *consumers*. Generalize the existing
  campaign `alerts`/`activity` to be project-wide.
- **Project signal store** — per-project derived signals (KPIs, recommendations, alerts) computed
  from the data spine and cached, surfaced on the Overview.
- **Automations / rules engine** — declarative rules wiring modules: `POAS<1 for 7d → propose cut`,
  `days-of-cover<7 → pause`, `qualRate<35% → flag source`, `article decay<−30% → queue refresh`.
  The cron jobs already exist — generalize into a rules layer.
- **Project activity feed** — every module action on one timeline (exists for campaigns → widen).

---

## Live-integration backlog (replace each sample provider, behind the existing seam)

| Module | Live source |
|---|---|
| Dashboard, Profit/POAS | Google Ads channel-level cost/revenue (extend the existing Ads connector to segment granularity) |
| Produktová kreativa, Sklad | Google Merchant Center feed + ERP (margins, inventory) |
| CAC→LTV | Product analytics (Segment / PostHog / Stripe) |
| LP experimenty | Real traffic split + analytics |
| Srovnání & SEO, Obsahový engine | Search Console + keyword tool (Keyword Planner already wired) |
| Kvalita leadů | CRM webhook (HubSpot / Pipedrive / Raynet) |
| Rychlá reakce | Form/call/email intake + send |
| Lokální dominance | Google Business Profile + rank tracker + reviews + call tracking |
| Distribuce | Social/scheduler APIs (social connectors exist) + UTM attribution |
| Publikum & výnos | ESP (newsletter) + ad/sponsorship data |

---

## Prioritized phases

### Phase A — Data spine (prerequisite for everything) ☑ shipped
- **A1. Per-project tenant** (`proj_{id}`): thread a tenant override through `connector.ts` + the
  data routes so all modules scope to the active project (lifts the v1 boundary).
- **A2. `ProjectData` loader**: resolve the project's sources once per request (live or sample),
  share across modules.
- **A3. Migrate Dashboard + Profit** to read the project's synced campaign data instead of static
  `performance.json` — so e-shop modules reflect one reality.

### Phase B — Connective tissue (biggest "one product" win)
- **B1. `Recommendation`/`Insight` model** + per-module producers.
- **B2. Generalize alerts + activity** to project scope.
- **B3. Overview = command center**: a prioritized "Needs attention" feed aggregating all modules,
  each row linking to the module + a suggested action.

### Phase C — Cross-module flows (wire the loops)
- C1. Profit → Budget moves → Control plane (cut loss-making channels).
- C2. Stock/Season → budget pacing + low-stock pause.
- C3. Keywords → Content → Distribution → Social (one pipeline, with traffic feeding back).
- C4. Lead quality → campaign bidding toward qualified.
- C5. LTV → max-CAC target; LP winner → live landing page.
- C6. Patterns learning layer feeding AI evaluations.

### Phase D — Live connectors
Implement real providers behind each seam, by type (Merchant Center → CRM → Search Console →
analytics → ESP → GBP), each with sample fallback.

### Phase E — Hardening
- Onboarding wizard that connects data sources per type.
- Settings → per-module connection management.
- Tests for the 12 modules + e2e of the flows.
- i18n (en) for the new modules (cs-only today).
- Per-project usage metering.

---

## Recommended starting point

**A1 → A3 → B3.** Per-project data spine, then migrate the e-shop modules onto it, then rebuild the
Overview as a command center. After that the app *demonstrates* interconnection on one type, and the
remaining flows (Phase C) and connectors (Phase D) slot onto the spine.
