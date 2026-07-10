# AI Content & Marketing Tools

> Total: 5
> Critical: 0 · High: 1 · Medium: 3 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Saving A/B variant performance without editing a field silently zeroes the previously entered metrics

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/ai/AdExperiments.tsx:102`
- **Scenario**: A variant already has real performance saved (`v.metrics` populated → CTR/CR/CPA/ROAS render at line 202-208). The user opens the `<details>` "Upravit výkon" (Edit performance) panel to look at the numbers. The inputs correctly pre-fill from `m = draft[v.id] ?? v.metrics ?? EMPTY_METRICS` (line 170, 223). But `draft[v.id]` is only populated by `setField` on an actual `onChange`. If the user clicks "Uložit výkon" (Save) without changing any field — or after typing then deleting back to the original — `saveMetrics` runs `const metrics = draft[variantId] ?? EMPTY_METRICS` (line 103) and PATCHes `{ impressions:0, clicks:0, conversions:0, cost:0, convValue:0 }`, overwriting the real figures with zeros. The winner (`exp.winnerVariantId`), CTR/CR/CPA/ROAS and `hasPerformanceBasis(exp)` all flip back to the strength-only basis on the next `load()`.
- **Root cause**: The save path falls back to `EMPTY_METRICS` when no in-session edit was made, instead of falling back to the row's existing persisted `v.metrics` (which the display path already uses). The draft map is treated as "the full metrics to save" when it is really "the diff the user typed this session".
- **Impact**: Silent data loss of manually entered campaign performance; the experiment's ROAS-based winner reverts to the predicted-strength winner, so the "measurable optimization loop" the panel advertises quietly resets to guesswork.
- **Fix sketch**: In `saveMetrics`, resolve against the current variant metrics, not `EMPTY_METRICS`: look up the variant (`exp.variants.find(v => v.id === variantId)?.metrics`) and use `draft[variantId] ?? existing ?? EMPTY_METRICS`. Alternatively seed `draft[variantId]` from `v.metrics` when the `<details>` opens so the draft always carries the full record before a save.

## 2. Restoring a past article-draft generation keeps the inserted hero/figures pinned to the previous draft's block indices

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: state-corruption
- **File**: `src/components/ai/ArticleDraftPanel.tsx:284`
- **Scenario**: `hero` and `fills` (figures keyed by block index, line 284-285) are cleared only in `onGenerate` (line 339-340). But `ResultMeta` is wired with `onRestore={restore}` (line 420), and each generation/`refine` appends a history entry (via `useAiTool`'s `pushHistory`), so a 2+ entry history strip appears. When the user inserts an image into placeholder block #3 of draft A, then generates/refines to produce draft B, then clicks the history chip to `restore` draft A, `restore()` swaps `data` but never resets `hero`/`fills`. `composeBlocks`/`DraftPreview` now apply `fills[3]` against draft B-vs-A's block #3: if that index isn't a `figure` in the restored draft the image is silently dropped (line 152-155), and if it happens to be a figure the wrong picked image/caption (from the other draft) is rendered and baked into the `.md`/`.json` exports.
- **Root cause**: Inserted-imagery state lives outside the tool's data lifecycle and is only invalidated on a fresh `onGenerate`, not on the other two paths that change `data` (`restore` and the hook's history hydration on mount).
- **Impact**: Exported/previewed article contains images mapped to the wrong paragraphs or missing images the user inserted — user-visible wrong output in the deliverable.
- **Fix sketch**: Reset `setHero(null); setFills({})` inside the restore handler (wrap `restore` in a local `onRestore` that clears imagery first), or key `fills` by a stable block identity rather than array index and drop entries whose block no longer exists in the active `draft`.

## 3. Content-brief draft persists under a non-project-scoped key, leaking drafts across workspaces

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/components/ai/ContentBriefGenerator.tsx:360`
- **Scenario**: `usePersistedForm<BriefRequest>("brief", …)` uses the constant key `"brief"` even though `useOptionalProject()` is in scope (used at line 353 for `host`). `usePersistedForm` write-throughs every change to `systedo.ai.form.brief`. AdGenerator, for the same class of data, deliberately scopes its key: `usePersistedForm<AdRequest>(pid ? \`ads.${pid}\` : "ads", …)` (`AdGenerator.tsx:467`) with the comment "Keyed per project so drafts don't leak between workspaces." Because the brief tool ignores `pid`, opening the brief generator under project A, typing a topic/primary-keyword/audience, then switching to project B's brief surface restores project A's draft (topic + keyword + audience — potentially client-identifying). The same global slot is also shared with the public `/ai-asistent` instance.
- **Root cause**: Inconsistent persistence-key convention — the Ad tool learned to namespace by `pid`; the brief tool (and the grounding keywords beside it) was never updated, so it silently cross-contaminates per-tenant draft content.
- **Impact**: Cross-workspace/tenant leakage of in-progress brief content via localStorage; a stale draft from another client's project surfaces in the current one.
- **Fix sketch**: Mirror AdGenerator: `usePersistedForm<BriefRequest>(pid ? \`brief.${pid}\` : "brief", …)`. Audit the sibling unscoped keys (`ContentPipeline`'s `"pipeline"`, `PerformanceAnalyst`'s `"analysis.period"`) for the same class of leak.

