# Feature Scout Scan — systedo-case, 2026-06-18

> Feature-discovery pass over the per-project analytics workspace (`/app/[projectId]/<module>`).
> Scope: **contextless / per-module** — one scanner per module file under
> `src/components/app/modules/`. 15 modules, 5 ideas each, run as 15 parallel
> Feature-Scout subagents in 2 waves (8 + 7). Read-only; no source changed.

---

## Totals

| | Modules | Ideas | per module |
|---|---:|---:|---:|
| Feature opportunities | 15 | **75** | 5 |

Feature Scout finds opportunities, not defects — so there is no severity axis.
Ideas are scored **Impact / Effort / Risk (1–10)** and triaged by **value**
(high impact ÷ low effort & risk).

**Impact distribution** (count of ideas at each impact level):

| Impact 9 | Impact 8 | Impact 7 | Impact 6 |
|---:|---:|---:|---:|
| 19 | 20 | 22 | 14 |

Counts verified two ways: `> Total:` headers sum = **75**; `## N.` idea headings = **75**. ✓

---

## The one finding that dominates this scan: **built-but-unwired**

The single loudest signal across all 15 modules: **most modules' headline capability
already has working backing code in the repo — it just isn't connected to the module.**
The modules render the *diagnosis* (a table, a pill, a static draft) but stop short of
the *action* the registry blurb promises, even though the machinery for that action
exists elsewhere and is reachable. Concretely, the scanners found:

| Module | Promised capability | What already exists, unused |
|---|---|---|
| Produktová kreativa | "generate ads from feed" | AI `ads` tool + route + `useAiTool` hook fully built, wired nowhere — only deterministic `buildAssetGroup` runs |
| Distribuce | "AI repurposing into channel variants" | `generateStructured` LLM wrapper + per-channel length validator present; module uses a hardcoded template that ignores the article body |
| Rychlá reakce | "AI-drafted reply" | `draftReply()` returns one hard-coded template; the `/api/ai` seam + `useAiTool` are ready |
| Obsah & SEO | "brief → published article" | full `Article` model + renderer + JSON-LD + `snapshot-to-article.ts` exist; brief stops at a skeleton |
| Obsahový engine | "obnova upadajícího obsahu" | decay table is read-only with a "do it manually" footer, yet the sessionStorage-seed → `router.push` handoff to Obsah already works for keywords |
| Srovnání & SEO | "high-intent → content" | only a static empty link out; the `briefSeedKey` + `BriefSeed` bridge already powers the keyword→brief handoff |
| Sklad & sezónnost | "pause draining SKUs, shift budget" | a full audited budget control-plane (`createChangeSet`/`simulate`/`approve`/`revert`) exists — fed only by ROAS, never by stock |
| Lokální dominance | "service×location coverage" | `LocalTarget.rank` is captured in the data model but never rendered |
| Kvalita leadů | "cost per qualified lead" | module is 100% static sample; the code itself flags the unbuilt CRM ingest seam |

These are the highest-value items in the whole scan precisely because the cost is
"wire the existing seam," not "build from zero."

---

## Per-module breakdown

Sorted by top-idea value. Type = project type the module is available for.

| # | Module | Route | Type | Top idea (`#1` unless noted) | I/E/R |
|---|---|---|---|---|---|
| 1 | Obsahový engine | `obsahovy-engine` | content | „Obnovit" — decay → AI refresh-brief handoff into Obsah | 9/3/2 |
| 2 | Srovnání & SEO | `srovnani-seo` | app | "vs/alternativa" draft pipeline into Obsah (brief-seed) | 9/4/2 |
| 3 | Lokální dominance | `lokalni` | leadgen | Local rank as service×location grid (unused `rank`) | 9/4/2 |
| 4 | Produktová kreativa | `produktova-kreativa` | eshop | Wire AI ad-copy generator onto the asset group | 9/4/3 |
| 5 | Distribuce | `distribuce` | content | UTM-stamped variant links + real attribution loop (`#2`) | 9/4/3 |
| 6 | LP experimenty | `experimenty-lp` | app | Sample-size & duration "trust gate" before reading results | 9/4/3 |
| 7 | Rychlá reakce | `rychla-reakce` | leadgen | SLA breach alert + live countdown (`#2`) | 8/3/2 |
| 8 | CAC → LTV | `ltv` | app | Retention/survival curve per cohort | 8/4/2 |
| 9 | Obsah & SEO | `obsah` | all | Validate & autocomplete internal links vs real URLs (`#2`) | 8/4/3 |
| 10 | Publikum & výnos | `publikum` | content | Subscriber-source attribution | 9/5/3 |
| 11 | Klíčová slova | `klicova-slova` | all | Sémantické shluky (intent clustering → pillar + subpages) | 9/5/3 |
| 12 | Kvalita leadů | `kvalita-leadu` | leadgen | CRM webhook + import of lead outcomes | 9/6/4 |
| 13 | Zisk | `zisk` | eshop | Target-POAS budget reallocation simulator | 9/6/4 |
| 14 | Sklad & sezónnost | `sklad-sezonnost` | eshop | Per-SKU budget change-set off near-stockout SKUs | 9/6/5 |
| 15 | Nastavení | `nastaveni` | all | Data-source connection manager (GA4/GSC/GMC/CRM) | 9/6/4 |

---

## Top value picks — 12 quick wins (Impact ≥ 8, Effort ≤ 4, Risk ≤ 3)

