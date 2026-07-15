---
id: monthly-recap
type: tiger/call-site
modality: text
file: src/lib/ai/tools/monthly-recap.ts:147
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet (quality tier, default) / gemini quality tier
schema: yes — MONTHLY_RECAP_SCHEMA, src/lib/ai/tools/monthly-recap.ts:55-75
grounding: 6/6
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-07-15
characters: []
---
## What it does
`generateMonthlyRecap` (monthly-recap.ts:132) builds a client-facing monthly recap — `headline`, `summary`, `highlights[]`, `watchouts[]`, titled `priorities[]` — from the caller's own project dataset, framed to project type (call at :147). Entry: `POST /api/ai` case `"monthly-recap"` (route.ts:432-462); persists the result for owned non-demo projects (route.ts:451-460); UI `mesicni-report/page.tsx`.

## Prompt & grounding
System (`MONTHLY_RECAP_SYSTEM` :22-29) — Czech marketing strategist, `antiFabrication(...)` (:25), business-type-aware framing (e-shop→obrat/PNO/ROAS; leadgen/local/content→poptávky/návštěvnost/konverze). User (`buildRecapPrompt` :31-53) — `DATA:` block + optional `groundingContext`, "pouze z uvedených dat." Grounding is deep + all server-derived/tenancy-checked (**6/6**):
1. Period snapshot — `buildSnapshot`→`snapshotToPromptText(snapshot, projectType)` (:150), projectType shapes metric vocabulary.
2. Business-type label (:150 via `BUSINESS_TYPE`).
3. Lead-quality/velocity signals (C2) — `resolveLeadSignals`, period-scaled (route.ts:183-189,209).
4. Local-visibility signals — `localSignalsPromptText` (route.ts:188,208).
5. Competitors + profit + 12-mo history — `profitGroundingText` (net profit via cost model) + `historyGroundingText` (YoY, gated by `HISTORY_MIN_DAYS` + `snap.truncated` so a short series is never narrated as a year).
6. Live-data staleness caveat (D1) — `staleCaveatText` when synced Ads series is stale (route.ts:215-222).
All extra grounding rides the USER prompt only; system+schema fingerprint held byte-identical so refine/grounding changes don't break the golden. temperature 0.4 (:155).

## Code quality (wrapping · logging · caching)
- Full chokepoint benefits (fallback, 3 retries, per-tier deadline w/ Claude-CLI floor, abort, validate/self-repair). `validateRecap` (:90-98) forces re-prompt on empty highlights/watchouts/priorities/headline rather than letting `normalizeRecap` (:77-86) clamp a hollow recap. `looksCorrupt` flags truncated JSON. `demoRecap` (:100-130) keyless fallback.
- Durable `recordLlmCall` + LightTrack mirror + durable error entry on exhaustion.
- **Caching — two layers, well-suited to a per-month artifact:** (1) in-memory `cachedRespond` keyed by `hashAiInput` where `keyId` encodes EFFECTIVE grounding version (`comp.keySuffix`, live-sync ts, `#stale`) so edits/re-syncs/staleness re-key correctly + no cross-tenant bleed; spend refund on hit. (2) durable persistence via `recordRecap` + `recapInputHash(locale, period, projectType, data)` (route.ts:451-458) → report page renders stored recap, flags stale on hash change — no regeneration per visit.
- Golden test-llm/golden/monthly-recap.json (promptHash `ca3d51da9d30bd86`); registered registry.mjs:576 (curated probe, independent of prod string by design).

## Findings
- **strength-to-protect** — effective-grounding-versioned cache key + truncation/short-series guards (recap-context.ts:57,82,85) prevent cross-tenant/stale reuse and fabricated YoY. The recap←lead-quality live-data seam is landed cleanly. [[2026-07-15-scan]]
- **strength-to-protect** — two-layer caching (in-memory + durable per-month w/ input-hash staleness) is the right design for a per-month artifact. [[2026-07-15-scan]]
- **model (info)** — tier unset → quality; justified for a client-facing multi-source narrative where fast-tier risks faithfulness. Leave as-is. [[2026-07-15-scan]]
