# L1 Simulated-UAT — Lucia (agency owner) — produce-a-client-report

- **Level:** L1 (theoretical, code-grounded, no browser)
- **Date:** 2026-07-07
- **Character:** Lucia — agency owner, white-labels reports to paying clients; cares about client-safe, on-brand output and margin.
- **Journey:** Produce a branded, always-current client report / microsite my client understands, with near-zero manual assembly.
- **Verdict:** **FAIL (blocked)** — the T3 "client-safe" blocker is **still open** on both public surfaces.

---

## 1. Lucia's review (first person)

Je pátek, potřebuju z toho dostat klientský report a nechci u toho strávit odpoledne. Napřed to dobré: v **Brandingu** si konečně nahraju vlastní logo (ne jen URL), vyberu akcent a hned vidím **náhled hlavičky reportu** s mým logem a barvou. A co je zásadní — branding se ukládá **na projekt**, ne do jednoho globálního nastavení, takže se mi klient A a klient B už nemíchají. To je přesně to, co jsem posledně reklamovala. Spotřebu AI vidím **po projektu** — konečně poznám, kolik mě který klient stojí. Měsíční report má KPI dlaždice z reálných čísel a AI narativ, který si nevymýšlí metriky. Solidní základ.

Jenže pak ten report reálně otevřu očima klienta — a couvnu.

**Sdílený report na veřejném odkazu (`/report/[token]`)** klientovi ukazuje interní AI omáčku, kterou nikdo mimo agenturu vidět nemá: **pill s názvem modelu** (např. „claude-sonnet…"), **pill s cenou v dolarech** („~$0.0123") a rozklikávací box **„Zobrazit prompt poslaný modelu"** — i s tlačítkem zkopírovat celý můj vyladěný prompt. To je katastrofa. Klient nemá vědět, jaký model to psal, kolik mě to stálo (přesně to, na čem stavím marži), ani jak zní můj prompt. A nemám žádný přepínač, jak to vypnout — je to natvrdo v komponentě.

**Microsite (`/m/[slug]`)** je druhá mina. Je **veřejně indexovatelná** (`index:true`), má strukturovaná data (JSON-LD Dataset s konkrétními čísly) — a čísla jsou **naškálovaná demo data** odvozená ze slugu, prezentovaná jako „vždy aktuální důkaz výsledků". Bez jediné poznámky, že jde o ilustrativní data. Kdyby si to klient (nebo jeho konkurent přes Google) našel, publikuju smyšlené výsledky pod jménem klienta jako fakt. To si jako agentura nemůžu dovolit.

A do třetice: to **logo, co jsem nahrála, se na klientský report ani na microsite vůbec nedostane.** Náhled mi ho ukazuje, uloží se — ale sdílený report i microsite vykreslí jen **textový název značky a barevný proužek**, žádné logo. Takže marketingová hlavní funkce „white-label s logem" končí v náhledu.

Závěr: výstup **nemůžu předat platícímu klientovi bez ruční očisty** — a u veřejného odkazu ho ani ručně očistit nejde. T3 zůstává otevřené.

---

## 2. Surface model & grounding

**Report / branding / client-facing path (file:line):**

| Surface | Reachability (L1) | File |
|---|---|---|
| Branding module (logo upload + preview, per-project persist) | Reachable | `src/components/app/modules/BrandingModule.tsx:100`, `:125`, `:234-239`; `src/app/app/[projectId]/branding/page.tsx:12-18` |
| Monthly report module (Phase 5) | Reachable | `src/components/app/modules/MonthlyReport.tsx`; tool `src/lib/ai/tools/monthly-recap.ts` |
| Usage / spend (Phase 1) | Reachable | `src/app/app/[projectId]/spotreba/page.tsx`; `src/lib/spend/aggregate.ts:18` |
| Shared report (client-facing) | **Needs a generated token** (create via Campaigns "Sdílet report" → `createSharedReport`). Code path clear; live open deferred to L2 | `src/app/report/[token]/page.tsx:133`; `src/lib/campaigns/shared-report.ts:68` |
| Microsite (client-facing, indexed) | **Reachable zero-setup** via demo slug `/m/mionelo` (`DEMO_MICROSITE`) | `src/app/m/[slug]/page.tsx`; `src/lib/microsite.ts:37`, `:134` |

