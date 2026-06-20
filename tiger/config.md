---
type: tiger/config
app: Adamant (systedo-case)
stack: Next.js 16 · TypeScript · provider-switching LLM wrapper
updated: 2026-06-20
---

# Tiger config — Adamant (the per-app overlay)

The engine (`.claude/skills/tiger.md`) is app-agnostic. This file pins how Tiger finds and exercises the LLM call sites in **this** repo.

## What counts as a call site (discovery)
- **Text generation (16):** every `generateStructured()` site, tagged `// llm-tool: <id>` and registered in `test-llm/registry.mjs`. The chokepoint is `src/lib/llm/index.ts`; tools live in `src/lib/ai/tools/*.ts`. Discover with `grep -rn "// llm-tool:" src`.
- **Image generation:** Leonardo (`src/lib/leonardo/client.ts`, driven by `src/lib/images/studio.ts`).
- **Vision scoring:** Gemini vision ranks the N image candidates (`src/lib/images/studio.ts`).
- **Embeddings:** Gemini embeddings for patterns semantic search (`src/lib/patterns/embeddings.ts`).
- **The chokepoint itself** (`llm/index.ts`) gets a call-site note as the shared plumbing all text tools inherit (retry, fallback, self-repair, cost-stamp, telemetry, the locale override).

## Existing AI infra to credit / extend (don't duplicate)
- Telemetry: `src/lib/llm/telemetry.ts` (per-call cost/latency/tokens/attempts/repair → Firestore) + `/api/eval/telemetry`.
- Eval: `test-llm/real.test.mjs` (real-Claude once per tool) + golden snapshots (`test-llm/golden/*` fingerprint prompt+schema) + the pre-commit `scripts/llm-gate.mjs` (chokepoint + coverage + hash-gated suite).
- Cost table: `src/lib/llm/cost.ts` (per-model token rates) — use for Lens-3 USD.
- Rate-limit/quota: `src/lib/ai/rate-limit.ts`, `src/lib/usage.ts`.

## Lens-2 live generation (real output)
Dev routes the app's calls through the Claude Code CLI (Sonnet) — see `uat/env.md`. To exercise a tool's grounded path end-to-end, POST `/api/ai` (mode = tool id) on the running `dev:local` server (`:3100`), or call the tool's `generate*` fn. Set the `locale` cookie to test output language. Budget 30–130 s per live call.

## Lens-3 model benchmark recipe (the alternative scenario)
The app's wrapper is environment-fixed (Claude in dev, Gemini in prod), so Tiger benchmarks models **out-of-band** using the harness's own subagents:
- For a call site, take its **exact system prompt + JSON schema** (from the tool file) and a **character-shaped input**, and dispatch a subagent per matrix cell with `{ model, effort }` (the Agent tool's `model` ∈ haiku|sonnet|opus|fable and `effort` ∈ low|medium|high|xhigh), instructing it to return ONLY the schema-shaped JSON.
- Judge each cell's output with the **Character's scored criteria** via a separate judge (never the model under test) → quality 0–5.
- Record **latency** (agent duration) and **relative cost** (output tokens × the model's rate from `cost.ts`); the app's real prod model is Gemini, so also note the Gemini tier mapping.
- Cache every cell in `tiger/models/*` keyed by `(call-site, model, effort, input-hash)` — re-runs are free.
- Matrix for a first pass: models {haiku, sonnet, opus} × thinking {low, high} on the 3–4 highest-value call sites.

## Fixtures (character-shaped inputs)
Reuse the seeded sample data the tools already accept (see `uat/env.md`: `demo-eshop/leadgen/app/content`). Each Character note carries a realistic input per call site it maps to.

## Vault conventions
Obsidian vault rooted at `tiger/`. Stable call-site `id` = the `llm-tool` id (text) or `creative-image-gen` / `creative-vision-score` / `patterns-embed` / `llm-wrapper`. Link liberally with `[[…]]`. `Tiger.md` is the Map-of-Content.
