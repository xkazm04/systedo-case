---
id: local-review-reply
type: tiger/call-site
modality: text
file: src/lib/ai/tools/local-review-reply.ts:91
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet / gemini-3-flash-preview
schema: yes — LOCAL_REVIEW_REPLY_SCHEMA, local-review-reply.ts:51
grounding: 4/5
code_score: 3
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-06-20
characters: []
---
## What it does
Drafts a public Google-Business reply: warm thanks for 4–5★, empathetic de-escalation + offline-contact offer for ≤3★. Entry: `/api/ai` mode `local-review-reply` → `generateLocalReviewReply`.
## Prompt & grounding
- System (local-review-reply.ts:17) pins rating-conditional tone, 2–4 sentences, no legal admission / no invented compensation, first-person-plural.
- Prompt (local-review-reply.ts:29) carries the **review text**, the **rating** (clamped 1–5, drives a tone line), area, and business type. The actual customer words reach the model so the reply can be specific.
- **Grounding 4/5**: review text + rating + area + business type reach the prompt; missing is the business's real name/brand and a reviewer name.
## Code quality (wrapping · logging · caching)
- Chokepoint; one tagged call. **schema + normalize + demo, but NO `validate`** — like [[lead-reply]], a blank model reply is silently floored to the rating-based `cannedReply` (local-review-reply.ts:85) with no telemetry flag. The "2–4 sentences" rule is **unenforced server-side**.
- **Caching:** NONE (`/api/ai`).
- **Golden:** live probe only — **no golden snapshot file**.
- `temperature: 0.7`.
## Findings
- code · add `validate` (non-empty reply; optional sentence-count / no-emoji check) so the wrapper self-repairs instead of silently canning. (stub — [[2026-06-20-run]])
- value · pass business name so the reply is branded, not generic; add `/api/ai` cache. (stub)
