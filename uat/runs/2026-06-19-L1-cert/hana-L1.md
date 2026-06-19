# L1 Certification — Hana (lead-gen / CRO manager)

- **Cert level:** L1 (theoretical — reasoning over source only; no app run, no browser)
- **Date:** 2026-06-19
- **Character:** Hana — lead-gen / CRO manager (`uat/characters/hana-leadgen-cro.md`)
- **Journey:** Fix lead quality (`uat/journeys/fix-lead-quality.md`) — diagnose junk sources → spin up an LP experiment → make lead response fast; quality over volume.
- **Surfaces read:** Lead quality (`/kvalita-leadu`), LP experiments (`/experimenty-lp`), Fast reply (`/rychla-reakce`).
- **Verdict:** **L1-pass** (with findings; the three AI graders need L2 to confirm output sharpness, and two grounding gaps are real and citable).

---

## (a) Surface model

### Routing & data spine (all three)
All three routes are thin server components that gate on the module entitlement and pass **static sample data** into a module component:
- `src/app/app/[projectId]/kvalita-leadu/page.tsx:10-18` → `LeadQualityModule sources={SAMPLE_SOURCES}`
- `src/app/app/[projectId]/experimenty-lp/page.tsx:10-18` → `LpExperimentsModule experiments={SAMPLE_EXPERIMENTS}`
- `src/app/app/[projectId]/rychla-reakce/page.tsx:10-18` → `SpeedLeadModule leads={SAMPLE_LEADS}`

So everything is **illustrative sample data** with a stated "real-integration seam" (CRM webhook / traffic split / intake webhooks). For L1 that is fine — Hana is judging the *designed experience and AI grounding*, and the sample is a realistic lead-gen account (paid search, Sklik, Meta lead forms, comparators, organic).

### Sub-surface 1 — Lead quality (`/kvalita-leadu`)

**Affordances / state (`LeadQualityModule.tsx`):**
- Server-rendered, no client interaction except the co-located AI panel.
- KPI cards: Leads, CPL, **CPQL**, Junk-source count (`:91-114`). The junk card is explicitly framed "levné, ale nekvalitní" (cheap but low quality) — quality-first framing, not volume.
- A junk banner advising to bid on qualified leads & revenue, not form count (`:116-124`).
- Per-source table sorted by composite quality score (`:54`, `:142-157`); columns Leads / CPL / Qual% / **CPQL** / Win rate / ROI / Quality. Junk rows tinted coral (`:143`).
- Lead→close funnel per source with per-step conversion + absolute drop-off + velocity (`:167-223`).
- Period-over-period drift table + threshold alerts (CPQL rise >25 % or over target), hidden when no prior data (`:225-296`).
- Campaign drill-down, hidden when absent (`:299-342`).

**Grounding (compute):** `src/lib/lead-quality/compute.ts`
- `withMetrics` (`:25-41`): CPL, qualRate, CPQL, winRate, ROI, `qualityScore = round(100·(0.6·qualRate + 0.4·winRate))`, `junk = spend>0 && qualRate < 0.35` (`JUNK_QUAL_RATE`, `:23`).
- Drift: `sourceTrend`/`periodAlerts` (`:204-284`) — `CPQL_ALERT_RISE = 0.25`, `CPQL_TARGET_CZK = 900`.
- All math is **pure and real** — the sample (`sample.ts:34-49`) has a deliberately-degraded Meta source (spend↑, qualification↓) so the drift alert is grounded in actual numbers.