## 4. AdGenerator's "Added to A/B test" confirmation persists onto a brand-new, unsaved ad

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/components/ai/AdGenerator.tsx:475`
- **Scenario**: `saveVariant` sets `abState` to `"saved"` on success (line 531), which renders the collapsed button as a green check + "Přidáno do A/B testu" / "Added to A/B test" (line 763-766). `abState` is never reset when a new generation arrives: the `edited`-reseeding effect keys on `generated` (line 499-502) but leaves `abState` alone, and `run`/`reset` don't touch it. So after saving a variant and then generating a completely different ad (or restoring a history entry), the button still reads "Added to A/B test" even though nothing was saved for the new ad.
- **Root cause**: `abState` is treated as a one-shot outcome flag but is scoped to the component, not to the specific generation it described; it isn't invalidated when the underlying `data`/`generated` changes.
- **Impact**: Success theater — the user believes the currently displayed ad is already in an A/B test when it is not, so a variant they meant to compare is never saved.
- **Fix sketch**: Reset `setAbState("idle"); setAbOpen(false)` in the `[generated]` effect (alongside `setEdited(generated)`), so the confirmation is cleared whenever the shown generation changes.

## 5. `fileUrl` image-file-URL helper is duplicated verbatim across CreativeStudio and ArticleDraftPanel

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: duplication
- **File**: `src/components/ai/CreativeStudio.tsx:178`
- **Scenario**: Both panels define the identical closure `const fileUrl = (id: string) => pid ? \`/api/images/file/${id}?projectId=${encodeURIComponent(pid)}\` : \`/api/images/file/${id}\`` — `CreativeStudio.tsx:178-179` and `ArticleDraftPanel.tsx:294-295` — to build the auth-gated creative-asset URL with the optional `projectId` query. Not covered by the 2026-07-09 code_refactor report (which flagged `StepStatus`, the ROAS inline, the metrics-entry form, the third `slugify`, and dead `TextRow` — none touch this helper). Grep confirms these are the only two definitions; the route path shape appears nowhere else.
- **Root cause**: The article panel needs the same creative-file URL the studio already builds, and each component reached for a local closure rather than a shared helper.
- **Impact**: Low today (identical), but the `projectId` query contract for the creative-file route now lives in two places; a change (e.g. adding a size/format param or a signed token) must be made in both or the two surfaces diverge.
- **Fix sketch**: Extract `creativeFileUrl(id: string, pid?: string)` into a shared module (e.g. `@/lib/images/types` alongside the `CreativeSummary` type both already import, or a small `images/urls.ts`) and call it from both panels.
