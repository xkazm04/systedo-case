# L1 Simulated-UAT — Synthesis · 2026-07-07 post-phases (P1–P6)

**Scope:** 7 character runs across 5 journeys, validating six just-shipped phases (P1 spend attribution, P2 branding logo, P3 integration probes, P4 account revocation, P5 monthly-recap grounding, P6 content-schedule + reviews persistence). L1 = code-grounded, no browser.

---

## Headline table

| Character · journey | Verdict | Grounding | Time-saved (live) |
|---|---|---|---|
| Marta · dominate-local-search | **L1 partial-pass** | 5/5 (review-reply) | ~1.5–2 h/wk |
| Sofie · plan-a-week-of-social | **L1 partial-pass (conditional)** | 2/4 | ~3–4 h to ~1–1.5 h |
| Robert · produce-a-client-report | **L1-conditional** | 3/5 | ~1–2 h/report |
| Marek · evaluate-whether-to-adopt | **L1-conditional (won't adopt)** | 4.5/5 (where visible) | fast eval, ends in doubt |
| Marta · produce-a-client-report | **L1-conditional (leans fail on trust)** | 2/7 | net slightly positive, below bar |
| Hana · produce-a-client-report | **L1-fail (Trust + Senior-quality)** | 3/8 | partial; hand-relabel claws it back |
| Lucia · produce-a-client-report | **L1-fail (blocked)** | 5/5 (module) but surfaces unsafe | 0 for paying clients |

**Counts:** L1-pass **0** · L1-conditional/partial **5** · L1-fail **2**.

**One-line verdict:** The plumbing shipped and is honest — grounding, tenancy, persistence are real wins — but the two surfaces a client or buyer actually sees (the Monthly Report tiles/numbers, and the public demo/shared surfaces) still speak e-commerce, leak internal chrome, and drop the uploaded logo, so **no journey clears the senior/handoff bar as shipped.**

---

## Cross-cutting themes (ranked by impact x confirmation)

1. **The Monthly Report is e-shop-only where it counts** — tiles (`compute.ts:17-24`) AND the AI grounding block (`snapshot.ts:114-129`) are hardcoded revenue/ROAS/PNO/AOV, while the Overview is already type-aware (`modules.ts:432-449`). P5 shipped the *label* to the prompt but not to the two things the client reads. — **Marta, Hana, Robert** (3/7). Reconciliation-confirmed.
2. **Uploaded logo renders on ZERO client-facing surfaces** — `logoUrl` grep: only Branding module + store + types; never in MonthlyReport / report/[token] / m/[slug] / ReportView / shared-report. The Branding preview over-promises. — **Robert, Lucia** (Marta's "logo reaches the header" is refuted by grep).
3. **Client-safety (T3) still open on public surfaces** — no `clientSafe` flag exists (grep confirms); `/report/[token]` leaks model + USD cost + copy-prompt (`primitives.tsx:262,283-301,374-400`), and `/m/[slug]` publishes scaled demo numbers as SEO-indexed proof with no disclaimer (`microsite.ts:134-135`, `m/[slug]/page.tsx:56`). — **Robert, Lucia**.
4. **"Mionelo" demo identity leaks into output** — social template/fallback emits a competitor brand (`draft.ts:43,61,66,79,82`); recap fallback vendor sentence (`monthly-recap.ts:127`); homepage proof + demo use the real brand (`BrandLanding.tsx:176-178`, `demo/projects.ts:20`). — **Sofie, Robert, Hana, Marek** (4/7).
5. **Grounding claimed but from the wrong data** — social "what's working" uses the fixed case-study dataset, not the project (`draft/route.ts:120`); report snapshot is scaled e-shop data relabeled for local/leadgen (`dataset.ts:25-54`). — **Sofie, Marta, Hana**.
6. **Fix-landed != reachable** — P1/P3/P4 are honest in code but the public demo swallows Spotreba/Integrace/Ucet into the portfolio overview (`DemoModule.tsx:386-396`), so the CFO buyer never sees the cost/integration/security work built for him. — **Marek**.

---

## Phase-outcome scorecard (P1–P6)

- **P1 spend attribution** — Landed. Reachable in authed app (per-project cost, Lucia confirms). NOT reachable in public demo (swallowed to overview). Ceiling: invisible to the CFO buyer who most wants it.
- **P2 branding logo** — Landed (per-project upload/persist). Reachable in Branding. Does NOT unblock the job — logo renders on no client-facing surface. Ceiling: preview-only; the marquee white-label feature stops at the preview.
- **P3 integration live probes** — Landed. Honest, no overclaim. NOT reachable to buyer (demo swallows integrace; else auth-gated). Ceiling: good work he never sees.
- **P4 account session revocation** — Landed. Honest (manual GDPR, 2FA delegated). NOT reachable to buyer (demo swallows ucet). Ceiling: honesty would give a careful buyer mild pause — if he could reach it.
- **P5 monthly-recap grounding** — Partially landed. businessType label plumbed to the AI prompt end-to-end; KPI tiles + grounding snapshot data still hardcoded e-shop. Ceiling: narrative half-framed; tiles + numbers still e-commerce for every non-eshop client.
- **P6 content-schedule + reviews persistence** — Landed, reachable, unblocks (the standout phase). Reviews per-(user,project), server-persisted, old global-localStorage leak gone, 5/5 grounding (Marta). Content-schedule correct but local-only / off-path for eshop (Sofie). Ceiling: content-schedule is a manual board, not an AI drafting surface.

---

## Impact-ranked fix backlog (most painful first)

| # | Title | Sev | Characters | Fix location | One-line fix |
|---|---|---|---|---|---|
| 1 | Monthly Report tiles + grounding hardcoded e-shop, not type-aware | blocker | Marta, Hana, Robert | `report/compute.ts:17-24`, `snapshot.ts:114-129` | Drive tiles from `KPI_PRESETS[type]`; make `snapshotToPromptText` type-aware |
| 2 | `/cena` says "case study / Stripe not wired", mailto CTAs | blocker* | Marek | `cena/page.tsx:27-29,186-209` | Replace with a trial/waitlist that reads as a live product |
| 3 | T3 chrome leaks on public `/report/[token]` (model/cost/prompt) | blocker | Robert, Lucia | `ReportView.tsx:105,214`, `primitives.tsx:262,283-301,374-400` | Add a `clientSafe` prop that hides ResultMeta + PromptDisclosure |
| 4 | Uploaded logo renders on no client-facing surface | major | Robert, Lucia | `shared-report.ts:23-41,68-99`, `MonthlyReport.tsx:89`, `m/[slug]/page.tsx` | Capture `logoUrl` into SharedReport and render it in report/microsite/print headers |
| 5 | "Mionelo" identity leaks into social fallbacks + proof band | major | Sofie, Robert, Hana, Marek | `social/draft.ts:43,61,66,79,82`, `demo/projects.ts:20` | Inject active-project brand into fallbacks; use a fictional case-study brand |
| 6 | Social "what's working" grounded on fixed demo dataset (wrong tenant) | major | Sofie | `social/draft/route.ts:120` | Pass `getProjectDataset(project)` into `perfGrounding` |
| 7 | Report omits profit-after-COGS/POAS for a profit-first e-shop | major | Robert | `report/compute.ts:17-24`, `dataset.ts:25-54` | Compose the `zisk`/POAS spine (+ COGS field) into the recap |
| 8 | Public demo swallows Spotreba/Integrace/Ucet into portfolio overview | major | Marek | `DemoModule.tsx:386-396` | Add read-only demo cases for the three modules |

\* #2 is likely an intentional pre-payment state, but it is the buyer's #1 trust blocker — flagged, sequence accordingly.

Lower tier (rank <=12): brand-voice not auto-grounded (Sofie, `SocialClient.tsx:265-283`); no CPL/lead/local signals in the report (Hana, Marta, `dataset.ts:25-54`); Systedo/Adamant brand split (Marek, `cena/page.tsx:189-190`); English hero for cs (Marek, `BrandLanding.tsx:115-145`); indexed microsite fabricated proof (Lucia, `microsite.ts:134-135` — *blocker on severity, low frequency*); speed-to-lead has no home on local (Marta, `modules.ts:254`); unbranded print export (Lucia).

---

## Strengths worth protecting (do NOT touch)

- **P6 reviews persistence** — per-(user,project) server state, old global-localStorage leak gone, activity-feed events, 5/5 grounding (`ReviewInbox.tsx:127`, `store.local.ts:13-36`). Confirmed clean by Marta.
- **P6 content-schedule persistence** — ownership-checked, key-whitelisted, size-capped, project-scoped (`state/[key]/route.ts:26-72`). Correct even though off-path for eshop.
- **P5 grounding integrity** — AI never invents metrics; validate/normalize reject hollow output; in-UI illustrative-data disclosure (`monthly-recap.ts:19-26,66-100`, `MonthlyReport.tsx:133`). Grounding scored 5/5 (Lucia), 4.5/5 (Marek where visible). This is the fabrication-safety floor — keep it.
- **Branding now per-project** — persisted on the Project doc, prior single-global-localStorage cross-project leak fixed (`BrandingModule.tsx:122-125`, `types.ts:164-167`).
- **P1 spend per-project** — `contextProjectId` injected on every AI call, telemetry filtered by project (`useAiTool.ts:107,187`, `spend/aggregate.ts:18`).
- **Honesty of P3/P4 + pricing transparency** — integration states never overclaim, account checklist honest about dev-auth/manual-GDPR, pricing shown in CZK with no "contact us" wall (`integrations/compute.ts:48-82`, `account/compute.ts:21-29`, `cena/page.tsx`).

---

## Honest ceilings (won't move at L1)

- Report grounding is only as good as the dataset: with a single scaled e-shop case-study behind every project, even a type-aware report can't show *real* local/leadgen signals until per-type data exists.
- Map & rankings is read-only illustrative — no GBP/SERP integration; presentation-grade, not decision-grade.
- Payment is genuinely not wired; "buy now" cannot be real until Stripe lands.
- Social batch is one platform per run; true cross-channel differentiation needs the batch+multi-platform paths to compose.

---

## Value ledger (grounding + time-saved, promised vs live)

| Journey | Grounding (live) | Time-saved promised | Time-saved live | Gap driver |
|---|---|---|---|---|
| Marta · local search | 5/5 reviews | ~3–4 h/wk | ~1.5–2 h/wk | enquiry leg unreachable; map not actionable |
| Robert · report | 3/5 | half-day P&L recon | ~1–2 h narrative only | no profit/COGS; logo missing |
| Marta · report | 2/7 | client-ready report | net slight, below bar | e-shop tiles + no local context |
| Hana · report | 3/8 | ~half day/wk to minutes | partial | hand-relabel every tile |
| Sofie · social | 2/4 | ~3–4 h to <1 h | ~1–1.5 h | off-brand editing + 3x reruns |
| Lucia · report | 5/5 module / unsafe surfaces | ~60–90 min/client | 0 for paying clients | T3 open, can't clean shared link |
| Marek · adopt | 4.5/5 where visible | fast eval | fast but ends in doubt | trust surfaces unreachable |

---

## Panel verdict

**One shared sentiment across all seven voices:** *"The engine is honest and the plumbing finally holds — but the last mile the client or buyer actually touches still shows the wrong business, the vendor's chrome, or someone else's brand, so I can't hand it over yet."* The highest-leverage work is not more phases — it is finishing the three seams already started: type-aware report surface, client-safe published surfaces, and rendering the logo/brand that P2 already captures.
