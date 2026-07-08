# UAT User-Needs Backlog — what would make Characters actually adopt

## 1. Purpose & provenance

This is the **forward-looking product backlog** distilled from the 2026-07-07 **L1 Simulated-UAT** run (`uat/runs/2026-07-07-L1-postphases/`): 7 character runs across 5 journeys, code-grounded (no browser), validating the six just-shipped phases (P1–P6). The immediate bug-fixes that run surfaced are **already shipped** — per-type report tiles, client-safe `/report/[token]` + logo on client surfaces, social de-Mionelo + project-scoped grounding, demo exposure of Spotřeba/Integrace/Účet, honest microsite disclaimer, and the POAS/contribution spine into the report. This document is the layer *underneath* those fixes: the **business needs and jobs-to-be-done** the Characters named that would move each of them from "it works, but I still can't rely on it" to "I'd pay for and hand this off." Sources: `SUMMARY.md`, `findings.json` (19 findings), and the 7 per-Character reports in the same folder; persona context from `uat/characters/*.md`.

## 1b. Shipped so far

- **A1 · Live Google Ads data as the report's source of truth** — ✅ `7450a27`. Report + AI recap run on a project's synced Ads data when present (else the scaled sample, labelled illustrative); `resolveReportDataset` seam, per-project metrics store, credential-gated sync reusing the existing OAuth/REST client. L2-verified.
- **C2 · Lead-source quality / CPQL / velocity into the grounding** — ✅ `2ba6784`. The recap for leadgen & local now grounds on junk sources, CPL/CPQL, best source and lead velocity (USER-prompt appendix; recap fingerprint unchanged).
- **A3 · Real COGS / margin / overhead → true net profit** — ✅ `76926e2`. E-shop owners enter a blended gross margin + monthly overhead + per-order cost (persisted server-side); the report's profit tile becomes "Zisk" (net after COGS+overhead), adds a net-margin tile, and POAS turns margin-aware. Without a model it keeps the labelled pre-COGS contribution + a CTA. `cost-model` store/compute/route + inline editor. L2-verified.
- **A2 · Real keyword-rank ladder as the map's source of truth** — ✅ `488e133`. The map's ranking ladder runs on imported real ranks when present (else sample, illustrative); `resolveLocalLadder` seam + `local_signals` store + tolerant CSV import route. The competitor map-pack stays honestly illustrative (map-pack rank has no clean API). L2-verified. *Follow-up: a live rank-provider / GBP-reviews connector.*

## 2. The panel's core message

Across all seven voices the sentiment was the same: **the engine is honest and the plumbing finally holds — but I still can't hand the output to a client, a boss, or a buyer without checking it myself, because the numbers are scaled case-study data rather than my live business.** They trust that the AI won't fabricate (grounding integrity scored 5/5 on the recap surface); they do *not* yet trust that what it's grounded *in* is theirs. The recurring refrain — Robert's "kde je můj zisk?", Hana's "grounding, to je naděje," Marta's "je to report o cizím byznysu s mým logem," Sofie's "grounded in someone else's numbers," Marek's "peněženku nevytáhnu" — all point at the same missing mile: **real, owned data feeding every surface, and enough verifiability to stop re-checking.**

---

## 3. Backlog items (business needs, grouped by theme)

### Theme A — Real data over demo data (the recurring ceiling)

Every project today is a single scaled e-shop case-study (`dataset.ts:25-54`, `local:0.5×` in `seed.ts:18`) relabeled per tenant. Even a perfectly type-aware surface can only ever show *scaled Mionelo*, not the user's live account. This is the ceiling named in `SUMMARY.md:79` and it caps the value of everything above it.

