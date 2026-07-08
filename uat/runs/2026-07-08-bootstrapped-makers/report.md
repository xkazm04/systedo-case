# Simulated UAT — Bootstrapped-maker cohort · scorecard

**Run:** `2026-07-08-bootstrapped-makers` · **Date:** 2026-07-08/09
**Cohort:** 8 new Characters — indie makers / tiny-business owners promoting their own product on a near-zero budget, chasing cheap organic visibility, judged on **ease-of-use + UX clarity** (not analytical depth).
**Levels:** L1 theoretical (8 agents, mass-parallel, code-grounded) → L2 empirical (live browser, isolated worktree). See `L2-VERIFICATION.md` for the L2 ceiling (live AI-output **quality** unjudged — BM-L2-01).

## Characters × journeys — cert level reached
| Character (type) | Journey | L1 verdict | Grounding | Time-saved (if it all worked) | L2 |
|---|---|---|---|---|---|
| Vojta — indie SaaS (app) | get-found-organically | L1-conditional | 2/5 | ~90 min · med | structural ✓ |
| Vojta | launch-from-zero | **L1-pass** | 3/5 | ~60 min · low-med | structural ✓ |
| Standa — pre-launch (app) | launch-from-zero | L1-conditional | creation 6/7 · data-probe 0/4 | ~4 h · med | structural ✓ |
| Standa | get-found-organically | **L1-pass** | 8.5/10 | ~3.5 h · med-high | structural ✓ |
| Ilona — handmade (eshop) | week-of-promo-fast | **L1-pass** | social 5/5 · creative 0/1 | 2 h → ~15-20 min · high | structural ✓ |
| Ilona | get-found-organically | L1-conditional | keyword 1/2 | ~half-day → 20-30 min · med | structural ✓ |
| Nikol — dropshipper (eshop) | week-of-promo-fast | **L1-pass** | 3/4 | ~2 clicks · high | structural ✓ |
| Nikol | launch-from-zero | L1-conditional | creation graceful · data unverified | ~2 clicks · high | structural ✓ |
| Dominik — creator (content) | get-found-organically | L1-conditional | 9/13 | ~30-45 min · med-high | structural ✓ |
| Dominik | week-of-promo-fast | L1-conditional | Distribuce 1/5 · Social 4/5 | +ve via Social, −ve via Distribuce | structural ✓ |
| Pavla — SEO blogger (content) | get-found-organically | L1-conditional | spine strong · data ~1/4 | ~2 h/article · med | structural ✓ |
| Alena — local service (local) | own-my-local-map | L1-conditional | 7/9 | high · med | structural ✓ |
| Alena | week-of-promo-fast | **L1-fail** | 2/3, core copy absent | none/negative · high | structural ✓ |
| Radek — consultant (leadgen) | cheap-inbound-leads | **L1-pass** | 4.5/5 | 15-20→2-3 min/lead · high | structural ✓ |
| Radek | get-found-organically | L1-conditional | 3/5 | modest · med | structural ✓ |

**Tally:** 5 L1-pass · 9 L1-conditional · 1 L1-fail. No journey earned live AI-quality L2 (env ceiling).

## Findings ranked by IMPACT (frequency × reachability × trust-erosion)
Full records + evidence in `findings.json`. Rank = product of low/med/high (1/2/3).

