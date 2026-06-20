---
id: local-review-reply
type: tiger/call-site
modality: text
file: src/lib/ai/tools/local-review-reply.ts:91
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — LOCAL_REVIEW_REPLY_SCHEMA, local-review-reply.ts:51
grounding: 5/5
code_score: 5
quality_score: "—"
recommended_model: "—"
status: improved
last_scanned: 2026-06-20
characters: []
---
## What it does
Drafts a public Google-Business reply: warm thanks for 4–5★, empathetic de-escalation + offline-contact offer for ≤3★. Entry: `/api/ai` mode `local-review-reply` → `generateLocalReviewReply`.
## Prompt & grounding
- System (local-review-reply.ts:17) pins rating-conditional tone, 2–4 sentences, no legal admission / no invented compensation, first-person-plural.
- Prompt (local-review-reply.ts:29) carries the **review text**, the **rating** (clamped 1–5, drives a tone line), area, business type, and the **business name** (V3). The actual customer words reach the model so the reply can be specific.
- **Grounding 5/5** (was 4/5): review text + rating + area + business type + **business name** now reach the prompt. **V3** added a `businessName` field (the project name), threaded `lokalni/page → LocalModule → LocalReviews → validator → prompt`, so the reply speaks in the business's name rather than anonymously. Remaining ceiling: reviewer name (not in the sample data).
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. **schema + normalize + demo + `validate`** (C4 added the gate: non-empty reply → self-repair once instead of silently flooring to the rating-based `cannedReply`, so a hollow output is observable).
- **Caching:** NONE (`/api/ai`).
- **Golden:** live probe only — **no golden snapshot file** (open — C6).
- `temperature: 0.7`.
## Findings
- ✅ code · **C4 resolved** — `validate` (non-empty reply) added. [[2026-06-20-run]]
- ✅ value · **V3 resolved** — `businessName` threaded so the reply is branded, not generic. [[2026-06-20-run]]
- code · add `/api/ai` cache + golden snapshot (C1/C6). (open)