**A1. Connect the user's live ad accounts (Sklik / Google Ads) as the report's source of truth**
- **The need:** The monthly report (`mesicni-report`) and the AI recap must run on the user's *own* spend, conversions and revenue — not a scaled demo. Until then, no client-facing number is bankable.
- **Who:** Robert ("data jsou ilustrativní… hezký marketingový přehled, ne finanční report" — `robert-eshop-owner:17`); Hana ("číslo, které si aplikace vyrobila přeškálováním e-shopové case-study" — `hana:16`); Marta ("vím, že si to někdo vymyslel, protože já ta čísla nikde neúčtuju" — `marta-report:16`); Lucia (per-client real data). Finding `UAT-L1-14` (fabricated proof) is the same root.
- **Why it matters:** This is the single ceiling under every "I can't hand it over." It converts the product from a convincing demo into a tool of record — the precondition for trust, handoff, and retention.
- **Leverage:** **High** — unblocks all 5 report/eval personas; the most central ceiling.
- **First-cut direction:** Wire `integrace` (P3 probes already honest, `integrations/compute.ts:48-82`) to actually ingest Ads/Sklik data into `getProjectDataset`; keep the illustrative-data disclosure until a live source is connected, then swap it for the real snapshot.

**A2. Live local signals (GBP rank, reviews, map coverage) instead of the illustrative map**
- **The need:** `mapa` / `lokalni` must reflect the clinic's *real* Google Business Profile position per district, not seeded packs. Marta can't act on a map she can't trust.
- **Who:** Marta — "je to jen ukázka: nemůžu s tím nic udělat a nevím, jestli tak fakt vypadá Žižkov" (`marta-local:16`); finding `UAT-L1-18` (read-only illustrative under a "Živá mapa" header).
- **Why it matters:** Local visibility *is* her job; presentation-grade isn't decision-grade. Without real rank the whole local-SEO value prop is a mock-up.
- **Leverage:** **Med-High** — core to the entire `local` project type (Marta + future local clients).
- **First-cut direction:** GBP / SERP scraping integration behind `mapa`; until then, honest "Ukázková mapa" labelling (partially addressed) — the real unlock is the data feed.

**A3. Let the user enter (or import) real costs — COGS, margin, overhead**
- **The need:** Robert needs profit *after real costs*, and there is no field to enter COGS anywhere (`dataset.ts:25-54` has no cost-of-goods field). The POAS spine now composes into the report, but it's still computing on scaled ad-spend, not his actual margins.
- **Who:** Robert — "ROAS mi neplatí dodavatele… nikde marže po COGS" (`robert:17`); his acceptance bar is literally "no way to enter real costs/margin" as a pet peeve (`robert-eshop-owner.md`).
- **Why it matters:** A profit-first owner banks profit, not ROAS. Without cost entry the report stays a "marketing přehled," never the "finanční report" he'd give a bank or partner.
- **Leverage:** **Med-High** — central to the entire `eshop` profit story (Robert + every eshop owner).
- **First-cut direction:** Add a COGS/overhead field to the Offering/catalog spine + a manual entry (or warehouse import) so `zisk`/POAS runs on real margin.

### Theme B — Trust & verifiability (stop making me re-check it)

The AI is honest, but users still self-audit because they can't see the provenance of each number or trust the published surface end-to-end.

**B1. Show provenance / "where did this number come from" on every metric**
- **The need:** Let a senior reviewer verify a tile or a narrative claim without leaving the report — source, period, and whether it's live vs illustrative, per figure.
- **Who:** Hana — "to není grounding, to je naděje" (`hana:20`); Marek trusts only because he could reconcile numbers to one source ("every reachable number reconciles" — `marek:79`), implying the need to *show* that reconciliation to less forensic users.
- **Why it matters:** Verifiability is what lets a senior stop re-checking and actually hand off. It's the difference between "generated" and "signed."
- **Leverage:** **Med** — sharpens trust for all report personas; multiplies A1's value.
- **First-cut direction:** Per-metric source badge (live source / illustrative / derived) reusing the existing illustrative-data disclosure pattern (`MonthlyReport.tsx:133`).

