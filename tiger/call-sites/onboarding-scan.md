---
id: onboarding-scan
type: tiger/call-site
modality: text
file: src/lib/ai/tools/onboarding-scan.ts:197
wrapper: generateStructured ([[llm-wrapper]])
provider: claude (dev) / gemini (prod)
model: claude-sonnet (quality tier, no fast opt-in) / gemini quality tier
schema: yes — ONBOARDING_SCAN_SCHEMA, src/lib/ai/tools/onboarding-scan.ts:74
grounding: 7/8
code_score: 5
quality_score: "—"
recommended_model: "—"
status: assessed
last_scanned: 2026-07-15
characters: []
---
## What it does
`generateOnboardingScan` (onboarding-scan.ts:192-210) extracts a structured business profile (businessName, summary, offering, audience, toneOfVoice, keywords, competitors, suggestedType) from a new user's homepage → seeds competitors + profile that every grounded module reads. Entry: `POST /api/ai` case `"onboarding-scan"` (route.ts:553-588); UI `OnboardingModule.tsx`; apply/seed `src/lib/onboarding/seed.ts`.

## Prompt & grounding
**CRITICAL resolved: real fetched page text reaches the prompt — NOT a URL-only hallucinator.** The route fetches the homepage server-side via `fetchSiteText(p.value.url)` (route.ts:571) → SSRF-guarded `fetchFeed` → tag-stripped, entity-decoded, 8000-char-capped plain text (site-fetch.ts:51-77). Injected as `pageText: site.text` (route.ts:581) → rendered under `TEXT STRÁNKY:` via `digest(txt(req.pageText), 6000)` (onboarding-scan.ts:63-68). Client never supplies content (route.ts:565-568); fetch failure → 422 (572-575); <40 chars rejected (576-578). Plus `siteTitle`/`siteDescription` from the page's own `<title>`/meta (route.ts:582-583). System anti-fabrication `antiFabrication("předaného textu stránky")` (:31).
**Grounding 7/8:** businessName, summary, offering, audience, toneOfVoice, keywords, suggestedType all derivable from injected text/title. Only `competitors` is inherently model-knowledge — but honestly framed as SUGGESTIONS the user confirms, capped 0-5, "if unsure return empty", "never assert facts/numbers about competitors" (:39,88-90). The one weakly-grounded field is correctly labeled + bounded.

## Code quality (wrapping · logging · caching)
- Chokepoint `generateStructured` (:197) w/ schema + `normalize` (:149-170, coerces fields, caps keywords@10/competitors@6, constrains suggestedType to `PROJECT_TYPES`) + `validate` re-prompt (:176-190, flags hollow profile/empty keywords) + deterministic `demo()` (:123-147). temperature 0.4 (:203).
- Security: auth-gated (401 if `!userId`, route.ts:557-562) so anonymous callers can't use the server as a fetch proxy; SSRF guard inherited (site-fetch.ts:1-5).
- Telemetry via wrapper. Caching `cachedRespond("onboarding-scan", p.value, …)` keyed on client value (url/type/brand), NOT the fetched text (route.ts:585) — correct, text isn't client-stable.

## Findings
- **value (resolved, none)** — the prime risk for this op class (hallucinating a profile from a bare URL) does NOT apply here: real page text is fetched + injected (site-fetch.ts:74-77 → route.ts:581 → onboarding-scan.ts:66). [[2026-07-15-scan]]
- **model (low)** — tier is "quality", not "fast", for a short structural extraction from supplied text (peers keyword-clusters/repurpose opt fast). Plausible fast-tier candidate — but it also infers `suggestedType` + drafts tone/keywords, so quality-score before switching. Cost/latency only. [[2026-07-15-scan]]
- **code (nit)** — digest cap 6000 (onboarding-scan.ts:66) < fetch cap 8000 (site-fetch.ts:67): last ~2000 chars of a long homepage never reach the model. Harmless (homepages front-load identity). [[2026-07-15-scan]]
