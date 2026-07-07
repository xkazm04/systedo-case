# L1 Simulated-UAT — Marta (local services) · produce-a-client-report

- **Level:** L1 (theoretical, code-grounded, no browser)
- **Character:** Marta — owner of a 3-location dental & aesthetics clinic (Dentalis), Czech, NOT e-commerce
- **Journey:** produce-a-client-report (monthly report for her own local business)
- **Project type:** `local` — demo project `demo-local` "Dentalis" (`src/lib/demo/projects.ts:24`, `:41`)
- **Date:** 2026-07-07 · post-Phase-5 rework
- **Headline question:** Does the reworked Monthly Report now fit a LOCAL business — both the AI narrative AND the KPI tiles?

---

## First-person Marta review

Otevřu si "Měsíční report" u Dentalisu — chci něco, co bych mohla dát klientovi… vlastně sobě, ale jako klientovi. Nahoře je hlavička s mým logem a barvou, to je fajn, to vypadá jako moje ordinace, ne jako váš nástroj. 

Ale pak se podívám na dlaždice a zase to samé: **Obrat. ROAS. PNO.** Já jsem zubní klinika. Nemám "obrat z reklamy" ani "ROAS" — mám pacienty, co zavolají nebo napíšou. Když mi tabulka nahoře tvrdí, že mám "Obrat 640 tisíc" a "ROAS 4,2×", tak vím, že si to někdo vymyslel, protože já ta čísla nikde neúčtuju. A to je přesně ten typ reportu, co mi kdysi poslala agentura — hezké číslo, které nic neznamená. Přestanu tomu věřit dřív, než dojdu k textu.

Text ("Souhrn od AI") je o kus lepší — evidentně ví, že jsem "lokální podnik", mluví trochu jinak. Ale pořád stojí na těch samých číslech (obrat, PNO), takže i on sklouzne k e-shopové řeči, protože jiná data nedostal. A hlavně: ani slovo o tom, co mě zajímá — kde jsme v mapě, jestli nás v Žižkově lidi najdou, kolik recenzí čeká na odpověď, jestli jsme někomu nenechali poptávku vychladnout. To v reportu prostě není. 

Takže: vypadá to profesionálně, jde to vytisknout a stáhnout — ale je to report o cizím byznysu s mým logem nahoře. Klientovi bych to takhle nedala; musela bych ručně přepsat půlku dlaždic a doplnit lokální kontext, což je zrovna ta práce, kterou to mělo ušetřit.

---

## Reachable-surface set for `local` (before judging)

| Surface | Route | Reachable for `local`? | Evidence |
|---|---|---|---|
| Monthly report (headline of this run) | `/app/demo-local/mesicni-report` | **YES** — `availableFor: ALL` | `src/lib/projects/modules.ts:342` |
| Reports / white-label microsite | `/app/demo-local/reporty` | YES — `availableFor: ALL` (not deep-traced this run) | `modules.ts:170` |
| Branding (logo + accent) | `/app/demo-local/branding` | YES — `availableFor: ALL` | `modules.ts:322` |
| Overview KPI tiles (comparison point) | `/app/demo-local/` | YES; **type-aware** for local | `modules.ts:444-449` |
| demo-local "Dentalis" tenant | id `demo-local`, type `local` | YES, exists | `src/lib/demo/projects.ts:24`,`:41` |

`mesicni-report` sits in the `system` section (pinned at sidebar bottom, `modules.ts:341`) — discoverable but low in the list. Not a blocker; tagged as minor discoverability context.

---

## Surface model — the report path (affordance → handler → prompt → grounding)