These deliver outsized value for the cost. Most are "wire the existing seam" items.

1. **Obsahový engine #1** — „Obnovit" decay → refresh-brief handoff (9/3/2) — bridge exists
2. **Rychlá reakce #2** — SLA breach alert + live countdown (8/3/2)
3. **Distribuce #3** — copy/edit/push-to-social per variant; kill dead-end `<pre>` (8/3/2)
4. **Publikum #3** — revenue-mix diversification & concentration risk (8/3/2)
5. **Srovnání & SEO #1** — "vs/alternativa" → brief handoff into Obsah (9/4/2) — bridge exists
6. **Lokální #1** — service×location rank grid from the unused `rank` field (9/4/2)
7. **CAC→LTV #1** — retention/survival curve per cohort (8/4/2)
8. **Produktová kreativa #1** — wire the built AI `ads` tool onto the asset group (9/4/3)
9. **Distribuce #2** — UTM-stamped links + close the attribution loop (9/4/3)
10. **LP experimenty #1** — sample-size & duration gate so users stop reading noise (9/4/3)
11. **Obsah & SEO #2** — validate/autocomplete internal links vs real site URLs (8/4/3)
12. **Publikum #2** — sponsorship rate-card calculator from audience size (9/4/3)

---

## Triage themes

| Theme | ~Count | Why it's a wave, not scattered fixes |
|---|---:|---|
| A. **Wire the existing seam** (built-but-unwired) | ~9 | One mental model — connect a ready AI tool / control-plane / handoff bridge / data field to the module. Highest value, lowest effort. |
| B. **Cross-module workflow & NextSteps** | ~10 | Turn 15 islands into one funnel: keywords→brief→content→distribution, decay→refresh, ship-the-winner, profit/stock→kampane. Several modules have no `NextSteps` at all. |
| C. **AI-assist generation via the LLM wrapper** | ~9 | Each adds a `generateStructured` call site (with demo fallback + the coverage test the repo already enforces): ad copy, replies, repurposing, review responses, cluster maps, brief→draft. |
| D. **Analytical correctness & depth** | ~8 | Make the numbers trustworthy: LP sample-size/peeking guards, per-channel CAC (not blended-only), POAS simulator, SKU margins, SERP gap. |
| E. **Real data-source integrations** | ~8 | Replace static sample data with real ingestion: product feed, CRM webhook, offline-conversion upload, GA4/GSC connector hub, UTM/attribution, NAP/GBP. |
| F. **Alerts, monitoring & trends over time** | ~8 | The app is snapshot-only; add time-series + proactive alerts: SLA breach, stockout risk, CPQL drift, LTV:CAC threshold, RPM/profit trend, SERP movers. |
| G. **Settings / admin / multi-tenancy** | ~5 | Agency-grade project admin: team & roles, audit log, archive/duplicate guardrails, notification prefs, connector hub. |

(Themes overlap — an idea can be both "wire the seam" and "AI-assist." Counts are indicative.)

---

## Suggested next-phase split (wave plan)

Each wave is one focused session (~6 ideas, shared mental model). Ordered so value
and momentum compound.

- **Wave 1 — "Wire what's already built"** (Theme A): obsahovy-engine #1, compare-seo #1, local #1, catalog #1, distribution #1/#2, speed-lead #1. Realize each module's promised headline at low effort because the backing code exists.
- **Wave 2 — Cross-module handoffs** (Theme B): keywords #1 cluster→brief, content #1 brief→draft, content-engine #4 internal-link graph, lp #5 ship-the-winner, inventory #4 → Overview, audience NextSteps. Make it a connected funnel.
- **Wave 3 — Analytical correctness** (Theme D): lp #1 sample-size gate + lp #2 peeking guard, ltv #2 per-channel CAC, profit #1 POAS simulator, profit #2 SKU margins, keywords #2 SERP gap.
- **Wave 4 — Real integrations** (Theme E): catalog #2 feed import, lead-quality #1 CRM webhook, lead-quality #3 offline conversions, project-settings #1 connector hub, distribution #2 attribution, local #4 NAP/GBP.
- **Wave 5 — Alerts & trends** (Theme F): speed-lead #2 SLA breach, inventory #4 stockout alerts, lead-quality #5 CPQL drift, ltv #4 LTV:CAC alert, profit #3 + audience #4 trends, compare-seo #4 SERP monitoring.
- **Wave 6 — Settings / admin** (Theme G): project-settings #2 team & roles, #3 audit log, #4 archive/duplicate, #5 notifications.

---

## How this scan was run

- **Scanner**: Feature Scout (`agent_feature_scout`, `scanType: feature_scout`), from the Vibeman prompt registry `src/lib/prompts/registry/agents/feature-scout.ts`.
- **Mode**: contextless — scope unit was each module **file**, not a Vibeman context. No Vibeman API/DB used; reports are markdown only.
- **Targets**: the 15 files in `src/components/app/modules/` (14 `*Module.tsx` + `ProjectSettings.tsx`).
- **Per-module target**: exactly 5 ideas. Each subagent read its module + direct imports (and siblings/shared libs) to avoid proposing already-implemented features.
- **Method**: 15 parallel `general-purpose` subagents, 2 waves (8 + 7); orchestrator read only terse replies during scanning. ~125 file reads total across subagents.
- **Verification**: `> Total:` header sum (75) = `## N.` idea-heading count (75) = 15 modules × 5. ✓
- **Date**: 2026-06-18.
