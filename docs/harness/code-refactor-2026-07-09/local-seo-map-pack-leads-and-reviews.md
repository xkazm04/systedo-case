# Local SEO, Map Pack, Leads & Reviews

> Context #4 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 0, High: 3, Medium: 2, Low: 0)
> Files read: 11

## 1. Consolidate the duplicated AI-reply-draft flow in LocalReviews and ReviewInbox

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/LocalReviews.tsx:60-268`
- **Scenario**: `ReviewInbox.tsx:79-410` re-implements the same "AI review reply" flow almost line-for-line: a byte-identical `ratingTone` helper (`LocalReviews.tsx:60-64` vs `ReviewInbox.tsx:79-83`), the same `useAiTool<LocalReviewReplyResult>("local-review-reply")` state machine with the "apply the model's output once, during render" pattern (`activeId`/`appliedFor`/`aiReply`/`applyTag`: `LocalReviews.tsx:84-101` vs `ReviewInbox.tsx:152-166`), the same `suggest()` builder that pulls `promptSafeName(businessName)` and posts `{reviewText, rating, area, businessType?, businessName?}` (`LocalReviews.tsx:103-118` vs `ReviewInbox.tsx:176-188`), the same `copyDraft()` clipboard helper (`LocalReviews.tsx:120-130` vs `ReviewInbox.tsx:210-220`), and the same suggest-button / draft-textarea / error-retry / demo-badge JSX block (`LocalReviews.tsx:161-263` vs `ReviewInbox.tsx:320-404`). ReviewInbox's own header comment calls itself "a fuller reputation surface than the Lokální module's panel" — a superset that was built by copy-pasting LocalReviews rather than composing it.
- **Root cause**: ReviewInbox was grown as a bigger sibling of LocalReviews (same AI tool, same UX) instead of factoring the shared "AI reply for one review" concern into a hook/component both could use.
- **Impact**: Any change to the reply flow — a new AI-tool response field, an error-copy tweak, an accessibility fix on the suggest button — has to be made twice or it silently drifts. The `ratingTone` duplication is a live example of the drift risk: two files, zero shared source of truth for the same 3-line function.
- **Fix sketch**: Extract a `useReviewReplyDraft(businessType?, businessName?)` hook (owns `activeId`/`appliedFor`/`aiReply`/`applyTag`/`suggest`/`copyDraft`) plus a small `ReviewReplyEditor` presentational component (button + textarea + error/demo states) into a new co-located module, e.g. `src/components/app/modules/reviews/useReviewReplyDraft.ts` + `ReviewReplyEditor.tsx`; move `ratingTone` into the same module. Both `LocalReviews.tsx` and `ReviewInbox.tsx` import them; ReviewInbox keeps its own filter/sort/flag/answered/macros state layered on top.

## 2. One `rankTone` bucket function, copy-pasted four times

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/LocationsModule.tsx:93-98`
- **Scenario**: The identical "rank 1–3 → positive, 4–10 → negative(warning), 11+ → coral" mapping is defined independently in `LocationsModule.tsx:94-98`, `MapPackClient.tsx:53-57`, and `RankLadder.tsx:36-40` (same branching, differing only in a `PillTone` return-type annotation vs. `as const`), plus a fourth equivalent inlined inside `LocalModule.tsx`'s `rankCell` (`LocalModule.tsx:79-86`), which additionally handles the "no page yet" case.
- **Root cause**: Each module was built against its own local sample type (`LocationRow.mapRank`, `MapListing.rank`, `KeywordRank.current`, `LocalTarget.rank`) without anyone noticing the tone thresholds are one domain rule — local-search rank buckets — repeated per file.
- **Impact**: These four color buckets are the shared visual language for "how good is this rank" across the whole Local SEO / Map Pack cluster, which all render on adjacent dashboard tabs. Moving the "coral" cutoff from 11+ to, say, 16+ requires remembering all four call sites; today none of them reference a shared source, so a partial edit produces inconsistent Pill colors for the same underlying rank concept across modules a user can see side by side.
- **Fix sketch**: Add one exported `rankTone(rank: number): PillTone` in a small, dependency-free shared module — e.g. `src/lib/local/rank-tone.ts` — and import it from `LocationsModule.tsx`, `MapPackClient.tsx`, `RankLadder.tsx`, and from `LocalModule.tsx`'s `rankCell` (which wraps it with the "no page" neutral case).
- **Build risk**: `MapPackClient.tsx` is `"use client"` while `LocationsModule.tsx`, `RankLadder.tsx`, and `LocalModule.tsx` are server components. The shared helper must stay a pure function with no other imports (no `node:fs`/`server-only` transitively) — `tsc --noEmit` won't catch a boundary violation here, only `next build` will.

## 3. `LeadSourceSeed.cpql` actually holds the cost-per-*lead*, not the cost-per-*qualified*-lead