**AI diagnosis grounding (the scored part):** `LeadSourceDiagnosisPanel.tsx` + `src/lib/ai/tools/lead-source-diagnosis.ts`
- The module pre-selects **under-performing** sources (`junk || winRate < 0.15`) and projects ONLY real computed numbers — source, leads, qualified, won, qualRate, winRate, spend, cpql, costPerQualified (`LeadQualityModule.tsx:69-87`). If none stand out it falls back to the weakest source (`:70`) so the action is always available.
- System prompt (`lead-source-diagnosis.ts:26-40`): "Jsi zkušený český analytik akvizice a kvality leadů… Vycházej VÝHRADNĚ z předaných čísel. Nevymýšlej." It defines a **closed cause taxonomy with quantitative discriminators**: `spam` (cheap + barely qualifies → bots/competitors), `mis-targeting` (qualifies but doesn't close → fit), `pricing` (high CPQL despite OK qualification), `volume` (too little data), `ok`. Demands one concrete action and references to the actual numbers.
- `pickCause` (`:118-127`) is a **deterministic, data-driven** discriminator that mirrors the prompt: `<30 leads → volume`; `qualRate<0.35 → spam (if cheap) / mis-targeting`; `winRate<0.15 → mis-targeting`; `costPerQualified≥3000 → pricing`; else `ok`. This both seeds the keyless demo and floors empty model fields.
- `validateLeadSourceDiagnosis` (`:158-165`) forces a re-prompt if the model returns no summary/recommendation; `coerceCause` defaults unknowns to mis-targeting rather than failing (`:104-107`).

### Sub-surface 2 — LP experiments (`/experimenty-lp`)

**Affordances / state (`LpExperimentsModule.tsx`):**
- Server-rendered cards per experiment (one keyword cluster each).
- Per-variant CVR bars, uplift vs control, winner highlight (`:79-115`).
- **A trust gate**: a `running` test below its required per-arm sample size shows "Sbírá data — X %" with progress + required-visitors copy and *refuses to declare a winner* (`:33-77`). Only `significant && winner` earns the ship-the-winner handoff (`:26-27`, `:119-148`).
- "Navrhnout varianty" AI panel co-located (`:150`).

**Grounding (compute):** `src/lib/lp-exp/compute.ts` — this is genuinely senior statistics:
- `requiredSampleSize` (`:76-92`): proper two-proportion power calc (pooled+unpooled, Acklam probit `zFor`).
- `correctedAlpha` (`:108-111`): **Šidák multiple-comparisons correction** for multi-arm tests.
- `evaluate` (`:113-165`): two-sided significance; `significant` for a `running` test requires BOTH corrected-confidence AND the sample-size gate — an explicit **peeking guard**. The CRM 3-arm sample (`sample.ts:33-41`) exercises the correction.

**AI variant-ideas grounding (the scored part):** `LpVariantIdeasPanel.tsx` + `src/lib/ai/tools/lp-variant-ideas.ts`
- System prompt (`lp-variant-ideas.ts:25-33`): "Jsi český CRO specialista… Navrhni 2–3 OD SEBE ODLIŠNÉ koncepty — každý ať testuje **jinou hypotézu** (jiný úhel, jiný benefit, jiná struktura), ne jen přeformulování. Každá varianta se musí lišit od kontroly. NEVYMÝŠLEJ čísla." Each variant must return label, **hypothesis**, headline, primaryCTA, rationale.
- `validateLpVariantIdeas` (`:117-128`) forces a re-prompt if no concept has a label+hypothesis. Demo (`:133-153`) templates 2 distinct angles (social proof + sharper offer) from the topic alone.
- **Grounding gap (input):** the request the panel builds carries only `topic` (cluster), `controlLabel`, and a generic `controlDescription` string (`LpVariantIdeasPanel.tsx:38-46`). The parent seed (`LpExperimentsModule.tsx:16-21`) passes **only** `id/cluster/status/controlLabel` — it never populates `keywords` and never passes the **actual loser variant labels, the control's real CVR, or which arms already failed**. So the hypotheses are grounded in the *topic string*, not in the *experiment's own conversion data that sits right above on the same screen*.

### Sub-surface 3 — Fast reply (`/rychla-reakce`)

**Affordances / state (`SpeedLeadModule.tsx` — the one client module):**
- Live SLA countdowns per lead off a single shared 1 s timer (`:160-164`), 5-min target (`SLA_TARGET_MIN`, `draft.ts:7`), pre-breach warning at 60 s (`:48`), breach pinning + an "Eskalovat" jump-to-first-breached (`:280-297`, `:348-363`).
- Response-time analytics band: median reaction, % within SLA, avg by channel — derived from this session's sends + live breach state (`computeResponseAnalytics`, `analytics.ts:51-92`; band `:303-346`).
- Editable reply textarea seeded by a **deterministic draft** (`draft.ts:16-28`) → "Vygenerovat AI odpověď" swaps in the model reply, with copy, regenerate, demo/timeout/error states (`:441-545`).
- Snippet library (named Czech templates with `{jméno}/{kanál}` fill, per-project localStorage) (`snippets.ts`; UI `:495-514`).
- **BANT-style qualification capture** (timeline/budget/scope/disposition → 0–100 score) inline while replying (`qualification.ts`; UI `:547-639`) — quality signal travels with the lead, not just speed.
- "Odeslat odpověď" measures real response seconds and is simulation-only (`:641-659`).

**AI reply grounding (the scored part):** `src/lib/ai/tools/lead-reply.ts`
- System prompt (`:13-22`): experienced Czech speed-to-lead salesperson; fixed structure (greeting + thanks/ack + promise of fast reply + sign-off); **"žádné prázdné korporátní fráze, žádné emoji, žádné přehnané vykřičníky"**; adapt tone to channel (call → offer callback); **must not promise prices/dates/discounts that weren't given**; ask 2–3 qualification questions returned separately in `questions`.
- Request passes message, channel, a keyword-inferred `projectType` (`SpeedLeadModule.tsx:37-44`), name. Deterministic `draftReply` is both the keyless demo and the empty-field floor (`lead-reply.ts:58-93`).

### Cross-cutting LLM grounding
- Single chokepoint `generateStructured` (`src/lib/llm/index.ts:129-237`): Claude (Sonnet) in dev / Gemini in prod (`models.ts`), bounded retry, **one self-repair re-prompt** on `validate()` violations (`:154-170`), cross-provider fallback, and a deterministic demo when no provider is configured — so the whole journey works keyless from a clean checkout, clearly badged "Ukázkový režim" (`LeadSourceDiagnosisPanel` via `ResultMeta`; SpeedLead `:539-544`).
- Every AI panel exposes the exact prompt via `PromptDisclosure` (`data.meta.prompt`) — Hana can inspect the grounding herself. Strong trust signal for a skeptic.

---

## (b) L1 findings

```json
[
  {
    "id": "L1-HANA-01",
    "cert_level": "L1",
    "type": "grounding-gap",
    "dimension": "trust/quality",
    "severity": "major",
    "title": "LP variant hypotheses ignore the experiment's own conversion data sitting one card above",
    "expected": "A senior CRO generates the next variant from what the current test is telling her: the control's CVR, which challenger angles already LOST (e.g. CRM cluster: 'Sociální důkaz' lost to control), and the keyword cluster. 'What's the hypothesis?' should be informed by the prior result.",
    "got": "The lp-variant-ideas request is grounded ONLY in the cluster topic string + a generic controlLabel; the seed never carries keywords, the control's real CVR, or the labels/results of arms that already won or lost. The model is told to 'differ from the control' but is never told what the control or the losers actually were beyond a name.",
    "evidence": "src/components/app/modules/LpExperimentsModule.tsx:16-21 (seed omits keywords + results); src/components/app/modules/LpVariantIdeasPanel.tsx:38-46 (request = topic + controlLabel + generic controlDescription only); src/lib/ai/tools/lp-variant-ideas.ts:35-49",
    "code_check": "In buildRequest, seed.keywords is always undefined and controlDescription is a templated string with no metrics; the rich ExperimentResult (cvr, uplift, isWinner per variant) computed in LpExperimentsModule is never threaded into the AI panel.",
    "suggested_acceptance": "When an experiment has results, pass control CVR + the labels and outcomes of evaluated arms (won/lost/uplift) and the cluster keywords into the lp-variant-ideas request, and instruct the model to propose angles that are DISTINCT from arms that already lost. The disclosed prompt should show those numbers."
  },
  {
    "id": "L1-HANA-02",
    "cert_level": "L1",
    "type": "missing-affordance",
    "dimension": "quality/segment-awareness",
    "severity": "minor",
    "title": "Lead diagnosis is single-source; no portfolio reallocation or segment view",
    "expected": "A senior growth lead diagnoses the PORTFOLIO: 'Meta lead forms are junk — move that 96k CZK to Porovnávače / Organic which close at 31%/35%.' The action should name where the budget goes, grounded in the other sources' numbers.",
    "got": "Each AI diagnosis sees exactly one source's numbers in isolation (by design, to prevent fabrication). The recommendation can say 'move budget to higher-quality sources' but cannot name WHICH source or quantify the trade-off, because the better sources' metrics are never in the prompt.",
    "evidence": "src/lib/ai/tools/lead-source-diagnosis.ts:47-73 (prompt is one ZDROJ only); src/components/app/modules/LeadQualityModule.tsx:71-87 (seed is per-row, no peers)",
    "code_check": "buildLeadSourceDiagnosisPrompt receives a single LeadSourceDiagnosisRequest; there is no field for peer sources or blended benchmarks, so 'přesuňte rozpočet ke kvalitnějším zdrojům' stays generic.",
    "suggested_acceptance": "Optionally include a compact benchmark line (blended CPQL, and the top-2 sources by quality score) so the recommendation can name a concrete destination for reallocated budget without inventing numbers."
  },
  {
    "id": "L1-HANA-03",
    "cert_level": "L1",
    "type": "ai-output-quality",
    "dimension": "senior-quality",
    "severity": "info",
    "title": "Diagnosis / variant / reply sharpness is prompt-designed but not L1-verifiable",
    "expected": "Outputs read as a senior CRO wrote them: data-cited diagnosis, genuinely distinct testable hypotheses, send-ready replies with no clichés/emoji.",
    "got": "The PROMPTS are well-designed for this (closed cause taxonomy with quantitative rules; 'each variant a different hypothesis, differ from control, invent no numbers'; reply forbids empty corporate phrases/emoji/over-exclamation and bans unquoted prices). The deterministic demo fallbacks are solid and on-message. But actual live model output (does it truly cite the numbers? are the 2-3 variants actually distinct vs three flavors of 'add social proof'?) cannot be observed at L1.",
    "evidence": "src/lib/ai/tools/lead-source-diagnosis.ts:26-40; src/lib/ai/tools/lp-variant-ideas.ts:25-33; src/lib/ai/tools/lead-reply.ts:13-22; demos: lead-source-diagnosis.ts:169-213, lp-variant-ideas.ts:133-153",
    "code_check": "Prompts + validate() re-prompt gates are present and correct; only a live run can confirm the model honors them.",
    "suggested_acceptance": "L2: run each tool against the sample; assert diagnosis quotes ≥2 of the passed figures and matches pickCause; assert the 2-3 LP variants have distinct hypotheses (not lexical near-duplicates) and differ from controlLabel; assert the reply contains no emoji/price and includes 2-3 questions."
  },
  {
    "id": "L1-HANA-04",
    "cert_level": "L1",
    "type": "ux-friction",
    "dimension": "speed/efficiency",
    "severity": "minor",
    "title": "Fast-reply qualification questions are answered in chat-free isolation; 'Odeslat' doesn't attach the BANT score or fire the AI by default",
    "expected": "Speed-to-lead: open lead → one click sends an on-brand reply with the qualification captured, fast. The reply Hana sends should ideally already reflect the qualification she just set.",
    "got": "Strong scaffolding: live SLA, deterministic draft instant, AI on demand, BANT capture, snippet library. But the AI reply must be manually triggered (deterministic draft is the default), and the captured BANT score / disposition is not fed back into the AI reply prompt — the reply and the qualification are parallel, not coupled. 'Odeslat' is simulation-only (expected per journey scope).",
    "evidence": "src/components/app/modules/SpeedLeadModule.tsx:204-213 (generateReply payload = message/channel/projectType/name only — no qualification); :641-659 (send is sim-only); src/lib/ai/tools/lead-reply.ts:24-39",
    "code_check": "The qual state (qualById) and the lead-reply request are never joined; questions shown come from the AI or the deterministic set, independent of captured BANT.",
    "suggested_acceptance": "L2/L3: optionally pass captured timeline/budget/scope into the reply prompt so already-answered fields aren't re-asked, and surface a one-click 'AI reply + send' for the speed path."
  }
]
```

**L1 strengths worth recording (counter-weight to the findings):**
- Quality-first framing is *structural*, not cosmetic: CPQL is a headline KPI, junk is defined by qualification rate, the quality score weights qualRate+winRate, and the banner explicitly tells the user to bid on qualified leads/revenue not form count (`LeadQualityModule.tsx:99-124`, `compute.ts:38-39`).
- The LP module's trust gate (sample-size + Šidák + peeking guard) is genuinely senior and *prevents* the classic CRO sin of calling an under-powered test (`lp-exp/compute.ts:108-165`, module `:33-77`).
- Drift watch surfaces a *getting-worse* source (Meta) from real period-over-period numbers — exactly the "is this source degrading?" question Hana asks (`compute.ts:204-284`, `sample.ts:42-44`).
- AI panels are grounded-by-construction: they project only real computed numbers, tell the model to invent nothing, expose the prompt, and re-prompt on hollow output.

---

## (c) L1 verdict

**L1-pass.**

The three sub-surfaces all exist, are substantive, and are wired to real (sample-backed) computation, not theater. The AI grounding is genuinely above the bar for a discovery-stage tool: diagnosis sees only real figures with a quantitative cause taxonomy; LP variants are forced toward distinct testable hypotheses; replies are constrained against clichés/emoji/unquoted prices. Quality-first is baked into the data model, not bolted on. Pass is gated on two honest grounding gaps — **L1-HANA-01** (LP hypotheses ignore the experiment's own results) is the one a senior CRO would actually feel — and on the fact that final output *sharpness* (the heart of Hana's senior bar) is an L2 question that must be confirmed live.

---

## (d) Character feedback — Hana, first person

Okay, first impression: someone here actually thinks like a CRO, not a volume hawk. The lead-quality screen leads with **CPQL**, not lead count, and the junk flag is keyed off qualification rate — "cheap but worthless" is exactly the slide I show sales when they accuse marketing of flooding them. The drift watch caught my degrading Meta source from period-over-period numbers, which is the question I open every Monday with. Good. And the AI diagnosis only gets the *real* numbers and is told to invent nothing, with the prompt right there for me to read — I trust that far more than a black box. The cause taxonomy (spam vs mis-targeting vs pricing vs too-little-data) is the right mental model, and the deterministic fallback already reads sensibly.

Where it loses me: the diagnosis is **one source at a time**. When I ask "is this source junk?" my next breath is "...so where does the money go instead?" The model can't tell me, because it never sees that Porovnávače and Organic close at 22% / 35% sitting two rows up. "Move budget to higher-quality sources" without a name is the kind of generic advice I'd cut from a junior's deck.

The LP module genuinely impressed me — a real sample-size gate and a multiple-comparisons correction means it won't let me call an under-powered test, which is the mistake that burns growth teams. But the "Navrhnout varianty" panel is grounded in the *cluster name*, not the *experiment*. On my CRM test, "Sociální důkaz" already **lost** to control — and nothing stops the model from handing me social proof again, because it was never told that arm failed and was never shown the control's real CVR. That's my whole job: "what's the hypothesis, and why isn't it the thing we already disproved?" Feed the losers and the control CVR into that prompt and it goes from a brainstorm to a real next experiment.

Fast reply nails the thing that matters — a 5-minute SLA with a live countdown, breach escalation, and a deterministic draft that's instant so I'm never staring at a spinner while a hot lead cools. The reply prompt bans emoji, corporate filler, and made-up prices, which is most of what makes auto-replies embarrassing. Two nits: I had to click to get the AI reply (the safe default draft is fine, honestly), and the BANT qualification I just captured doesn't flow into the reply — so it might re-ask "what's your timeline" when I already marked it ASAP. Couple those and the speed path is genuinely faster than my templates.

Net: this would compress my Monday source review and my LP-idea time meaningfully, and the speed-to-lead inbox is send-ready in spirit. I'm not fully signed off until I see live output — does the diagnosis actually *quote my numbers*, and are the three LP variants three real hypotheses or three coats of paint on "add a testimonial"? Show me a live run on my account and ground those variants in the test results, and I'd put my spreadsheets down.