1. **KPI tiles (server-rendered, no AI):** `mesicni-report/page.tsx:14-38` → `requireProjectModule` → `getProjectDataset(project)` → `buildSnapshot(period,"previous",dataset)` → hands `MonthlyReport` a `ReportSnap` whose `current` is hardcoded to `{revenue, roas, pno, conversions, cost, visits}` (`page.tsx:23-29`). Rendered by `MonthlyReport.tsx:115-131` iterating `REPORT_TILES` (`src/lib/report/compute.ts:17-24`) with labels from `METRIC_LABEL` (`MonthlyReport.tsx:38-41`).
2. **AI narrative:** button (`MonthlyReport.tsx:139-147`) → `useAiTool("monthly-recap", period).run` → POST `/api/ai` → `case "monthly-recap"` (`route.ts:199-209`) → `resolveGrounding(projectId,userId)` (`route.ts:118-130`) resolves `demo-local` → `getProjectDataset(demo)` + `businessType = BUSINESS_TYPE["local"]` → `generateMonthlyRecap(...,data,businessType)` (`route.ts:207`).
3. **Prompt build:** `monthly-recap.ts:143-158` → `buildSnapshot(period,"previous",data)` → `buildRecapPrompt(snapshotToPromptText(snapshot), businessType, refine)` (`:147`). System prompt `MONTHLY_RECAP_SYSTEM` (`:19-26`) + schema (`:44-64`) are byte-stable; the businessType line rides the user prompt (`:31`).

**`local` → Czech label:** `BUSINESS_TYPE.local = "lokální podnik / služby"` (`route.ts:110`). This label **does** reach the prompt (`monthly-recap.ts:31`). ✅ (narrative framing landed)

### Grounding score for `monthly-recap`: **2 / 7**

What Marta's local reality would need vs. what actually reaches the prompt (`snapshotToPromptText`, `src/lib/snapshot.ts:99-171`):

| Local signal she cares about | Reaches prompt? | Note |
|---|---|---|
| Enquiries / calls | ~ (as generic "Konverze") | present but labeled e-shop-style |
| Site visits | ✅ | present |
| Service × district coverage / map rank | ❌ | absent entirely |
| Reviews / reputation / GBP status | ❌ | absent entirely |
| Speed-to-lead / un-answered enquiries | ❌ | absent entirely |
| Revenue / ROAS / PNO / AOV | present but **wrong domain** | e-shop metrics fed as if hers |
| Per-channel revenue table | present but **wrong domain** | `snapshot.ts:123-129` |

The op is *technically* well-grounded (tenancy-checked, real numbers, cache-keyed by effective project — `route.ts:118-130`), but it is grounded on **scaled e-shop performance data relabeled "Dentalis"**, not on any local signal. 2/7 = visits + a conversion count are the only figures a local owner can honestly read; everything substantive she'd expect is missing, and the dominant figures are e-commerce.

---

## Findings

| id | type | dimension | severity | impact (freq/reach/trust) | title | expected | got | evidence (file:line) | code_check | verdict | ceiling |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M1 | quality-gap | Trust / Senior-quality | **major** | freq: every open · reach: 100% (`ALL`) · trust: high erosion | KPI tiles still hardcoded to e-shop metrics (Obrat/ROAS/PNO) for a local clinic | Local-framed tiles (enquiries & calls, cost per enquiry, conv. rate, visits) like the overview already does | Fixed `REPORT_TILES` = revenue/roas/pno/conversions/cost/visits; labels "Obrat/ROAS/PNO/…" | `src/lib/report/compute.ts:17-24`; `MonthlyReport.tsx:38-41`; `page.tsx:23-29` | confirmed-absent (no per-type variant; `REPORT_TILES` used in only 3 files, none type-aware) | L1-conditional at best; tiles read as another business |
| M2 | trust | Trust | **major** | freq: every open · reach: 100% · trust: high | "Obrat"/"ROAS" tile values are fabricated e-shop revenue relabeled as the clinic | No revenue/ROAS shown, or only metrics she can reconcile | `getProjectDataset` scales the base **e-shop** dataset (Mionelo) by 0.5× and relabels the client; revenue/roas are derived from that | `dataset.ts:25-54`; `seed.ts:18` (`local:0.5`); `demo/projects.ts:24` | confirmed-absent (revenue is scaled Mionelo data, not a local figure) | violates her "no uniform/fake data" bar |
| M3 | quality-gap | Missing pieces / Senior-quality | **major** | freq: every recap · reach: 100% · trust: med-high | AI narrative type-framed but grounded on e-shop numbers only — no local context (map, reviews, GBP, speed-to-lead) | Recap that speaks to coverage gaps, reviews answered, lead response | System prompt says "for local talk enquiries/visibility, don't assume e-commerce" but the DATA block is Obrat/PNO/ROAS/AOV/channel-revenue | `monthly-recap.ts:19-26,:31`; `snapshot.ts:114-129` | present-but-missed (framing line lands; grounding data contradicts it) | narrative can't rise above the e-shop data it's handed |
| M4 | confusion | Consistency | minor | freq: per session · reach: 100% · trust: low-med | Overview is type-aware for local but Monthly Report is not | Both surfaces speak the same local language | `KPI_PRESETS.local` = "Poptávky & hovory / Cena za poptávku / …" but report tiles ignore it | `modules.ts:444-449` vs `compute.ts:17-24` | confirmed-absent (two independent tile systems) | inconsistency undermines trust |
| M5 | quality-gap | Missing pieces | minor | freq: per report · reach: 100% · trust: low | Report note claims "same data as dashboard" while dashboard (overview) shows different, local metrics | Note matches what she sees | `MonthlyReport.tsx:20` note vs local overview KPIs | present-but-missed | polish once M1 fixed |
| M6 | present (positive) | Branding | n/a | — | Logo + accent DO reach the report header (Phase 2) | Report carries her clinic's branding | `logoUrl`/`accentColor` persisted via PATCH; live header preview | `BrandingModule.tsx:82-92,232-245` | by-design (present & reachable) | — |