### Blockers / rank 27
1. **BM-L1-01** — Brief → article-draft chain never receives product/voice/positioning → **generic drafts**. Hits Vojta, Dominik, Standa, Pavla. `brief.ts:29`, `article-draft.ts:33` (contrast `social.ts:20` which DOES take brand). *The single most cross-cutting gap.*
2. **BM-L1-02** — Produktová kreativa hardcodes a **baby-gear audience + mionelo.cz** into AI copy regardless of catalog; also a PMax/RSA jargon tool. `CatalogModule.tsx:203`.
3. **BM-L1-03** — Obsahový engine cluster/decay tables are **hardcoded baby-magazine sample** (logic real, data fiction; labeled "Ukázková data"). `content-engine/sample.ts:30`.
4. **BM-L1-04** *(blocker)* — Distribuce "one article → variants" sends the **headline only, no body**; source hardcoded to baby-sleep. `DistributionModule.tsx:351`, `repurpose.ts:41`.
5. **BM-L1-08** — Keyless keyword generator is **e-commerce-shaped with zero locality** for a service business; the strong Lokální-dominance view has no bridge to content. `keywords/sample.ts:12`.
6. **BM-L2-01** *(L2)* — Offline (`LOCAL_DB`) mode **fails every AI generation** on missing Google ADC and silently shows the template. `usage.ts:38`, `route.ts:268`.

### Major / rank 18
7. **BM-L1-05** — Data-hungry modules **fabricate scaled sample data** for zero-traffic projects instead of a teaching empty state; **Výkon carries no sample-data label**.
8. **BM-L1-06** — Obsah — plán generates GBP **titles only, no post copy** → week-of-promo L1-**fails** for local.
9. **BM-L1-07** — Lokální reputation panel **hardcoded AC/electrical on a dental clinic**; map lists fictional non-local competitors.
10. **BM-L1-09** — Přehled first-run greets a non-marketer with **unexplained PNO/ROAS** and no first-action CTA.
11. **BM-L2-REC-01** — **"Mionelo" identity split** (nuts vs baby across surfaces).
12. **BM-L2-REC-02** — **Sample-data labeling inconsistent** (Výkon unlabeled).

### Minor / polish (rank 6–12)
BM-L1-10 (CPC to organic), BM-L1-11 (cluster ranking not winnability-aware), BM-L1-12 (lead-quality paid-first framing), BM-L1-13 (lead-reply omits catalog), BM-L1-14 (keyword not catalog-grounded), BM-L1-15 (keyless demo brand leak), BM-L1-16 (portfolio first-run).

## What passed (strengths worth protecting)
- **BM-L1-S01 / Compare & SEO** — opportunity ranking (volume × intent × SERP-gap ÷ difficulty), budget-free, catalog-grounded queries, no CPC on the surface. *Vojta's #1 job, served well.*
- **BM-L1-S02 → BM-L2-S01 / WeekPlanner "Plán týdne"** — true one-click on-brand batch; brand context auto-derived from catalog+perf+competitors, shown as "Píše na značku"; no ad account, usable without sign-in. **Live-confirmed grounding inputs.**
- **BM-L1-S03 / Keyword opportunity score** — competition/intent-aware, plain 0-100 "Příležitost".
- **BM-L1-S04 / Content-engine cluster+decay** — genuinely computed prioritization (machinery is senior-grade; only the data is sample).
- **BM-L1-S05/S06 / gap→brief→draft flow + penalty-conscious drafts** — one flow, zero paid push, real E-E-A-T scorecard.
- **BM-L1-S07/S08 / Lead-reply grounded in real enquiry + real CRM lead-quality** handling unpaid/organic.
- **BM-L1-S09 / Recenze inbox** grounded approve-and-send replies + concrete service×location gaps.
- **BM-L1-S10 / Knihovna vzorů** = the model teaching empty state; creation modules work from zero.

## Honest ceilings (what still can't be done after fixes)
- **Live AI-output quality unjudged this run** (BM-L2-01) — draft/reply/caption prose + creative images were never generated live; input-grounding is verified, output-quality is not.
- **Grounding data is seeded, not real** — even where machinery is excellent (Compare, content-engine, lead-quality), the numbers are per-project scaled samples until connectors (Ads / Search Console / CMS / GBP) are wired. Honestly labeled on most surfaces (except Výkon).
- **Locality is a whole-funnel gap** for service businesses — even after a keyword fix, there's no local-intent class in clustering and no local-gap → content bridge.