**B2. Deeper white-label so an agency can publish without any cleanup**
- **The need:** Beyond the now-shipped client-safe toggle + logo, Lucia needs the *whole* published chain — shared report, microsite, and the print/PDF export — to be uniformly on-brand and client-safe, so she never manually cleans an artifact and never worries about a leak she missed.
- **Who:** Lucia — "výstup nemůžu předat platícímu klientovi bez ruční očisty" (`lucia:23`); finding `UAT-L1-16` (unbranded print/PDF still prints the internal "Souhrn od AI" section).
- **Why it matters:** Agency economics depend on zero-touch, scalable output (10 clients ≠ 10× work). Any surface that still needs hand-cleaning breaks the model.
- **Leverage:** **Med** — Lucia is one persona but it's her entire adoption gate; also protects every white-label buyer.
- **First-cut direction:** Extend the `clientSafe` flag to the print/PDF path; branded print mode (logo + accent, suppress AI-disclosure section) — `MonthlyReport.tsx:84-212`.

> **✅ B3 shipped** (`c26abb1`): the /app sign-in gate — the conversion wall after the public demo — was reframed from a "case study / open workspace" wall into a credible **free-trial live-product entry** (Zkušební prostor zdarma kicker, "Spusťte si vlastní Adamant", three value props, "no card · a minute · delete anytime", back-to-live-demo fallback); the first-run empty state gained a "your trial workspace is ready" welcome. Portfolio smell removed; pricing/Stripe still deferred (§5). L2-verified.
> **✅ zisk↔report unified** (`a65111c`): the profit module and monthly report now share one server cost model — zisk seeds its overhead from it and publishes its blended margin + overhead back via "Použít v reportu". (Follow-up to A3.)

**B3. A live-product evaluation path a skeptical buyer trusts**
- **The need:** Marek needs the public surfaces to *read as a live product he could actually buy* and to let him inspect the trust-critical modules (cost/integrations/security) hands-on. Demo exposure of those three is now shipped; the remaining need is the "this is real, not a portfolio" confidence.
- **Who:** Marek — "produkt mi sám říká, že se nedá koupit… peněženku nevytáhnu" (`marek:16,20`); findings `UAT-L1-09` (demo swallowed the trust modules — fixed) and the residual "portfolio smell."
- **Why it matters:** >50% of buyers try before they buy; the eval ends in *doubt* today (`marek:85`). A frictionless, credible self-serve look is the top-of-funnel adoption lever.
- **Leverage:** **Med-High** — gates every prospective buyer, i.e. the whole acquisition funnel.
- **First-cut direction:** A "start trial / join waitlist" that reads as live (pricing/Stripe explicitly deferred — see §5); keep the newly-exposed read-only Spotřeba/Integrace/Účet demo cases sharp.

### Theme C — Grounding depth (feed each AI surface the user's real context)

Grounding scores were low precisely where the user's own context (voice, catalog, competitors, history, lead quality) never reaches the prompt.

**C1. Auto-derive brand voice & catalog from the project (no blank field)**
- **The need:** Social/content drafts must be on-brand by *default*, grounded in the catalog/Offering spine — not a manual free-text field that's empty on first run and placeholder-seeds a competitor.
- **Who:** Sofie — "nikde nevidím, že by nástroj věděl, co prodávám" (`sofie:16`); finding `UAT-L1-10` (brand voice is manual, empty-by-default, absent from WeekPlanner where she starts).
- **Why it matters:** "Zní to jako MY?" is the first question she asks any AI tool; a generic default is an instant bounce. On-brand-by-default is what turns the week-planner from novelty into daily driver.
- **Leverage:** **Med-High** — Sofie plus every content/social surface across all project types.
- **First-cut direction:** Derive tone/voice + product facts from the catalog spine; surface (and allow editing) in WeekPlanner, not buried in Composer (`WeekPlanner.tsx:95-102`).

**C2. Feed lead-quality / CPL / source-quality / speed-to-lead into the grounding**
- **The need:** For leadgen, the recap and diagnostics must be grounded in *which sources are junk, CPL of qualified leads, and speed-to-lead* — the data a senior CRO actually reports on. None of it reaches the prompt today (grounding 3/8).
- **Who:** Hana — "které zdroje leadů jsou junk, CPL kvalifikovaného leadu, speed-to-lead… report na ně mlčí" (`hana:22`); findings `UAT-L1-11`, `UAT-L1-07`.
- **Why it matters:** Answering "what was revenue" for a business that sells no products fails at the headline. This is the difference between a report a senior CRO signs and one she rewrites.
- **Leverage:** **High** — Hana + Marta both blocked on the same missing lead/local data spine.
- **First-cut direction:** Flow the `kvalita-leadu` / `rychla-reakce` series into `snapshotToPromptText`; add a lead-source-quality series to the dataset.