**Grounding score for the report (Phase 5 monthly-recap): 5/5 claims grounded.**
- KPI tiles read `snap.current` from the real snapshot (`MonthlyReport.tsx:117`). ✓
- AI narrative is fed the same snapshot; system prompt forbids inventing metrics (`monthly-recap.ts:19-26`, `:143-147`). ✓
- `validateRecap`/`normalizeRecap` reject hollow output (`monthly-recap.ts:66-100`). ✓
- Explicit in-UI disclaimer that AI only receives real numbers (`MonthlyReport.tsx:133`, note copy `:20`/`:29`). ✓
- Metric-neutral framing fits non-eshop project types (`monthly-recap.ts:23`). ✓

(Grounding is a strength of the *module*; the failure is client-safety of the *published surfaces*, not fabrication by the AI.)

---

## 3. Findings

| # | Title | Severity | Type | Impact | Ceiling (best case if fixed) | Evidence | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **T3 STILL OPEN — internal AI chrome leaks onto the public shared report** (model-name pill, USD cost pill, "show prompt" box) | **blocker** | trust | Client sees which model wrote it, what it cost the agency (margin exposure), and can one-click copy the agency's engineered prompt. No client-safe flag exists. | Clean white-label report she can hand over untouched | `ReportView.tsx:105` (`<ResultMeta>`) → model pill `primitives.tsx:262`, cost pill `primitives.tsx:283-301`; `ReportView.tsx:214` (`<PromptDisclosure>`) → `primitives.tsx:374`, copy-prompt `:387`. Rendered on public page `report/[token]/page.tsx:133`. No `clientSafe`/hide prop on `ReportView` (grep: none). | **confirmed** |
| 2 | **T3 STILL OPEN — scaled seed/demo numbers published as SEO-indexed "always-current proof" with no disclaimer** | **blocker** | trust | Microsite is `index:true` with JSON-LD `Dataset` of concrete numbers that are deterministically *scaled demo data*, presented as real client results. Reputational/legal landmine for an agency. | Real (or clearly-labeled illustrative) data on an indexed proof page | `microsite.ts:134-135` `scaledDataset(seedScale(slug))`; header comment `microsite.ts:1-12`; `m/[slug]/page.tsx:56` `index:true`, JSON-LD numbers `:91-96`; **no disclaimer** anywhere on page (contrast `MonthlyReport.tsx:133` which *does* disclaim). | **confirmed** |
| 3 | **Uploaded logo never renders on any client-facing surface** — persisted + previewed only | **major** | broken-flow / quality-gap | The marquee white-label feature (logo) shows in the Branding preview and is stored, but neither the shared report nor the microsite ever draws it — only brand *name* text + accent bar. The preview over-promises. | Agency logo actually in the report/microsite header | Upload+preview `BrandingModule.tsx:234-239`; persist `:125`; field `types.ts:167` (comment claims "shown on client-facing reports"). `logoUrl` grep: appears ONLY in module/projects-store/types — **not** in `report/[token]/page.tsx`, `m/[slug]/page.tsx`, `ReportView.tsx`, `microsite.ts`, or `shared-report.ts`. | **confirmed** |
| 4 | Monthly-report module (`mesicni-report`) print/PDF export is itself unbranded (no logo, no accent) | major | quality-gap | If Lucia prints/PDFs the Monthly report for a client, it carries generic app styling, not her brand. It's positioned as "client-ready recap" (`modules.ts:343`) but isn't white-labeled. | Branded print output | `MonthlyReport.tsx:84-212` — renders `projectName` heading only; no accent/logo; internal "Souhrn od AI" section + AI-disclaimer note print through (`:133`, `:138`). | confirmed |
| 5 | Shared report `/report/[token]` also has no "illustrative data" disclaimer | minor | trust | Lower risk than the microsite (noindex + `robots:index:false` `report/[token]/page.tsx:57`, token-gated, 30-day TTL), but still snapshots demo campaigns as client numbers. | Disclaimer or real data | `shared-report.ts:92` `listCampaigns(tenant)` (sample in demo); page `report/[token]/page.tsx` has no note. | uncertain (data provenance depends on connected Ads source) |

