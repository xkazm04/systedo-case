# Feature Scout — Rychlá reakce (`/app/[projectId]/rychla-reakce`)

> Module: src/components/app/modules/SpeedLeadModule.tsx
> Project type: leadgen
> Total: 5 ideas

## 1. AI-generated, on-brand reply (replace the static template draft)
- **Category**: feature
- **Impact**: 9
- **Effort**: 4
- **Risk**: 4
- **Gap today**: `draftReply()` (src/lib/speed-lead/draft.ts:16-28) returns one hard-coded Czech paragraph with a generic salutation and three fixed qualification questions — identical for every lead. The file header itself names the unrealized seam: "Real-integration seam: the AI tools (/api/ai) for richer, on-brand replies." The textarea (`SpeedLeadModule.tsx:90-95`) only shows that static string.
- **Proposal**: Add a "Vygenerovat AI odpověď" action next to the textarea that calls `/api/ai` via the existing `src/components/ai/useAiTool.ts` hook (new `mode: "lead-reply"` in `src/lib/ai/tools/` + validation), passing the lead message, channel, and project type. Keep the deterministic `draftReply()` as instant fallback/initial value; AI refines it. Stream/replace into the existing textarea, with a Copy button (Copy icon already exists).
- **User value**: A reply tailored to the actual inquiry ("revize elektroinstalace 200 m²" vs "klimatizace 3+1") instead of a one-size template the user must rewrite — the difference between truly responding in 5 minutes and faking it.
- **Fit**: The whole product routes LLM through one server wrapper; this is the canonical AI feature this module advertises but never wired. `/api/ai` already has quota + rate-limit guards, so the plumbing is reused.

## 2. SLA breach alert + escalation banner with live countdown
- **Category**: functionality
- **Impact**: 8
- **Effort**: 3
- **Risk**: 2
- **Gap today**: SLA is a single static threshold `SLA_TARGET_MIN = 5` (draft.ts:7); `minutesAgo` is a frozen number from sample data (sample.ts), so nothing ticks. The header just counts `overdueCount` once (`SpeedLeadModule.tsx:23-37`) — no per-lead countdown, no warning before breach, no escalation. A lead can silently age out.
- **Proposal**: Add a per-lead live countdown ("zbývá 2:13" / "po SLA o 6 min") that ticks client-side from arrival time, with three states: on-track, warning (≤1 min left, coral), breached (negative). When `overdueCount > 0`, turn the header into an escalation strip ("X leadů po SLA — eskalovat?") with a primary action. Sort or pin breaching leads to the top of the inbox so the most urgent is always first.
- **User value**: Speed-to-lead is the entire promise of the module; a visible ticking clock and a pre-breach warning drive the user to act *before* the lead goes cold, not after.
- **Fit**: Directly amplifies the module's named purpose (the registry blurb is "SLA časovačem"). Pure UI/state work, no backend — low risk, high relevance.

## 3. Structured qualification capture + lead score (BANT-style)
- **Category**: feature
- **Impact**: 8
- **Effort**: 5
- **Risk**: 3
- **Gap today**: Qualification is three static display-only chips (`draft.questions`, draft.ts:26; rendered read-only at `SpeedLeadModule.tsx:99-107`). Nothing is captured, scored, or persisted; the answers can't influence priority or hand-off. Meanwhile the sibling `LeadQualityModule` already reasons about "kvalifikovaný lead" and CPQL — but this inbox produces no qualification signal to feed it.
- **Proposal**: Turn the chips into a small inline form (termín / rozpočet / rozsah, matching the existing questions) plus a hot/warm/cold disposition. Compute a lightweight qualification score and show it as a `Pill` (the `scoreTone` pattern from `LeadQualityModule.tsx:9-13` is reusable). Persist per-lead state alongside the `responded` set.
- **User value**: The rep qualifies while replying, in one place, and the lead carries a score downstream instead of being re-triaged later — fewer dropped balls, better follow-up prioritization.
- **Fit**: Closes the loop with `kvalita-leadu`: this module is where qualification data is *born*, that module is where it's *analyzed*. leadgen-core.

## 4. Reply snippets / template library with variables
- **Category**: feature
- **Impact**: 7
- **Effort**: 4
- **Risk**: 2
- **Gap today**: The only reply content is the single generated draft; there is no library of reusable openers/closers/answers. A user handling many similar inquiries (revize, montáž, servis, cenová nabídka — exactly the sample mix) retypes the same phrasing every time. No `{firstName}`-style variable expansion is exposed beyond what `draftReply` bakes in internally.
- **Proposal**: Add a snippet picker above/beside the textarea: a small set of named templates (e.g. "Cenová nabídka", "Termín návštěvy", "Roční servis") with `{jméno}` / `{kanál}` placeholders auto-filled from the selected lead. Inserting a snippet appends/replaces in the textarea. Store snippets as JSON-in-repo per project (matches the project's no-DB data pattern) so they're editable per workspace.
- **User value**: Sub-minute responses for the 80% of inquiries that are routine, while keeping the AI path (idea #1) for the unusual ones — the classic snippet+AI power-user combo.
- **Fit**: Standard speed-to-lead inbox feature; aligns with the JSON-in-repo data convention and the module's "respond fast" mandate.

## 5. Response-time analytics + downstream NextSteps wiring
- **Category**: user_benefit
- **Impact**: 6
- **Effort**: 4
- **Risk**: 2
- **Gap today**: The module shows only a live count of overdue leads (`SpeedLeadModule.tsx:24`); there is no measurement of *actual* response time, no SLA-hit-rate, no per-channel breakdown, and — unlike nearly every sibling module — it renders **no `NextSteps` strip** (`src/components/app/NextSteps.tsx`), so it dead-ends instead of routing to `kvalita-leadu` / `kampane`.
- **Proposal**: Add a compact analytics header band: median response time, % within SLA, and avg time by channel (`CHANNEL_LABELS`, sample.ts:15-20) — derived from arrival vs. responded timestamps captured when "Odeslat" is clicked. Below the inbox, add a `NextSteps` block linking to `kvalita-leadu` ("Posoudit kvalitu leadů podle zdroje") and `kampane` ("Optimalizovat zdroje s pomalou reakcí").
- **User value**: Turns a workqueue into a managed channel — the user sees whether the team actually hits SLA and which channels are slow, then jumps to the module that fixes the upstream spend.
- **Fit**: Adopts the project's cross-link convention this module skips, and feeds the leadgen analytics chain (`rychla-reakce` → `kvalita-leadu` → `kampane`).
