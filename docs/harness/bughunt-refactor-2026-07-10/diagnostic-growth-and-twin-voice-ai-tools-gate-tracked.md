# Diagnostic, Growth & Twin-Voice AI Tools (gate-tracked)

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Lead-source severity is derived from the demo's independent cause, not the diagnosis actually shown

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/ai/tools/lead-source-diagnosis.ts:159`
- **Scenario**: `normalizeLeadSourceDiagnosis` sets `const severity = coerceSeverity(o?.severity) ?? fallback.severity ?? severityFor(likelyCause)`. `fallback` is `demoLeadSourceDiagnosis(req)`, whose `severity` is `severityFor(pickCause(req))` — the *deterministic* cause, computed independently of the model. When the model returns a valid `likelyCause` (say `"spam"`, which `severityFor` maps to `"high"`) but **omits** the optional `severity` field, `coerceSeverity(o?.severity)` is `undefined`, so severity falls to `fallback.severity`. If the deterministic `pickCause(req)` disagreed and returned e.g. `"ok"`/`"volume"` (→ `"low"`), the card shows a **green "low" severity pill next to a "spam" root-cause** (rendered at `LeadSourceDiagnosisPanel.tsx:218-220` via `SEVERITY_TONE[r.severity]`). Because `fallback.severity` is always defined, the third branch `severityFor(likelyCause)` — the one that would derive severity from the cause actually displayed — is **dead code and never runs**.
- **Root cause**: The fallback chain treats the deterministic demo as the source of truth for severity, instead of deriving severity from the `likelyCause` the normalizer just decided to show. `pickCause` and the model can legitimately diverge (thresholds are heuristic mirrors, not identical), and the model is told `severity` is optional.
- **Impact**: User-visibly contradictory diagnosis — a high-risk "spam" source badged low (or vice-versa), which is exactly the signal this tool exists to make trustworthy. Wrong prioritization of which lead source to fix first.
- **Fix sketch**: Reorder so the shown cause drives severity when the model is silent: `const severity = coerceSeverity(o?.severity) ?? severityFor(likelyCause);`. Drop the `fallback.severity` middle term entirely (it's the one causing the mismatch, and `severityFor(likelyCause)` is total). Gate: touches only `lead-source-diagnosis.ts` (individually tagged/hashed) — re-proves just that one tool, not a full run.

## 2. Cohort diagnosis pairs the model's `worstCohort` with the demo's differently-chosen cohort in `summary`/`risks`

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/lib/ai/tools/cohort-diagnosis.ts:123`
- **Scenario**: In `normalizeCohortDiagnosis`, `worstCohort` keeps the model's pick whenever it names any real cohort label (`labels.has(rawWorst) ? rawWorst : fallback.worstCohort`, line 123). But `summary` (line 127) and `risks` (lines 125,131-132) fall back to `fallback.summary`/`fallback.risks` when the model leaves them empty — and `fallback` is `demoCohortDiagnosis(req)`, which hard-codes the **deterministically lowest-LTV:CAC cohort** (`worstCohortOf`) into its prose (`Kohorta ${worst.month} má LTV:CAC …`, lines 187-192,196). The model is free to name a *different* valid cohort as worst (e.g. one with a missing payback rather than the strictly lowest ratio). Result: a card whose headline `worstCohort` says `2025-03` while its risk bullets and/or summary talk about `2025-01`.
- **Root cause**: `worstCohort` is sourced from the model but the same-record `summary`/`risks` floors are sourced from an independently-computed demo that embeds its *own* worst-cohort choice — the two are never reconciled.
- **Impact**: Internally inconsistent diagnostic naming two different cohorts as "the problem" in one card — erodes trust and can misdirect the founder's fix to the wrong cohort. No crash.
- **Fix sketch**: When the model's `worstCohort` differs from `fallback.worstCohort`, don't borrow the demo's cohort-specific `summary`/`risks`. Simplest: recompute the demo against the chosen cohort, or drop the demo `risks`/`summary` floor entirely when `worstCohort !== fallback.worstCohort` (leave `risks` absent, `summary` a neutral one-liner). Gate: only `cohort-diagnosis.ts` re-proved.

