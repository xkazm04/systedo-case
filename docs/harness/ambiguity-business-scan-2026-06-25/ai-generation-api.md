# AI Generation Tools & API — Ambiguity + Business scan

> Context: Server-only AI tools (13 modes) behind a single public `/api/ai` endpoint with JSON-schema structured output, request validation and a dataset-grounded snapshot prompt.
> Files analyzed: 4 (note: the listed `src/lib/gemini.ts` actually lives at `src/lib/llm/gemini.ts`; adjacent imports — `rate-limit.ts`, `response-cache.ts`, `validation.ts`, `tools/_shared.ts`, `tools/analysis.ts` — were read for accuracy)
> Total findings: 5

## 1. Per-IP rate limit is the only budget cap for anonymous users — and the IP is client-spoofable
- **Lens**: 🌀 Ambiguity (security/risk)
- **Value**: High
- **Effort**: M
- **File**: src/lib/ai/rate-limit.ts:62 (and src/app/api/ai/route.ts:63, :88)
- **Problem/Opportunity**: `clientIp()` trusts the **leftmost** `x-forwarded-for` segment (`fwd.split(",")[0]`), which is fully attacker-controlled. The per-user daily quota (`consume(userId, "aiEval")`, route.ts:63-75) only runs for *signed-in* users — but a public case-study demo's audience is anonymous. So for the primary audience the only paid-call defense is the per-IP fixed-window limiter, and an attacker who rotates `X-Forwarded-For` on every request lands in a fresh bucket each time, defeating both `aiPerMin` and `aiPerDay`. The lone remaining backstop is the 4-slot `MAX_CONCURRENT` cap — which a slow drip of one-at-a-time calls never trips, draining the Gemini budget unbounded.
- **Why it matters**: This is the exact "could it be abused to burn LLM budget?" risk on the privileged surface; today an anonymous looper can, and the design comment ("unauthenticated by design") never records this residual gap.
- **Fix sketch**: In `rate-limit.ts` (NOT a hashed file) take the IP from a trusted hop (rightmost XFF behind the known proxy, or the platform's connecting-IP header) instead of the leftmost; add a single process-wide *global* daily budget rule (e.g. `aiGlobalPerDay`) as defense-in-depth so total anonymous spend is capped regardless of IP. Record the threat model in the file header. Non-gate-triggering.

## 2. "Glass-box" grounding is fully captured in `meta` but never sold as the differentiator it is
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/ai-types.ts:46 (and :60-64 `usage` / `estCostUsd`)
- **Problem/Opportunity**: Every response already carries `meta.prompt` ("the exact prompt sent to the model — surfaced in the UI for transparency"), token `usage`, and `estCostUsd`, and the tools are explicitly engineered to invent no figures (analysis.ts grounds on the dashboard snapshot at temperature 0.4). For an agency case-study app whose actual job is to win clients, "our AI is grounded in YOUR real numbers and shows its work and its cost" is a concrete trust differentiator against black-box competitor tools — but the data sits in the payload unused as a sales narrative.
- **Why it matters**: The single highest-leverage asset for a portfolio is the live demo; surfacing grounding + cost transparency converts a toy into a credibility argument with zero new model spend.
- **Fix sketch**: Add a UI "proč tomu věřit / why you can trust this" panel that renders the existing `meta.prompt`, `meta.usage`, and `estCostUsd` per action (cs-CZ). Pure UI consuming already-emitted fields — non-gate-triggering.

## 3. The upgrade funnel is dark for the demo's primary (anonymous) audience
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/app/api/ai/route.ts:69 (vs :90-93)
- **Problem/Opportunity**: The only place that points at monetization — the Czech upsell message plus `upgradeUrl: "/cena"` — lives inside the *signed-in* quota-exceeded 429 (route.ts:67-73). Anonymous visitors, who are exactly the case-study's target, can only ever hit the IP-limit 429 (route.ts:90-93), which returns a generic "try again in N seconds" with no path to value. The conversion CTA is invisible to the people you most want to convert.
- **Why it matters**: Monetization is already built (`/cena`, "přejděte na vyšší plán"), so this is a real funnel gap, not a hypothetical one — the demo generates intent and then drops it on the floor.
- **Fix sketch**: After N successful generations, or on the anonymous rate-limit 429, surface a soft "tohle je ukázka — chcete to na svých datech? → /cena / nezávazná konzultace" CTA. Cleanest server-side spot is the `tooManyRequests` call in route.ts (**gate-triggering** — route.ts is hashed); a client-side CTA keyed off generation count avoids the gate entirely (preferred).

## 4. Gemini's default `temperature ?? 1.0` contradicts the grounded-output design
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/llm/gemini.ts:40
- **Problem/Opportunity**: `runGemini` defaults to `temperature: args.temperature ?? 1.0` with no recorded reasoning. The premise of most tools is "vymyslíš si žádné metriky" / strictly grounded output — `analysis.ts` deliberately passes `0.4` and comments why. But the *provider default*, if any present or future tool omits temperature, is maximum-creativity 1.0 — the opposite of what the grounded tools need. The default is an undocumented magic number that silently fights the system's own anti-hallucination goal.
- **Why it matters**: A tool author who forgets to set temperature gets the most embellishment-prone setting on data-grounded output, exactly where faithfulness matters most; the choice deserves an explicit rationale or a safer default.
- **Fix sketch**: Lower the default to a conservative value (e.g. 0.4–0.6) or make `temperature` required, with a one-line comment explaining the grounded-output rationale. **Gate-triggering** — `src/lib/llm/*` is hashed.

## 5. The error envelope is inconsistent and untyped while success is strictly typed
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/app/api/ai/route.ts:112 (also :67-73, :105, :164, :168-170; rate-limit.ts:129-138)
- **Problem/Opportunity**: Success responses are the typed `AiResponse<T>`, but errors ship in at least four ad-hoc shapes: `{error}` (400/422/502/413), `{error, retryAfter}` (IP 429), and `{error, upgradeUrl}` (quota 429). There is no documented `AiError` contract or status→shape mapping, so every client must hand-parse a free-text `error` string and guess which extra fields exist. The cs-CZ messages are also embedded literals with no error codes, making them un-i18n-able and un-branchable on the client.
- **Why it matters**: Undocumented response contracts are a classic source of brittle client handling and silent UX regressions; one typed envelope makes the privileged endpoint's failure modes explicit and testable.
- **Fix sketch**: Add a typed `AiError` union in `ai-types.ts` (`{ code: 'invalid'|'rate_limited'|'quota'|'too_large'|'failed', message: string, retryAfter?: number, upgradeUrl?: number }`) — the type itself is non-gate (src/lib/, not hashed). Wiring the `code` field into the responses touches route.ts (**partially gate-triggering**); the type + a documented status table can land without editing hashed files.
</content>
</invoke>
