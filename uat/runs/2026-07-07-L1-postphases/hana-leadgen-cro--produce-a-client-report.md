# L1 Simulated-UAT — Hana (leadgen CRO) · Produce a client report

- **Character:** Hana — growth/CRO manager at a lead-gen / services business (power-user, quality-over-volume, speed-to-lead obsessive)
- **Journey:** produce-a-client-report
- **Project type:** `leadgen` (demo-leadgen)
- **Level:** L1 (theoretical, code-grounded, no browser)
- **Date:** 2026-07-07
- **Surface under test:** `mesicni-report` module (Monthly report) + the `monthly-recap` AI op

---

## First-person review — Hana

Je pátek, klient čeká report. Otevřu si Měsíční report v projektu typu „Leady / služby". A hned nahoře na mě vykouknou dlaždice: **Obrat**, **ROAS**, **PNO**, Konverze, Náklady, Návštěvy.

Moment. Můj klient neprodává produkty. Nemá obrat. Nemá „návratnost výdajů na reklamu" v tom smyslu, jak to čte e-shop. Přesto tu vidím „Obrat 1,2 mil. Kč" a „ROAS 5,4×". To je číslo, které si aplikace vyrobila přeškálováním e-shopové case-study — a pokud to pošlu klientovi, ztratím důvěru na první stránce. Klient ze služeb ví, že žádný obrat 1,2 milionu nemá. Já vím, že u leadgenu se řídí **CPL, počet kvalifikovaných leadů a konverzní poměr formulářů/hovorů** — a přesně tyhle dlaždice tu nejsou (nebo jsou schované pod „Konverze" bez ceny za lead).

Zajímavé je, že aplikace to jinde umí. Na přehledu projektu mám KPI **Leady / Cena za lead / Konverzní poměr / Náklady** — správně, leadgenově. Sidebar mi nabízí Kvalita leadů, Rychlá reakce. Takže systém *ví*, že jsem leadgen. Ale Měsíční report — ta jediná věc, kterou reálně předám klientovi — se vrátí zpátky do e-commerce slovníku.

AI narativ pod dlaždicemi je na tom líp: do promptu jde `Typ podnikání klienta: generování poptávek (leadgen)` a model dostane instrukci „nepředpokládej e-commerce". Jenže data, která k tomu dostane, jsou nadepsaná **„Obrat (hodnota konverzí)", „ROAS", „Průměrná hodnota objednávky"** a tabulka kanálů „obrat | podíl | PNO | ROAS". Průměrná hodnota objednávky?! U služby, která sbírá poptávky? Model je vlastně tlačen do rozporu: štítek říká leadgen, čísla křičí e-shop. Nejlepší, co z toho může vypadnout, je narativ, který se štítku drží navzdory datům — a to není grounding, to je naděje.

Co v reportu úplně chybí a bez čeho ho jako senior CRO nepodepíšu: **které zdroje leadů jsou junk**, **CPL kvalifikovaného leadu** (ne nejlevnějšího), **speed-to-lead**. To je moje práce. Report na ně mlčí a místo toho odpovídá na otázku „jaký byl obrat", kterou můj klient nikdy nepoloží.

Verdikt: report *vznikne*, vytiskne se, vyexportuje do .md — mechanicky hotovo. Ale jako leadgen report ho nepředám. Mísí mi byznys za e-shop hned v hlavičce. To je trust-blocker, ne kosmetika.

---

## Trace — shipped surfaces (file:line)

**Reachability (confirmed):**
- `mesicni-report` module `availableFor: ALL` → includes `leadgen` — `src/lib/projects/modules.ts:336-345` (`ALL` = `["eshop","app","leadgen","content","local"]`, `modules.ts:49`).
- Route guarded by `requireProjectModule(projectId, "mesicni-report")` — `src/app/app/[projectId]/mesicni-report/page.tsx:14`.
- `leadgen` project type is a first-class, lead-framed type (primaryGoal „Leady & CPL", tagline „Poptávky a hovory") — `src/lib/projects/types.ts:82-97`.

**Grounding plumbing (confirmed working):**
- `projectId` auto-injected into every AI request from the active project context — `src/components/ai/useAiTool.ts:107, 187`.
- Route resolves tenancy-checked dataset + business-type label — `src/app/api/ai/route.ts:199-208` (`case "monthly-recap"`), `resolveGrounding` `route.ts:118-130`.
- `BUSINESS_TYPE.leadgen = "generování poptávek (leadgen)"` — `src/app/api/ai/route.ts:105-111`.
- Tool receives `data` + `businessType`, frames prompt — `src/lib/ai/tools/monthly-recap.ts:134-159`, system prompt non-eshop rule `monthly-recap.ts:19-26`, prompt injects type `monthly-recap.ts:28-42`.

