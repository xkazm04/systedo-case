# Social Command Center & Speed-to-Lead Response

> Context #52 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 3, Medium: 1, Low: 1)
> Files read: 10

## 1. `firstName` re-implemented three times with diverging whitespace handling

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/speed-lead/draft.ts:14`
- **Scenario**: Three separate "first name from full name" extractors exist across this context's own files, and two of them disagree on malformed input. `src/lib/speed-lead/draft.ts:14` does `name.split(" ")[0] ?? name`; `src/lib/speed-lead/snippets.ts:24` does `name.trim().split(/\s+/)[0] || name`; `src/lib/social/draft.ts:87` inlines a third variant, `message.author.split(" ")[0] || "díky"`. For a name with leading/trailing or doubled whitespace (plausible once `InboundLead` is filled from a real form/call/email/chat webhook per `sample.ts`'s own "real-integration seam" note, rather than the hand-typed `SAMPLE_LEADS`), `draft.ts`'s version returns `""` (the greeting becomes "Dobrý den, ,") while `snippets.ts`'s version correctly returns "Jana". `?? name` never rescues this because `split(" ")` always returns a non-null array, so the empty-string case silently slips through.
- **Root cause**: The same small helper was written inline three times instead of factored once, each time with a slightly different guess at whitespace normalization.
- **Impact**: A lead whose name has incidental whitespace gets a broken greeting ("Dobrý den, ,") in the SLA-timed auto-reply draft, while the snippet-expansion path for the same lead renders correctly — an inconsistency a rep would only notice by comparing the two side by side.
- **Fix sketch**: Keep the `snippets.ts:24` implementation (trim + split on `\s+`, correct fallback) as the single source, export it from `src/lib/speed-lead/snippets.ts` (or lift it beside `SLA_TARGET_MIN` in `draft.ts` since both modules already import from each other's neighborhood), and have `speed-lead/draft.ts:14` and the inline `social/draft.ts:87` call it instead of reimplementing.

## 2. `scoreTone` is a byte-identical, hand-synced duplicate of `LeadQualityModule`'s

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/speed-lead/qualification.ts:58-64`
- **Scenario**: `qualificationScore`'s tone mapper is defined here as `if (score >= 60) return "positive"; if (score >= 40) return "coral"; return "negative";` — and the exact same three-line function (same thresholds, same `PillTone` values) is separately defined in `src/components/app/modules/LeadQualityModule.tsx:114-118`. The comment on `qualification.ts:58-59` even says "mirroring `scoreTone` in LeadQualityModule so the two qualification surfaces read the same colours" — i.e. the duplication is *intentional and self-admitted*, maintained by convention rather than by the compiler.
- **Root cause**: `speed-lead` and `lead-quality` are separate feature contexts that both need a 60/40 score-to-Pill-color band, and each grew its own copy rather than sharing one.
- **Impact**: Whoever changes the qualification thresholds or color bands in one file (e.g. tightening "hot lead" to ≥70) has to remember to hand-edit the other, unenforced by any test or type — exactly the "two implementations disagree" landmine this scan is told to watch for, just not triggered yet.
- **Fix sketch**: Move `scoreTone` next to `PillTone` in `src/components/ui.tsx` (both call sites already import `PillTone` from `@/components/ui`, so this adds no new module edge) and have `speed-lead/qualification.ts` and `LeadQualityModule.tsx` both import it instead of defining it locally.

## 3. `clamp`/`cap` reimplemented locally instead of reusing `ai/tools/_shared.ts`

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/social/draft.ts:13-15,31-33`
- **Scenario**: `draft.ts` defines its own `clamp(s, n)` (truncate + `…`) and `cap(s)` (capitalize first letter). Both are byte-identical to `export const clamp` and `export const cap` in `src/lib/ai/tools/_shared.ts:16-17,44` — the shared pure-string-utility module this very feature's AI counterpart, `src/lib/ai/tools/social.ts:20`, already imports from (`import { clamp, txt } from "./_shared"`). `_shared.ts` is the established pattern: 15+ other tool files under `src/lib/ai/tools/` already pull `clamp`/`cap`/`txt` from it instead of redefining them.
- **Root cause**: `social/draft.ts` predates or was written independently of the AI-tools convention and never reached for the shared helper.
- **Impact**: No behavior difference today, but two copies of the truncation/capitalization rules for social captions now exist; a future tweak to `_shared.ts`'s ellipsis character or capitalization rule (e.g. for a new platform) silently won't apply to the deterministic caption path in `draft.ts`.
- **Fix sketch**: In `src/lib/social/draft.ts`, delete the local `clamp` (13-15) and `cap` (31-33) and add `import { clamp, cap } from "@/lib/ai/tools/_shared";`, matching the import style already used by `src/lib/ai/tools/social.ts`.

## 4. `SOCIAL_PLATFORM_VALUES` is an unused re-export

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/lib/social/store.ts:117`
- **Scenario**: `export const SOCIAL_PLATFORM_VALUES = SOCIAL_PLATFORMS;` re-exports the platform tuple under a second name. A repo-wide grep for `SOCIAL_PLATFORM_VALUES` finds only this definition — no import anywhere in `src/`. Every consumer that needs the platform list already imports `SOCIAL_PLATFORMS` directly from `./types` (as `store.ts` itself does on line 8).
- **Root cause**: Looks like a leftover alias from an earlier refactor of the store module, never wired to a caller and never removed.
- **Impact**: Small, but it's a second public name for the same value living in the store module — a future reader has to check both `SOCIAL_PLATFORMS` (types.ts) and `SOCIAL_PLATFORM_VALUES` (store.ts) to confirm they're the same list before trusting either.
- **Fix sketch**: Delete line 117 from `src/lib/social/store.ts`. No import sites to update.

## 5. Dead `if (socialConfigured())` branch in `publishPost`

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/lib/social/publish.ts:21-25`
- **Scenario**: `publishPost` has `if (socialConfigured()) { // TODO: real Graph/LinkedIn publish...  }` — the branch body is only a comment; both branches fall through to the same unconditional `return { ok: true, ... }` below it. The condition currently has no effect on control flow.
- **Root cause**: Placeholder scaffolding for the not-yet-implemented real publish call, left as a live `if` instead of a comment above the function.
- **Impact**: Purely cosmetic today — a reader has to trace through the empty branch to confirm it does nothing, which costs a moment of "wait, is this actually a no-op?" every time the file is read.
- **Fix sketch**: Replace the `if (socialConfigured()) { /* TODO */ }` block with a plain comment above the `return` (or above the function), e.g. move the TODO text to sit next to the existing file-header TODO note, and drop the conditional.

