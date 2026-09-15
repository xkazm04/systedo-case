# LLM routes — use cases served through the LightTrack gateway

Which `// llm-tool` call sites run through `lt-gateway` instead of the in-app
Claude → Codex → Gemini ladder, on what target, and the measurement each route rests on.
The route file is `gateway.toml` at the repo root; the app-side transport is
`src/lib/llm/gateway.ts` (+ `gateway-generate.ts`), switched on by `LLM_GATEWAY_URL`.

## How it works

1. Start the gateway beside the app, from the repo root (so `gateway.toml` is found):
   `LIGHTTRACK_URL=http://127.0.0.1:8787 LIGHTTRACK_PROJECT=systedo lt-gateway`
   (`LIGHTTRACK_KEY=<project key>` instead of `LIGHTTRACK_PROJECT` against an enforced API).
2. Set `LLM_GATEWAY_URL=http://127.0.0.1:8790/v1` in `.env.local`. Unset = the gateway path
   is off and nothing else changes.
3. The wrapper asks the gateway `GET /v1/models` once a minute; a tool whose id is a route
   there is served by the gateway. Every other tool keeps the in-app ladder. A BYOM key still
   wins for its user (their key, their spend).

For a gateway-served call the app keeps its parsing, `pruneToSchema`, the tool's `validate` and
the one self-repair re-prompt, the corrupt/repaired verdict and the durable Firestore telemetry
entry. It drops its own per-provider retry, cross-provider fallback and the LightTrack mirror:
the gateway does all three and records every attempt itself (`source: lt-gateway`, one
`trace_id` per request). When the gateway cannot answer (every seat on hold → 503, or it is
down), the call degrades to the tool's deterministic demo, never to a second seat spend.

## Routes

| Use case (route) | Primary | Fallback | Hard / medium / easy | p50 | Errors | Run | Date |
|---|---|---|---|---|---|---|---|
| `lead-source-diagnosis` | `codex/gpt-5.5@medium` | none (see below) | 0.81 / 0.89 / 0.98 | 11.0 s | 0 | `3bcc66f3` (benchmark `0d4b7f3b-4a34-4d5f-82dd-ac4fb10c41cf`) | 2026-09-15 |

## lead-source-diagnosis — the measurement

- **Corpus**: dataset `lead-source-diagnosis-bench` (`a28a5103-…`, frozen v1), 21 cases built
  through the app's own `buildLeadSourceDiagnosisPrompt`, 7 per tier. Easy = one clear signal,
  no peers/trend; medium = peers + drift + velocity, one dominant signal; hard = distractors
  (an alarming drift on a healthy source, a tiny sample that looks like spam, a high CPQL that
  is really a fit problem), 6–7 peers, ledger lines, edge values. `expected` = the cause the
  app's deterministic `pickCause` derives from the same numbers (0 disagreements).
- **Rubric** `lead-source-diagnosis v1` (`38302b6d-…`), threshold 0.80: `json_valid`
  (floor 1.0), `exact` on `/likelyCause` (weight 3), `regex` label vocabulary, `regex`
  non-empty summary/recommendation, one `llm` dimension `grounding` (weight 2).
- **Judge**: `google/gemini-2.5-flash` — a third family, so `self_preference = false` on every
  number below. Judge cost for the whole run ≈ $0.33.
- **Matrix** (one identical system prompt on every row = the tool's, plus the app's own
  JSON-only schema tail from `buildCliPrompt`):

| Row | Easy (n=7) | Medium (n=7) | Hard (n=7) | Mean | Pass | p50 | Errors | Cost (gen) |
|---|---|---|---|---|---|---|---|---|
| `anthropic/haiku@low` | 0.17 | 0.20 | 0.17 | 0.18 | 0 % | 28.4 s | 0 | $0.55 (CLI envelope) |
| `anthropic/sonnet@low` | 0.79 | 0.78 | 0.75 | 0.77 | 48 % | 11.3 s | 0 | $0.66 (CLI envelope) |
| `codex/gpt-5.5@low` | 0.95 | 0.91 | 0.75 | 0.87 | 71 % | 10.3 s | 0 | seat (unpriced) |
| **`codex/gpt-5.5@medium`** | **0.98** | **0.89** | **0.81** | **0.89** | 71 % | 11.0 s | 0 | seat (unpriced) |

Rule: a row clears when its hard-tier mean ≥ 0.80 with 0 errors; primary = the cheapest row of
the winning seat that clears; the other seat is the fallback only if it clears too.

- `gpt-5.5@medium` is the only row that clears the hard tier. `@low` is 0.75 there; the
  low→medium step bought ×12.5 thinking (median 11 → 137 reasoning tokens) for +0.02 mean and
  the hard cases — that is what the effort is for.
- **No fallback.** `sonnet@low` clears no tier (0.79 / 0.78 / 0.75) and got the cause right on
  11/21 — below the app's own deterministic floor, which is right by construction on this
  corpus. Shipping it as a fallback would run the module at that quality during every Claude
  window. `haiku@low` answered outside bare JSON on 21/21 cases under the prompt-embedded
  schema (the benchmark rows carry no native schema; the gateway path does hand Claude
  `--json-schema`, so this row measured a transport the gateway does not use — re-measure
  before reading it as a quality verdict). Candidates to measure before adding a fallback:
  `anthropic/sonnet@medium`, `anthropic/opus@low`.
- What the misses have in common: on all three good rows the wrong labels are `ok` → a fault
  and `volume` → a fault. The user prompt says the source *is* under-performing
  ("proč zdroj podvýkonný"), so a healthy source is a contradiction the model resolves by
  naming one. That is a prompt-framing gap in the tool, not model noise; fixing the wording
  (and re-running this benchmark) is the cheapest quality gain available.

## Failover drill (2026-09-15, `LIGHTTRACK_GATEWAY_DEV=1`, port 8791)

Shipped route (no fallback):
1. Real call through `generateLeadSourceDiagnosis` → `meta.model = codex/gpt-5.5@medium`,
   `fellBack = false`, cause `spam` on the medium spam case, 12.6 s, 7 592 in / 482 out tokens.
2. Same call with `X-LightTrack-Simulate: exhausted:codex` → `503`, `retry-after: 300`,
   `attempts[0] = {target: codex/gpt-5.5@medium, outcome: exhausted}`; `/health` →
   `cooldowns: [{provider: codex, remaining_secs: 299}]`.
3. Plain call during the hold → `503`, `retry-after: 286`,
   `attempts[0].outcome = skipped_cooling` (no seat spent). The app degrades to the demo.

Drill-only overlay (same primary + `anthropic/sonnet@low`, to prove the mechanism):
2. Simulated exhaustion → `200`, `x-lighttrack-served-by: anthropic/sonnet@low`,
   `x-lighttrack-fell-back: 1`, `lighttrack.schema = enforced`, 8.8 s.
3. Plain call through the app → `meta.model = anthropic/sonnet@low`, `fellBack = true`,
   `metadata.gateway.skipped_cooling = ["codex/gpt-5.5@medium"]` on the event.
4. `GET /v1/events?project=systedo&name=lead-source-diagnosis`: one trace with an `error` row on
   `codex/gpt-5.5` (`provider_failed`, `failure_class = transient`) and a `success` row on
   `anthropic/sonnet` (`fell_back`), cost $0.15 on the Claude CLI row (its envelope loads ~35k
   context tokens per call), `null` on the Codex rows.

Regression gate for the next model change: `GET /v1/benchmarks/0d4b7f3b-4a34-4d5f-82dd-ac4fb10c41cf/gate`.