**The mis-framing (the core of this run):**
- **KPI tiles are hard-coded e-commerce**, not type-aware: `REPORT_TILES = revenue/roas/pno/conversions/cost/visits` — `src/lib/report/compute.ts:5, 17-24`.
- Tile labels fixed to Obrat/ROAS/PNO/… — `src/components/app/modules/MonthlyReport.tsx:38-41`, rendered `MonthlyReport.tsx:114-131`, exported to .md the same way `MonthlyReport.tsx:65-82`.
- Page pushes revenue/roas/pno into the snap regardless of type — `src/app/app/[projectId]/mesicni-report/page.tsx:22-37`.
- **The AI grounding snapshot is e-commerce-shaped**: „Obrat (hodnota konverzí)", „ROAS", „Průměrná hodnota objednávky", channel table „obrat | podíl | PNO | ROAS" — `src/lib/snapshot.ts:114-129`.
- **Data source is scaled e-shop revenue**, not lead-shaped: `getProjectDataset` → `scaledDataset` scales the base case-study `revenue`/`cost`/`conversions`/`visits` — `src/lib/project-data/dataset.ts:25-54`. There is no lead-quality / source-quality / CPL series feeding this at all.
- **Demo fallback is pure e-commerce**: headline „Měsíc s růstem/poklesem obratu", highlights about Obrat; `businessType` only appended as a trailing suffix — `src/lib/ai/tools/monthly-recap.ts:102-132`.

Contrast (the app CAN do leadgen framing elsewhere): `KPI_PRESETS.leadgen = Leady / Cena za lead / Konverzní poměr / Náklady` — `src/lib/projects/modules.ts:432-437`. This is exactly what the Monthly Report tiles are NOT.

---

## Grounding score — `monthly-recap` for leadgen: **3 / 8**

Hana's real leadgen context vs. what reaches the prompt (`snapshot.ts:99-171` + `businessType`):

