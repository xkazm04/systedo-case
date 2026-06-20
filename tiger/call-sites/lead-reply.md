---
id: lead-reply
type: tiger/call-site
modality: text
file: src/lib/ai/tools/lead-reply.ts:91
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — LEAD_REPLY_SCHEMA, lead-reply.ts:49
grounding: 4/5
code_score: 3
quality_score: 4.5  # sonnet, per [[benchmark-2026-06-20]]
recommended_model: sonnet  # keep — Haiku degrades (generic, misses lead specifics); Opus no gain
status: benchmarked
last_scanned: 2026-06-20
characters: ["[[hana-leadgen-cro]]"]
---
## What it does
Speed-to-lead: drafts an on-brand first reply + 2–3 qualification questions for an inbound enquiry. Entry: `/api/ai` mode `lead-reply` → `generateLeadReply`.
## Prompt & grounding
- System (lead-reply.ts:14) pins structure, no-emoji/no-fake-prices, channel-tone adaptation, BANT-aware follow-up.
- Prompt (lead-reply.ts:26) carries the **real lead message**, the **channel**, the project/service type, optional **name**, and optional **qualification (BANT)** — when present, "only ask what's missing, adapt tone to hot/cold".
- **Grounding 4/5**: message + channel + type + qualification reach the prompt; missing is any brand/company identity or thread history — the "on-brand" instruction has no brand data behind it.
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. **schema + normalize + demo, but NO `validate`** — the only grounded-decision tool here without a self-repair gate. `normalize` floors empty fields to the deterministic `draftReply` (lead-reply.ts:80), so a blank/garbage model reply is **silently swapped for canned text with no telemetry flag** — a hollow output looks like success.
- **Caching:** NONE (`/api/ai`).
- **Golden:** live probe only — **no golden snapshot file**.
- `temperature: 0.7`.
## Findings
- code · add a `validate` (non-empty reply, ≥2 questions) so the wrapper re-prompts instead of silently falling back. (stub — [[2026-06-20-run]])
- value · feed brand/company voice so "on-brand" is grounded; add `/api/ai` cache. (stub)