> **✅ C1 shipped** (`20ebefc`): `deriveBrandContext` turns the Offering spine into an on-brand grounding block (sortiment, price band, differentiators, channels); a blank brand-voice field now falls back to it, and the WeekPlanner shows a "Píše na značku" strip proving the tool knows the brand. No LLM fingerprint change. L2-verified.

**C3. Competitor & history context for the narrative**
- **The need:** Recaps and social "what's working" should know the competitive set and longer history, not just period-over-period on the tenant's own scaled data.
- **Who:** Robert (competitors absent from grounding — `robert:52`); Sofie ("opři to o to, co funguje" grounded on the wrong tenant, now fixed, but true competitor grounding still absent — `UAT-L1-06`).
- **Why it matters:** Senior-grade analysis is comparative; "you grew 12%" means little without "vs. the market." Deepens every narrative from descriptive to strategic.
- **Leverage:** **Med** — improves quality for all analytical surfaces; not a hard blocker.
- **First-cut direction:** Optional competitor set on the project; feed into recap + social prompts.
- **✅ Follow-ups resolved**: recap-profit grounding (the A3 cost model → the recap comments TRUE net profit, not just revenue/ROAS) + the C3 **history** dimension (a 12-month horizon + YoY, only when the data spans a year) both flow through the same recap `groundingContext` channel (`src/lib/report/recap-context.ts`); the cost-model version joins the recap cache key. Also: Composer brand field unified with C1's auto-voice; A2 gained URL-fetch ingestion (`fetchFeed` a hosted CSV, refreshable). All L2-verified.
- **✅ Shipped**: a per-project competitor store (`src/lib/competitors/`, new `competitors` table, POST/DELETE route, `CompetitorEditor` on the report) + `competitorGroundingText` folded into the recap grounding (via the C2 `groundingContext` channel — competitor set's `updatedAt` enters the recap cache key) and the social "what's working" grounding. User-entered names only — never invented, never fabricated numbers. History (longer-horizon) deferred as a lighter follow-up. No LLM fingerprint change. L2-verified.

### Theme D — Per-persona job completion (the specific missing pieces each role named)

> **✅ D1 shipped**: a "Nad rámec období" section on the e-shop report composes the `/ltv` (LTV:CAC, CAC payback, paid CAC) and `/sklad-sezonnost` (at-risk SKU count, current-month seasonality index) spines into two compact, clickable cards — so Robert's weekly marketing+LTV+stock job lives in one view. `ReportBeyond` component; page computes the summaries (e-shop only). L2-verified on demo-eshop.

**D1. Robert: LTV/cohort + inventory-vs-seasonality in the report**
- **The need:** His weekly job spans marketing + LTV + stock; the report is a single-period performance recap. `/ltv` and `/sklad-sezonnost` exist but aren't composed in.
- **Who:** Robert — "zisk, LTV ani sklad tam nejsou" (`robert:17`); finding R5 (`robert-eshop-owner:63`).
- **Why it matters:** Replacing his half-day/week reconciliation (his stated motivation) requires all three, not just the narrative leg.
- **Leverage:** **Med** — high job-centrality for eshop, single persona.
- **First-cut direction:** Compose `/ltv` + `/sklad-sezonnost` spines into the report the way POAS now is.

> **✅ D2 shipped**: `rychla-reakce` is now `availableFor: ["leadgen", "local"]` — the response-clock enquiry inbox exists on `local` projects, with a clinic-flavoured `LOCAL_SAMPLE_LEADS` set (booking/availability/new-patient enquiries) so it fits the segment instead of showing B2B service leads. L2-verified on demo-local (Dentalis): sidebar item + SLA timer + AI reply + qualification all render.

**D2. Marta: a speed-to-lead / enquiry inbox that exists on `local`**
- **The need:** "Aby žádná poptávka nečekala" — the response-clock inbox — has no home on a `local` project (`rychla-reakce`/`kvalita-leadu` are leadgen-only, `modules.ts:254,242`). ~⅓ of her JTBD is unreachable.
- **Who:** Marta — "tady na klinice tu schránku poptávek s časovačem vůbec nemám… to je půlka důvodu, proč jsem přišla" (`marta-local:18`); finding `UAT-L1-15`.
- **Why it matters:** A missed enquiry is a ~25k Kč patient lost (per her character). Missing this leaves a headline promise unfulfilled for the entire local segment.
- **Leverage:** **Med-High** — core to the `local` type she and future local clients live in.
- **First-cut direction:** Make `rychla-reakce` available for `local`, or add a local enquiry inbox with the response clock.

> **✅ D3 shipped**: the WeekPlanner's single-platform dropdown became a multi-select chip group; one run now fans each topic across every selected platform, scheduling a differentiated caption per channel (reusing the social route's per-platform styling) on the topic's day — no 3× rerun over shared topics. Count label reads "{topics} × {networks} = {posts} in one run". L2-verified: chips render + multi-select.

