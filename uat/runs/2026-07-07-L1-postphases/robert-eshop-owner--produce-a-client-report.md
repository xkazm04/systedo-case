# L1 Simulated-UAT — Robert (e-shop owner) · produce-a-client-report

- **Level:** L1 (theoretical, code-grounded, no browser)
- **Character:** Robert — owner/operator of an e-shop, profit-first, allergic to ROAS-as-profit
- **Project type / demo:** `eshop` (demo-eshop)
- **Date:** 2026-07-07 (post six-phase ship)
- **Verdict:** **L1-conditional**
- **Grounding (monthly-recap surface):** **3 / 5**
- **Est. time-saved if it all worked:** ~1–2 h per report on narrative + KPI assembly; **not** his half-day/week profit reconciliation.

---

## A. Robert's review (first person)

Fajn, konečně report, co si vygeneruju sám a nevypadá jak z generátoru zdarma. Otevřu Měsíční report, naskočí mi dlaždice — Obrat, ROAS, PNO, Konverze, Náklady, Návštěvy — a jedním tlačítkem mi AI napíše souhrn: headline, co se daří, na co pozor, a priority na příští měsíc. Vezmu Tisk/PDF nebo stáhnu .md a mám to. To je rychlý, to uznávám. A pod dlaždicema je poctivá poznámka, že data jsou ilustrativní a že si model nesmí nic vymýšlet — to oceňuju, protože přesně tomuhle u marketingových nástrojů nevěřím.

Ale teď to důležitý: **kde je můj zisk?** Celej report stojí na ROAS a PNO. To je přesně ta vanity metrika, kterou nesnáším — ROAS mi neplatí dodavatele. Nikde marže po COGS, nikde POAS, přestože v appce modul Zisk existuje. Do reportu, co bych dal partnerovi nebo bance, se to nedostane. A druhá věc — nahrál jsem si v Brandingu logo, appka slíbila „zobrazí se v hlavičce klientských reportů", a v samotném reportu žádné logo není, jen napsaný název. Takže bych to klientovi takhle **nebankoval** — je to hezký marketingový přehled, ne finanční report. Rychlejší než můj excel na tu narativní část? Ano. Nahrazuje mi to půl dne sesouhlasování marketingu, P&L a skladu? Ne, protože zisk, LTV ani sklad tam nejsou.

---

## B. Reachable surface set (eshop gating) — computed before judging

From `src/lib/projects/modules.ts` `availableFor` including `eshop`. Report-relevant surfaces:

| Surface | Module key | Reachable for eshop? | Evidence |
|---|---|---|---|
| Monthly report (Phase 5) | `mesicni-report` | ✅ `ALL` | modules.ts:342 |
| Reports (shared links mgmt) | `reporty` | ✅ `ALL` | modules.ts:170 |
| Branding (Phase 2) | `branding` | ✅ `ALL` | modules.ts:322 |
| Usage / spend (Phase 1) | `spotreba` | ✅ `ALL` | modules.ts:332 |
| Shared microsite `/report/[token]` | via `kampane` | ✅ `["eshop",...]` | modules.ts:90 (share created in Campaigns) |
| Profit (POAS) | `zisk` | ✅ `["eshop"]` | modules.ts:180 — but **not wired into any report** |

Not reachable for eshop (none report-relevant): pobocky, recenze, obsah-plan, experimenty-lp, srovnani-seo, kvalita-leadu, rychla-reakce, lokalni, mapa, distribuce, publikum.

---

## C. Surface model — the monthly-recap path (Phase 5 headline)

1. **Affordance:** "Vygenerovat souhrn" button — `MonthlyReport.tsx:139-147` → `run({ period })`.
2. **Hook:** `useAiTool<MonthlyRecapResult>("monthly-recap", period)` — `MonthlyReport.tsx:48`. Injects the active project id into the request body (`contextProjectId`, `useAiTool.ts:107` + `:187`).
3. **Route:** `case "monthly-recap"` — `route.ts:199-209`. `resolveGrounding(projectId, userId)` (`route.ts:118-130`) resolves demo-eshop → `getProjectDataset(demo)` + `businessType = "e-shop (e-commerce)"` (BUSINESS_TYPE map `route.ts:105-111`). Cache keyed by effective project (`keyId`) so an unowned id degrades to base — tenancy holds.
4. **Generator:** `generateMonthlyRecap(req, locale, signal, data, businessType)` — `monthly-recap.ts:134-159`. Builds snapshot from the project's own dataset (`buildSnapshot(req.period,"previous",data)`), prompt frames to business type (`buildRecapPrompt`, :28-42), low temp 0.4, `validate`/`normalize` guard hollow output.
5. **KPI tiles:** grounded server-side on the same `getProjectDataset(project)` snapshot — `mesicni-report/page.tsx:14-38`, rendered `MonthlyReport.tsx:115-131`.