| Context item Hana needs | Reaches prompt? | Evidence |
|---|---|---|
| Lead volume (as „konverze") | ✅ | snapshot.ts:116 |
| Ad spend / náklady | ✅ | snapshot.ts:115 |
| Business-type label (leadgen) | ✅ | route.ts:108, monthly-recap.ts:31 |
| CPL (cost per **qualified** lead) | ❌ | not surfaced; cost/conv derivable but unlabeled, „qualified" absent |
| Lead-source **quality** (which junk) | ❌ | channels are revenue/ROAS rows only, snapshot.ts:123-129 |
| Lead **quality** / qualified ratio | ❌ | no such series in dataset.ts |
| Speed-to-lead | ❌ | absent entirely |
| Non-revenue framing of the numbers | ❌ | data block hard-labels Obrat/ROAS/AOV, snapshot.ts:117-121 |

3 of the 8 reach — and the 3 that do are wrapped in an e-commerce data block that actively pushes against the leadgen label. Of the four things a senior leadgen CRO actually reports on (source quality, CPL, lead quality, speed-to-lead), **zero** reach the prompt.

---

## Findings

| # | Title | Severity | Type | Verdict | Evidence (file:line) | Impact | Ceiling (best case if fixed) |
|---|---|---|---|---|---|---|---|
| 1 | Monthly Report KPI tiles hard-coded to e-commerce (Obrat/ROAS/PNO/AOV) — not type-aware | **blocker** (for trust/handoff) | trust | confirmed | `src/lib/report/compute.ts:17-24`; `MonthlyReport.tsx:38-41,116-131`; `mesicni-report/page.tsx:22-37` | Leadgen client report headlines „Obrat 1,2 mil.", „ROAS 5,4×" for a business that sells nothing → Hana won't hand it off; trust dies on page 1 | Tiles driven by `KPI_PRESETS[type]` (Leady/CPL/Konv. poměr/Náklady already exist, modules.ts:432-437) → client-legible leadgen report |
| 2 | AI grounding snapshot is e-commerce-shaped; contradicts the leadgen label it's given | **major** | quality-gap / trust | confirmed | `src/lib/snapshot.ts:114-129` (Obrat / ROAS / „Průměrná hodnota objednávky" / channel „obrat…ROAS") | Narrative told „leadgen" but fed obrat/ROAS/AOV → best case it ignores data, worst case it reports revenue for a service business | Type-aware `snapshotToPromptText` (lead/CPL/CVR labels for non-eshop) → narrative genuinely leadgen-native |
| 3 | No lead-quality / CPL / source-quality / speed-to-lead grounding reaches the report | **major** | missing-feature / quality-gap | confirmed | dataset `src/lib/project-data/dataset.ts:25-54` (only revenue/cost/conv/visits); `kvalita-leadu` data never fed to report | Report answers „what was revenue" (irrelevant) and is silent on Hana's actual job (which sources are junk, CPL of qualified leads) → fails senior-quality bar | Feed lead-source quality + CPL (from the `kvalita-leadu` spine) into the recap → report a senior CRO signs |
| 4 | Demo/no-LLM recap fallback is pure e-commerce ("Měsíc s růstem obratu"); businessType only a suffix | minor | quality-gap | confirmed | `src/lib/ai/tools/monthly-recap.ts:102-132` | Dev-only (prod uses real LLM), but reveals the default framing is e-shop; any LLM-outage fallback mis-frames leadgen | Type-branched demo highlights (leads/CPL) → fallback still on-brand for leadgen |
| 5 | „Průměrná hodnota objednávky" (AOV) in the leadgen prompt is meaningless/misleading | minor | trust | confirmed | `src/lib/snapshot.ts:121` | A service business has no order value; its presence invites the model to invent commerce framing | Drop AOV/ROAS lines for non-eshop snapshots (subsumed by #2) |

Adversarial note on my own findings: I checked whether the *label* plumbing might already fix the tiles — it does not. `businessType` only reaches the AI prompt (route.ts:207), never the tiles; the tiles read `REPORT_TILES` (a static const) and a fixed `METRIC_LABEL` map, with no `project.type` in scope on the page (`page.tsx` never branches on type). So #1 is not a discoverability miss — the type-aware tiles genuinely do not exist on this surface. #2/#5 stand because the label rule in the system prompt (`monthly-recap.ts:23`) is real but is undercut by the data block it's paired with; that's a design conflict, not my misreading. #3 is scoped to the report surface — Hana *does* have a `kvalita-leadu` module elsewhere, but it does not flow into the client report, which is the journey under test.

---

## Journey verdict

**Completable but fails Trust + Senior-quality for a leadgen business — major mis-framing.**

| Dimension | Score | Note |
|---|---|---|
| Completion | ✅ Pass | Report renders, tiles populate, AI narrative generates, print + .md export work |
| Effort | ◑ OK | One click to generate; but she'd have to hand-relabel every tile and rewrite revenue lines |
| Clarity | ◑ Mixed | Layout is clean and client-legible in shape; the *metrics* are wrong for the business |
| **Trust** | ❌ **Fail** | „Obrat"/„ROAS"/„AOV" for a service business that sells nothing — trust breaks at the headline tiles |
| Missing pieces | ❌ Fail | No CPL, no lead-source quality, no speed-to-lead — the leadgen report essentials |
| Time-saved (designed) | ◑ Partial | If tiles were type-aware, strong (day/week → minutes). As shipped, hand-correction claws back much of it |
| Senior-quality (designed) | ❌ Fail | A senior CRO would reject a client report framing a lead-gen account as e-commerce |

**Does the report fit a LEADGEN business (narrative AND tiles)?** **No.** The narrative is *half* there (correct leadgen label, but fed an e-commerce data block that fights it); the **tiles are not there at all** — they are hard-coded e-shop metrics. Phase 5's per-type framing landed as a *label on the AI prompt only*; the two things a client actually reads (the KPI tiles and the numbers behind the narrative) still speak e-commerce.

**Est. time-saved:** Designed-ideal (tiles+narrative correctly leadgen-framed): ~½ day/week → minutes, strong adopt. As-shipped for leadgen: partial — the mandatory hand-relabeling of tiles and revenue lines pushes it back toward „keep my spreadsheet," which is Hana's stated abandon trigger.

**Phase-fix status:** Phase 5 goal (per-type recap framing) **partially delivered** for leadgen. Delivered: business-type label plumbed end-to-end (route → tool → prompt), module reachable for all types, system prompt has a non-eshop rule. **Not delivered:** type-aware KPI tiles (finding #1), type-aware grounding snapshot (finding #2), leadgen-native data (finding #3). The half that ships to the client (tiles + numbers) is the half still framed as e-commerce.
