---
id: lead-reply
type: tiger/call-site
modality: text
file: src/lib/ai/tools/lead-reply.ts:91
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — LEAD_REPLY_SCHEMA, lead-reply.ts:49
grounding: 5/5
code_score: 5
quality_score: 4.5  # sonnet, per [[benchmark-2026-06-20]]
recommended_model: sonnet  # keep — Haiku degrades (generic, misses lead specifics); Opus no gain
status: improved
last_scanned: 2026-06-20
characters: ["[[hana-leadgen-cro]]"]
---
## What it does
Speed-to-lead: drafts an on-brand first reply + 2–3 qualification questions for an inbound enquiry. Entry: `/api/ai` mode `lead-reply` → `generateLeadReply`.
## Prompt & grounding
- System (lead-reply.ts:14) pins structure, no-emoji/no-fake-prices, channel-tone adaptation, BANT-aware follow-up.
- Prompt (lead-reply.ts:26) carries the **real lead message**, the **channel**, the project/service type, optional **name**, the **brand** (V3), and optional **qualification (BANT)** — when present, "only ask what's missing, adapt tone to hot/cold".
- **Grounding 5/5** (was 4/5): message + channel + type + qualification + **brand** now reach the prompt. **V3** added a `brand` field (the project name), threaded validator → prompt → signed reply, so "on-brand" finally has brand data behind it. **Bonus fix:** the validator was *also* silently dropping `qualification` (BANT) — the inline value object omitted it — so the BANT-aware "only ask what's missing" path had been running blind too; both now thread through. Remaining ceiling: no full brand-voice doc or thread history (brand = name only).
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. **schema + normalize + demo + `validate`** (C4 added the gate: non-empty reply + ≥2 questions → the wrapper self-repairs once instead of silently flooring to `draftReply`, so a hollow output is now observable, not a fake success).
- **Caching:** NONE (`/api/ai`).
- **Golden:** live probe only — **no golden snapshot file** (open — C6).
- `temperature: 0.7`.
## Findings
- ✅ code · **C4 resolved** — `validate` gate added (non-empty reply, ≥2 questions). [[2026-06-20-run]]
- ✅ value · **V3 resolved** — `brand` (+ recovered `qualification`) now threaded so "on-brand"/BANT are grounded. [[2026-06-20-run]]
- code · add `/api/ai` cache (C1 ported to most tools; lead-reply still uncached) + golden snapshot (C6). (open)