**Grounding N/M for monthly-recap = 3/5.** Sources per rubric {their data, brand, costs, competitors, history}:
- data ✅ (getProjectDataset → snapshot: revenue/cost/conversions/visits)
- brand ✅ (business-type framing + `client.name` in snapshot)
- history ✅ (period-over-period delta vs "previous")
- costs ⚠️ **partial** — ad *spend* only; no COGS/margin (Robert's #1) anywhere in the dataset (`dataset.ts:25-54` has no cost-of-goods field)
- competitors ❌ absent

---

## D. Findings

| id | type | dimension | severity | impact (freq/reach/trust) | title | expected | got | evidence | code_check | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| R1 | quality-gap | Senior-quality / Trust | **major** | high / high / high | Report is ROAS/PNO-centric — no profit-after-COGS for a profit-first owner | Profit after real costs (COGS/overhead), honest on thin margin | KPI tiles = revenue, roas, pno, conversions, cost, visits; recap system prompt frames eshop as "obratu, PNO a ROAS". No margin/POAS. `/zisk` exists but isn't in the report. | `report/compute.ts:17-24`; `monthly-recap.ts:23`; modules.ts:180 (zisk separate) | confirmed-absent | **confirmed** |
| R2 | broken-flow | Missing pieces / Trust | **major** | high / high / med | Uploaded brand logo never reaches any client-facing report (Phase 2 half-wired) | Logo shows in client report header (module's own promise) | `logoUrl` consumed only by BrandingModule's live preview + persist/store. MonthlyReport header renders `<h2>{projectName}</h2>` only; `/report/[token]` never renders it; `SharedReport` has no `logoUrl` field and `createSharedReport` never captures it. | logoUrl grep: only BrandingModule.tsx, api/projects, store, types; `MonthlyReport.tsx:89`; `ReportView`/`report/[token]/page.tsx` (none); `shared-report.ts:23-41,68-99` | confirmed-absent (in reports) | **confirmed** |
| R3 | trust | Trust / Clarity | **major** | med / high / high | Client-facing shared microsite still leaks internal AI chrome (T3 unresolved on this surface) | A white-label client report shows no vendor/model/cost/prompt | `/report/[token]` renders `ReportView` → `ResultMeta` (model badge, token-count + "~$0.xxxx" / "předplatné · 0 $" pill) and `PromptDisclosure` ("Zobrazit prompt poslaný modelu" + copy) | `report/[token]/page.tsx:133`; `ReportView.tsx:105` (ResultMeta) + `:214` (PromptDisclosure); `primitives.tsx:262,283-301,374-400` | present-broken | **confirmed** |
| R4 | trust | Trust | **minor** | low / high / med | Demo-mode recap injects vendor sentence into the client report body | Client report copy is vendor-neutral | `demoRecap` summary ends "Ukázkový výstup — připojte LLM (Claude Code v devu, Gemini v produkci)…"; MonthlyReport renders `r.summary` verbatim with no demo badge → leaks into print/.md when no API key | `monthly-recap.ts:127`; `MonthlyReport.tsx:165` | confirmed-present | **confirmed** (demo-only) |
| R5 | missing-feature | Missing pieces | minor | med / high / med | Report omits LTV/cohort and inventory/seasonality Robert reconciles weekly | His weekly job spans marketing + LTV + stock | Report is a single-period performance recap; `/ltv` and `/sklad-sezonnost` exist but aren't composed into the report | modules.ts:205-215, :195-203; `report/compute.ts:17-24` | by-design (scope) | uncertain |
| R6 | — | Trust | resolved (ceiling: minor) | — | Monthly report discloses illustrative/seed data + "AI only gets real numbers" | Scaled seed numbers not passed off as proof unqualified | Note rendered under KPI tiles | `MonthlyReport.tsx:133` (T note :20/:29) | present | **resolved** |
| R7 | — | Clarity/Trust | resolved (ceiling: minor) | — | New monthly-recap surface is clean of internal AI chrome (T3 fixed *here*) | No model/cost/show-prompt on the recap | MonthlyReport uses none of ResultMeta/PromptDisclosure | `MonthlyReport.tsx` (no primitives import) | present | **resolved (this surface only)** |
| R8 | — | Trust | resolved | — | T1 "hardcoded Mionelo in prompts" not in this path | Recap grounded on caller's own project, not a fixed identity | Snapshot built from `getProjectDataset`; name = project.name | `monthly-recap.ts:143`; `dataset.ts:48-54`; route.ts:124-127 | present | **resolved (this path)** |

---

## E. Journey verdict

**L1-conditional.**

Robert *can* complete the job — generate a grounded, business-type-framed monthly recap, see project-real KPI tiles, and print/export it — and the new surface is clean, honest about illustrative data, and per-project grounded (real wins over the prior run). But it is **not** the report a profit-first e-shop owner would hand out or bank: no profit-after-COGS (R1), the brand logo he uploaded never appears on any report (R2), and the older shared client microsite still exposes model/cost/prompt chrome (R3). Completable, not senior-grade for *his* job → conditional.

---

## F. Phase-fix status

**Confirmed landed & reachable**
- Phase 5 monthly-recap op — landed, eshop-reachable, grounded on the project's own dataset + business-type framing, clean of internal chrome, hollow-output guarded (R7, R8).
- Phase 1 spend attribution — `useAiTool` injects projectId on every call (`useAiTool.ts:107,187`); Usage module reachable (`spotreba`, ALL).
- Reachability of `mesicni-report` + `branding` for eshop — confirmed (`ALL`).
- Numbers now follow the project (getProjectDataset) with an illustrative-data disclosure (R6).

**Landed but not unblocking the job (fix-landed ≠ fix-reachable-outcome)**
- Phase 2 branding logo — upload/persist works and is reachable, but **no actual report surface renders `logoUrl`** (R2). Only the Branding module's own preview shows it.

**Still broken on this journey**
- T3 — client-facing `/report/[token]` microsite still leaks internal AI chrome (R3). Fixed on the *new* monthly-report surface, unresolved on the *shared* one.
- R1 — profit/margin absent from the report; ROAS/PNO presented as the story (Robert's core pet peeve).
- R4 — demo-mode vendor sentence bleeds into the client report body.
