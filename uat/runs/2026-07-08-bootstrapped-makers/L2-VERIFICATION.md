# L2 — Empirical verification (live browser) · bootstrapped-makers run

- **Date:** 2026-07-08/09
- **Server:** isolated git worktree `../systedo-uat-l2`, `DEV_AUTH=true LOCAL_DB=true next dev -p 3100` (own dev-lock so it didn't disturb the concurrent agent's server on :3000).
- **Driver:** `uat/driver/drive.mjs` (static) + `drive-ai.mjs` (AI). Screenshots/ARIA/text in `shots/`.

## ⚠️ Run ceiling — live AI-output QUALITY could not be judged this pass
The documented offline path (`LOCAL_DB=true`) does **not** cover AI usage metering: `src/lib/usage.ts` (`getUserPlan`/quota) calls `firestore.collection("usage").doc(userId).get()` **unconditionally**. With no Google ADC in the isolated worktree, every AI generation throws at `src/app/api/ai/route.ts:268` (`[ai] generation failed (mode=lead-reply): Could not load the default credentials`) and the UI **silently keeps its non-AI template** (the reply textbox was byte-identical after a 28 s wait). See finding **BM-L2-01**.

Consequence: this L2 confirmed **structure, surfaces, reachability, and grounding INPUTS** empirically, but **not** the live prose/image quality of drafts, replies, or captions. Those AI-quality findings (BM-L1-01 generic drafts, BM-L1-04 headline-only repurpose, BM-L1-02 audience hardcode, and the reply/caption strengths) remain **L1 code-confirmed, L2-quality-pending**. To finish that slice: on a server with Google ADC (`gcloud auth application-default login`, or the main dev server which already has creds + a `DEV_AUTH` toggle), re-run `drive-ai.mjs` against the generate buttons. Two-constraint trap worth noting: the main server has creds but is login-gated (no `DEV_AUTH`); the offline server has `DEV_AUTH` but no creds.

## Empirically CONFIRMED live (static sweep, no AI needed)
| Finding | Surface | What the live UI showed |
|---|---|---|
| **BM-L1-16** portfolio first-run | `/app/demo-eshop` | Overview leads with "Přehled portfolia · napříč 5 projekty · obrat 12,8 mil. Kč · ROAS 6,0×" + a 5-project comparison table — a single-shop maker greeted by a portfolio dashboard. |
| **BM-L1-09** jargon first-run | `/app/demo-eshop` | Tiles/table headline ROAS / PNO with no plain-language gloss. |
| **BM-L1-05 / BM-L2-REC-02** Výkon fabricated, unlabeled | `/app/demo-eshop/vykon` | Full fabricated numbers (297 587 visits, 13,5 mil. Kč, ROAS 5,9×, month-goal projection) with **no** "Ukázková data" banner — while 6 other modules carry it. |
| **BM-L1-10** CPC to organic | `/app/demo-eshop/klicova-slova` | Empty state advertises "hledaností, konkurencí a **CPC**" + "Google Ads Keyword Planner". |
| **BM-L1-03** baby clusters + label | `/app/demo-content/obsahovy-engine` | "Ukázková data" + baby clusters (příkrmy, kojení, spánek miminka) on a generic "Magazín" project. |
| **BM-L1-04** hardcoded distribution source | `/app/demo-content/distribuce` | Source article hardcoded "Spánek miminka: kompletní průvodce" (baby-sleep), "Ukázková data". |
| **BM-L1-07** map placeholder competitors | `/app/demo-local/mapa` | Map pack names Atelier Vega / Centrum Nova / Studio Alfa / Klinika Prima — fictional, non-dental. "UKÁZKOVÁ POZICE". |
| **BM-L1-07** AC-on-dental reputation leak | `/app/demo-local/lokalni` | Coverage matrix is correctly dental, but the page also leaks AC/electrical terms (klimatizace/montáž/servis) in the reputation panel — mixed grounding on one page. |
| **BM-L1-06** GBP titles only | `/app/demo-local/obsah-plan` | "Náměty" are titles ("Časté dotazy: Dentální hygiena", "Novinka v Ostrava: Zubní pohotovost") with Naplánovat — no post copy. Titles ARE catalog-grounded. |
| **BM-L2-REC-01** Mionelo identity split | eshop social vs product-creative | Social brand-context = nuts ("Ořechy, Semínka … 100% natural"); product-creative hardcodes baby-gear audience + mionelo.cz. |
| **BM-L1-S02 → BM-L2-S01** WeekPlanner grounding (STRENGTH) | `/app/demo-eshop/socialni` | "Plán týdne" shows "**Píše na značku** · Značka: Mionelo. Sortiment: … (9 položek, 129–389 CZK) … Čím se liší: 100% natural…" — real, rich catalog-derived brand context; usable without sign-in. |
| **BM-L1-S07** grounded enquiry inputs (STRENGTH) | `/app/demo-leadgen/rychla-reakce` | Real specific enquiries ("revizi elektroinstalace v kanceláři (cca 200 m²)"); response metrics show an **honest** empty state ("MEDIÁN REAKCE — zatím bez odeslání") — a positive contrast to Výkon. |

## Reconciliation sweep (cross-surface shared concepts)
1. **Project identity** — Mionelo is nuts in catalog/social, baby in product-creative (BM-L2-REC-01). Dentalis is dental in catalog/coverage/GBP/reviews, AC/electrical in the Lokální reputation panel (BM-L1-07). A load-bearing "who is this business" concept is defined in ≥2 unreconciled places.
2. **Sample-data honesty** — the "Ukázková data / ilustrativní … Seam" banner is consistent on 6 modules but missing on Výkon, the most numeric surface (BM-L2-REC-02).
3. **Hardcoded parenting niche** — the same baby content seeds content-engine clusters AND the distribution source across unrelated projects (BM-L1-03/04).
4. **Paid framing on organic** — CPC / Keyword-Planner / "Optimalizovat bidding" recur across keyword + lead surfaces for zero-budget users (BM-L1-10/12).

## Refuted / softened at L2
- **Lokální dominance "vague score"** (Alena's fear) — refuted: the coverage matrix is concrete service×location gaps, correctly dental-grounded (BM-L1-S09 holds).
- **"Empty states dead-end"** (Standa) — partially refuted: Knihovna vzorů teaches, and Rychlá reakce/Recenze show honest empty states; the real issue is the opposite — Výkon/LTV *fabricate* rather than dead-end (BM-L1-05).