Adversarial check on my own findings:
- **M1/M2 skeptic:** "Maybe there's a per-type report path I missed." Refuted — `REPORT_TILES`/`ReportMetric` appear in exactly 3 files (`compute.ts`, `MonthlyReport.tsx`, one test); `page.tsx` unconditionally writes revenue/roas/pno into `current` regardless of `project.type`. No branch on type exists. Confirmed.
- **M3 skeptic:** "The businessType line might steer the model enough." Partially — it will change tone, but the model is instructed to use ONLY the provided numbers (`monthly-recap.ts:22`), and those numbers are e-shop. A senior would still see revenue/PNO leak in. Downgraded from blocker to major, kept confirmed as a grounding-substance gap, not a framing gap.
- **M6 skeptic:** confirmed positive — branding genuinely flows.

---

## Seven-dimension verdict

| Dimension | Verdict | Note |
|---|---|---|
| Completion | ✅ pass | She can open, generate, print, export .md |
| Effort | ⚠️ | Low to generate; HIGH to make it client-ready (must rewrite tiles/context by hand) |
| Clarity | ⚠️ | Tiles are clear but clearly about the wrong business |
| **Trust** | ❌ | Fabricated "Obrat/ROAS" for a dental clinic — her #1 distrust trigger |
| Missing pieces | ❌ | No map/coverage, reviews, or speed-to-lead — her whole world |
| Time-saved | ⚠️ | Narrative saves some drafting; tiles + missing local context claw it back |
| Senior-quality | ❌ | A senior local-SEO consultant would reject a "ROAS" report for a clinic |

**Journey verdict: L1-conditional (leaning fail on trust).** The report is reachable, branded, and the narrative framing landed — but the KPI tiles and the underlying grounding data are still e-commerce, which is exactly the failure Phase 5 set out to fix. Two of Marta's four scored acceptance criteria (human/local-fit, faster-than-manual) are not met for this surface.

## Grounding score
**2 / 7** local signals — plumbing is solid (tenancy-checked, real numbers, cache-correct) but the substance is scaled e-shop data relabeled "Dentalis"; zero map/review/GBP/speed-to-lead context reaches the prompt.

## Estimated time-saved
**Net slightly positive but below adoption bar.** Narrative drafting saves ~10–15 min vs. writing from scratch, but she must manually fix e-shop tiles and add the local context (coverage, reviews) the report omits — ~15–20 min of rework — so for a *local* client report it barely beats her manual way, and the trust hit means she may not send it at all.

## Phase-fix status
**LANDED-BUT-TILES-STILL-ESHOP.**
- Phase 5 narrative rework: **landed & reachable** — `monthly-recap` op exists, metric-neutral schema, businessType framing reaches the prompt (`route.ts:110,204-208`; `monthly-recap.ts:31`).
- Phase 5 for the report as a whole: **incomplete** — the KPI tiles (`REPORT_TILES`) and the snapshot data block (`snapshotToPromptText`) never got the per-type treatment the overview's `KPI_PRESETS` already has. A local dentist still sees Obrat / ROAS / PNO tiles and the AI is still fed e-shop numbers.
- Phase 2 branding: **landed & reachable** — logo + accent flow into the report header (`BrandingModule.tsx`).