## 3. Twin-style overwrites the existing trained voice with directives its own validator rejected

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/ai/tools/twin-style.ts:167`
- **Scenario**: `validate` requires `directives` be ≥ 40 chars ("Pole „directives" je prázdné nebo příliš krátké", line 181) — the wrapper re-prompts once on violation. But after that single retry, `normalize` runs on whatever came back and does `directives: directives || demo.directives` (line 167), where `demo.directives = txt(req.current)` (the *existing* saved voice, line 150). The guard only rescues the **empty** case: a non-empty-but-sub-40-char directives (e.g. 15 chars the validator flagged) is truthy, so `||` keeps it and it **replaces** the good `req.current` voice the training was meant to sharpen, not clobber (the file's own comment at lines 176-177 warns "the UI would happily save over a good one").
- **Root cause**: `normalize`'s floor uses truthiness (`|| demo.directives`) while `validate` uses a length threshold (≥ 40). The two disagree on what "usable directives" means, so a value the validator deemed inadequate still passes through as the result.
- **Impact**: A weak retrain silently degrades a previously-good brand voice — every downstream twin-reply/social/repurpose then generates against thinner directives. Data (the trained voice) effectively lost with no error surfaced.
- **Fix sketch**: Mirror the validator's threshold in `normalize`: `directives: directives.length >= 40 ? directives : demo.directives`. Gate: only `twin-style.ts` re-proved.

## 4. Keyword-clusters silently drops the unique keywords of any cluster whose pillar was already used

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/ai/tools/keyword-clusters.ts:210`
- **Scenario**: `normalizeKeywordClusters` shares one `used` set across all clusters (line 190). `accept()` returns `null` for a keyword already placed (line 203). The pillar is resolved first: `const pillar = accept(txt(x.pillar)); if (!pillar) continue;` (lines 210-211). If the model emits the **same pillar keyword in two clusters** (a common LLM slip — reusing a broad head term as pillar twice), the second cluster's `accept(pillar)` hits `used.has(key)` → `null` → `continue`, so the whole cluster is skipped **before its `supporting` list is ever read**. Any keyword that appeared *only* in that discarded cluster's `supporting` is now in no cluster at all — it silently vanishes from the output. The demo floor only triggers when `clusters.length === 0` (line 233), so with other clusters present there's no rescue.
- **Root cause**: Dedup-by-pillar drops the entire cluster on a duplicate pillar, conflating "this pillar is taken" with "this whole cluster is worthless" — but the cluster's supporting keywords may be unique and unplaced.
- **Impact**: Input keywords disappear from the clustering with no warning — the user's researched keyword silently omitted from the content plan (the tool's contract is "every input keyword lands in exactly one cluster"). Not a crash; a quiet data loss proportional to how often the model repeats a pillar.
- **Fix sketch**: When a cluster's pillar is already used, don't `continue` — instead promote the first still-unused `supporting` keyword to pillar (or fold the cluster's unused supporting keywords into the earlier cluster that owns that pillar). Gate: only `keyword-clusters.ts` re-proved.

## 5. Real partial LLM runs display the "sample output — connect an LLM" disclaimer

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/ai/tools/cohort-diagnosis.ts:127`
- **Scenario**: The deterministic demos are reused as the field-floor for empty model fields, and their `summary` strings are hard-suffixed with a "this is a canned demo" disclaimer: cohort `"… Ukázkový výstup — připojte LLM (Claude v devu, Gemini v produkci) pro diagnostiku od modelu."` (lines 161,200), lead-source `DEMO_TAIL` (line 189), channel-research (line 174), onboarding-scan (line 136). When a **real** provider runs but returns a valid diagnosis with an *empty* `summary` (validate re-prompts once; if still empty), `normalize` substitutes `fallback.summary` (e.g. cohort-diagnosis.ts:127 `txt(o?.summary) || fallback.summary`). The user — who has a working LLM connected — is then told the output is a sample and to "connect an LLM (Claude in dev, Gemini in prod)".
- **Root cause**: The demo string couples two responsibilities — the templated reading AND the "no model connected" disclaimer — so borrowing the demo as an empty-field floor leaks a false provenance claim into genuine (if partial) model output.
- **Impact**: Misleading provenance on a real run — the user distrusts a real diagnosis, or wastes time "connecting" an already-connected model. Low frequency (needs an empty field surviving the retry).
- **Fix sketch**: Keep the disclaimer out of the templated text — return it as a separate `isDemo`/`notice` flag the UI renders only on the true keyless path, and have the empty-field floor borrow only the neutral prose. Gate: touches the four named tool files; each individually re-proved (not a full run).