**D3. Sofie: cross-channel-per-topic batch in one run**
- **The need:** One week-planner run drafts one platform; to cover IG/FB/TikTok she reruns 3× over shared topics, risking interchangeable captions — exactly what she rejects.
- **Who:** Sofie — "jeden běh = jedna platforma… hrozí, že to bude znít stejně napříč sítěmi" (`sofie:20`); finding `UAT-L1-17`.
- **Why it matters:** Channel-differentiated output in one pass is the core time-save (3–4 h → <1 h); reruns claw the win back.
- **Leverage:** **Med** — single persona, but central to her only journey.
- **First-cut direction:** Compose the existing multi-platform Composer path with the batch scheduler so one topic fans out to differentiated per-channel captions.

> **✅ D4 shipped**: `lp-variant-ideas` now threads the account's lead-quality / CVR grounding (C2's `leadSignalsPromptText`, tenancy-checked) into the challenger prompt, so variants target a real weakness (junk source, slow response) instead of generic "add a testimonial". USER-prompt only → tool fingerprint unchanged. The panel sends `projectId`; the route grounds + caches by the effective project. Grounding source verified for demo-leadgen.

**D4. Hana: LP-experiment variants grounded as real hypotheses**
- **The need:** Beyond the report, her job includes `experimenty-lp` variants that are genuine, testable hypotheses grounded in the account — not generic "add a testimonial."
- **Who:** Hana (character JTBD + "what's the hypothesis?" — `hana-leadgen-cro.md`); not deeply traced this run but named as core to her senior bar.
- **Why it matters:** Diagnosis + experiments as sharp as a senior CRO is her reliability floor; generic CRO clichés fail her.
- **Leverage:** **Low-Med** — one persona, adjacent to the report journey tested.
- **First-cut direction:** Ground `experimenty-lp` in lead-quality/CVR data (depends on C2).

### Theme E — Cross-surface consistency (one brand / metric / currency, defined once)

> **✅ E1 shipped**: every user-facing "Systedo" is now "Adamant", routed through `site.ts` (added `SUPPORT_EMAIL`/`SALES_EMAIL`): alert webhooks/emails + sender name (via `SITE_NAME`), article author bylines, the `/mapa` metadata title, and the `/cena` contact (`obchod@systedo.cz` → `SALES_EMAIL` `obchod@adamant.app`). localStorage `systedo.*` key namespaces left untouched (internal, no migration). Audit: 0 user-facing Systedo remain; typecheck + build green.

**E1. One brand identity & domain everywhere**
- **The need:** A buyer doing due diligence sees both "Systedo" (`cena` contact `obchod@systedo.cz`) and "Adamant" (`AccountSecurity.tsx:14` `podpora@adamant.app`).
- **Who:** Marek — "brand se jmenuje jednou Adamant, jednou Systedo. Dvě firmy?" (`marek:16`); finding `UAT-L1-12`.
- **Why it matters:** Two company names read as an unfinished/untrustworthy product to the economic buyer.
- **Leverage:** **Med** — cheap, buyer-facing trust win.
- **First-cut direction:** Unify brand + support domain across all contact points.