- **Severity**: High
- **Category**: structure
- **File**: `src/components/app/modules/LeadQualityModule.tsx:173-177`
- **Scenario**: When building the AI-diagnosis seed for an under-performing source, the code does `seed.cpql = r.cpl; seed.costPerQualified = r.cpql;` — the field literally named `cpql` is populated with `r.cpl` (plain cost-per-lead, `src/lib/lead-quality/compute.ts:27`), while the differently-named `costPerQualified` field gets the real cost-per-*qualified*-lead (`compute.ts:29`, also confusingly called `cpql` there). This is corroborated at the type level: `src/lib/ai-types.ts:940-941` documents the request's `cpql?: number` field with the JSDoc comment `/** cost per lead (CZK), when the source has spend */` — the codebase's own comment concedes the field named `cpql` means CPL. The consumer, `src/lib/ai/tools/lead-source-diagnosis.ts:62-64`, was written to match: it labels `req.cpql` as `"CPL (cena za lead)"` and `req.costPerQualified` as `"CPQL (cena za kvalifikovaný lead)"` in the prompt sent to the model, and reads the same inverted mapping again at lines 137 and 192. Both ends agree today (no live bug), but the name is inverted from what any new reader — or a future one-sided edit — would assume.
- **Root cause**: `LeadSourceSeed`/`LeadSourceDiagnosisRequest` grew two cost fields, `cpql` and `costPerQualified`, that read as synonyms for the same concept; the assignment in `LeadQualityModule.tsx` was written to match the (also mislabeled) consumer instead of the field's own name.
- **Impact**: The entire point of this AI tool is to reason about the *gap* between cheap-per-lead and expensive-per-qualified-lead — exactly the "junk source" definition used a few lines above in this same file (`LeadQualityModule.tsx:229-232`, `junkAlertPre` copy). A field named `cpql` silently carrying the cheaper `cpl` number is a landmine: the next person who "fixes" the naming in only one of `LeadQualityModule.tsx`, `ai-types.ts`, or `lead-source-diagnosis.ts` — or who adds a new caller of `LeadSourceSeed` trusting the field name — will feed the model (or the UI) the wrong number for the one metric this feature exists to diagnose.
- **Fix sketch**: Rename the misleading field to what it actually holds, `cpl`, end to end: `LeadSourceSeed.cpql` → `.cpl` (`LeadSourceDiagnosisPanel.tsx:80`, `LeadQualityModule.tsx:175`), `LeadSourceDiagnosisRequest.cpql` → `.cpl` in `src/lib/ai-types.ts:941`, and the three `req.cpql` reads in `src/lib/ai/tools/lead-source-diagnosis.ts` (lines 62, 137, 192). Leave `costPerQualified` untouched — it is already correctly named and correctly populated.
- **Gate impact**: the fix touches `src/lib/ai/tools/lead-source-diagnosis.ts`, which carries a `// llm-tool: lead-source-diagnosis` tag and is in `HASHED_FILES` — renaming the field there forces a real-model gate re-run via `scripts/llm-gate.mjs`.

## 4. `star` rating formatter duplicated despite a comment pointing at its own twin

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/components/app/modules/LocalModule.tsx:74-77`
- **Scenario**: `LocalModule.tsx:76-77` and `LocalReviews.tsx:56-57` define the identical helper `` const star = (r, fmtDecimal) => `${fmtDecimal(r, 1)} ★` ``. Both copies carry a doc comment naming the other file ("Mirrored in LocalReviews" / "Mirrored in LocalModule") — the duplication was noticed by whoever wrote it and left in place rather than extracted.
- **Root cause**: `LocalModule` renders `LocalReviews` as a child (`LocalModule.tsx:251-255`), but the two components were kept as separate owners of rating-formatting logic instead of sharing one helper.
- **Impact**: Small blast radius today (two lines), but combined with the `ratingTone` duplication in finding 1, it's the second confirmed instance of this exact pair of files never getting a shared "local review formatting" module — every future rating-display tweak (e.g. switching to a half-star icon, or a different decimal precision) needs the same edit made twice.
- **Fix sketch**: Move `star` into the shared review-utils module proposed in finding 1 (or a one-line `src/lib/local/format.ts` if that lands separately), and import it from both files; delete both local copies and their "Mirrored in…" comments.
- **Build risk**: `LocalModule.tsx` is a server component and `LocalReviews.tsx` is `"use client"`. `star` itself has no imports, so a shared module is safe as long as it stays dependency-free — don't fold it into a file that also pulls in server-only or client-only helpers.

## 5. SpeedLeadModule.tsx does four jobs in one 927-line client component

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/app/modules/SpeedLeadModule.tsx:1-927`
- **Scenario**: One component owns: (a) the live SLA countdown + response-time analytics band (`slaState`/`slaById`/`analytics`, lines 261-276, 464-483, 517-562), (b) AI reply generation via the `twin-reply` tool (`generateReply`, the aiReply/appliedReply apply-once pattern, lines 365-419), (c) BANT qualification capture with its own Czech-only option-label plumbing (`TIMELINE_OPTIONS_CS`/`BUDGET_OPTIONS_CS`/`SCOPE_OPTIONS_CS`/`DISPOSITION_OPTIONS_CS`, `describeQualification`, lines 221-259 and 803-895), and (d) a per-project `localStorage` snippet-template library (`loadSnippets`/`snippetsKey`/`insertSnippet`, lines 204-219, 329-346, 449-458, 744-763). None of the four needs the others' internals.
- **Root cause**: The module grew feature-by-feature — SLA tracking, then AI drafting, then qualification, then snippets — with no split as each concern was bolted on.
- **Impact**: Each concern is independently testable and independently likely to change (snippet-library UX vs. BANT fields vs. SLA thresholds are unrelated product surfaces), but today a change to any one requires reading and re-verifying the whole 927-line file, and raises the chance an edit to one concern accidentally touches shared local state (e.g. `selected`/`seededLeadId`) that another concern also depends on.
- **Fix sketch**: Extract `useLeadSla(leads)` (SLA/analytics state), `useSnippetLibrary(projectId)` (localStorage snippet CRUD), and a `LeadQualificationPanel` presentational subcomponent (the BANT selects + score pill) into sibling files under `src/components/app/modules/speed-lead/`; keep `SpeedLeadModule.tsx` as the composing shell plus the AI-reply wiring.
- **Build risk**: all extracted pieces stay `"use client"` (the whole module already is), so no client/server boundary is crossed by this split — just keep the new hook files themselves free of server-only imports, since they'd still be reachable from the client bundle.