### Fixes CONFIRMED landed (prior-run regressions closed)
- ✅ **Branding is now truly per-project.** Persisted on the Project doc via `PATCH /api/projects/{id}` (`BrandingModule.tsx:122-125`); `logoUrl`/`accentColor` are per-project fields (`types.ts:164-167`, `ProjectPatch` `:191`) written to both stores (`store.firestore.ts`, `store.local.ts`). The prior single-global-localStorage-key leak across projects is **fixed**.
- ✅ **Brand name white-label (no vendor leak).** Shared report never falls back to the vendor name — uses captured `brandName` → client `accountName` → "Report" (`shared-report.ts:88`, `report/[token]/page.tsx:80`). Accent renders on both surfaces (`report/[token]/page.tsx:95`, `m/[slug]/page.tsx:111`). Jargon glossed (ROAS/PNO one-liners `report/[token]/page.tsx:83-88`).
- ✅ **Phase 1 per-project spend visible.** `useAiTool.ts:107,187` injects `contextProjectId` into every AI call; telemetry filtered by project `spend/aggregate.ts:18`; `/spotreba` renders per-project cost/tokens with live→seed fallback. Lucia *can* see per-client AI cost.
- ✅ **Phase 5 report grounding** strong (see §2).

---

## 4. Acceptance dimensions

| Dimension | Verdict | Note |
|---|---|---|
| Completion | ⚠️ Partial | She can generate a report/microsite, but not a *client-safe* one. |
| Effort | ✅ Low (to generate) / ❌ High (to clean up) | Generation is near-one-click; but the shared link can't be cleaned at all. |
| Clarity | ✅ | KPIs + narrative are client-legible; jargon glossed. |
| Trust | ❌ **Blocker** | Model/cost/prompt leak (F1) + fabricated indexed "proof" (F2). |
| Missing pieces | ❌ | Logo on client surfaces (F3); client-safe toggle; disclaimer on demo data. |
| Time-saved (designed) | ⚠️ | The auto-KPI + AI-narrative + always-current microsite *would* eliminate the ~1–2 hr manual build — but client-safety failures force manual rework (and on the shared link, rework is impossible). Net benefit is real only after F1–F3 are fixed. |
| Senior-quality (designed) | ❌ | Lucia's best account manager would never ship a client report showing the AI model, the agency's cost, the raw prompt, or scaled demo numbers as "proof". Fails the senior bar. |

**Est. time-saved (designed, if client-safe):** ~60–90 min per client per report (KPI assembly + narrative + always-current page all automated). **As shipped:** not adoptable for paying clients — the blocking client-safety issues cancel the win.

---

## 5. Phase-fix status

- **T3 (client-facing surfaces are client-safe): STILL OPEN.**
  - Shared report `/report/[token]`: model pill + USD cost pill + "show prompt" box all render (F1). **Open.**
  - Microsite `/m/[slug]`: scaled seed numbers published as indexed proof, no disclaimer (F2). **Open.** (No AI chrome on the microsite itself — that part is clean.)
- **Branding now per-project: FIXED.** Persisted on the Project (`types.ts:167`, `BrandingModule.tsx:125`); global-localStorage leak gone.
- **Logo on client surfaces: NOT DELIVERED.** Persisted + previewed only; renders on no client-facing page (F3).
- **Phase 1 per-project spend: SHIPPED / works.**
- **Phase 5 report: grounded / works** (but the module's own print output is unbranded, F4).