**E2. Full locale consistency (UI strings + currency), not just AI output**
- **The need:** AI output already follows locale, but the homepage hero is hardcoded English for a `cs` visitor, and a UI-string + currency sweep (~199 sites) is still pending.
- **Who:** Marek — "je to celé anglicky… první dojem 'je to lokalizované pro mě?' dostane škrábanec" (`marek:14`); finding `UAT-L1-13`.
- **Why it matters:** Value-prop legibility in the reader's language within seconds is the top-of-funnel bar; a Czech buyer landing on English hero copy discounts the whole product.
- **Leverage:** **Med** — affects every cs visitor's first impression.
- **First-cut direction:** Route hero copy through the `T()` dictionary; complete the pending UI-string/currency localization sweep (`BrandLanding.tsx:115-145`).

**E3. Clean identifiers into prompts (no "(demo)" / no foreign brand)**
- **The need:** One metric/name defined consistently — a published-looking reply shouldn't carry "Dentalis (demo)" and no surface should emit a competitor brand.
- **Who:** Marta — "'(demo)' bych nad recenzí nechtěla vidět, působí to jako testovací účet" (`marta-local:16`); finding `UAT-L1-19`. (The Mionelo leak, `UAT-L1-05`, is fixed.)
- **Why it matters:** Small identity leaks read as "test account" and undercut the sendable-without-editing bar.
- **Leverage:** **Low** — polish, but hits the "sounds like a robot/test" peeve directly.
- **First-cut direction:** Strip suffixes/demo markers from any name fed to a prompt; a single canonical brand-name resolver.

---

## 4. Impact-ranked shortlist (top 8 by leverage = persona-breadth × job-centrality)

| # | Item | Leverage | Personas | One-line value |
|---|---|---|---|---|
| 1 | A1 · Live Ads/Sklik data as the report's source of truth | **High** | Robert, Hana, Marta, Lucia, Marek | Turns a convincing demo into a tool of record — the precondition for every handoff. |
| 2 | C2 · Lead-quality / CPL / speed-to-lead into grounding | **High** | Hana, Marta | Makes the report answer the leadgen/local job a senior would sign. |
| 3 | B3 · Live-product evaluation path (non-pricing) | **Med-High** | Marek | Removes the "portfolio, not product" smell that ends the eval in doubt. |
| 4 | C1 · Auto brand-voice & catalog grounding | **Med-High** | Sofie (+ all content) | On-brand by default — "zní to jako MY" answered without manual setup. |
| 5 | A3 · Real cost/COGS/margin entry | **Med-High** | Robert (+ all eshop) | A profit report an owner would bank, not a ROAS marketing sheet. |
| 6 | D2 · Speed-to-lead inbox on `local` | **Med-High** | Marta | Closes ~⅓ of the local JTBD that has no home today. |
| 7 | A2 · Live GBP/map rank data | **Med-High** | Marta (+ all local) | Decision-grade local visibility instead of an illustrative map. |
| 8 | B2 · Deep white-label (branded print/PDF, zero-touch) | **Med** | Lucia | Publish-without-cleanup — the agency scaling economics. |

Runners-up: B1 (per-metric provenance), E1 (single brand/domain), D3 (cross-channel batch), E2 (locale sweep).

---

## 5. Explicitly deferred

- **Pricing / payment / `/cena` / Stripe** — owner decision pending; excluded from this backlog by design. (Note: finding `UAT-L1-02` is real and is the buyer's #1 stated trust blocker, but sequencing waits on the owner.)
- **Accepted ceilings for now:** map/rankings remains illustrative until a GBP/SERP feed lands (A2); the report is only as good as the single scaled case-study dataset until real data is connected (A1) — both are the *reason* Theme A exists, not separate defects; social batch stays one-platform-per-run until D3 lands.
