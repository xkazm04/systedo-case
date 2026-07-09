# SEO, Keyword & Content Workspace

> Context #3 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 1, Medium: 2, Low: 1)
> Files read: 9

## 1. Hand-rolled weight persistence reinvents `usePersistedForm` — and reintroduces the exact hydration bug that hook exists to prevent

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/components/app/modules/CompareSeoTable.tsx:176-210,653,681-687`
- **Scenario**: `CompareSeoTable` is rendered from a real async server component (`src/app/app/[projectId]/srovnani-seo/page.tsx:16-35`, no `dynamic(..., { ssr: false })` anywhere in the chain) — so it is SSR'd, then hydrated. Its per-project score-tuning weights are restored via `const [weights, setWeights] = useState<ScoreWeights>(() => loadWeights(project.id))` (line 653), where `loadWeights` (lines 199-210) reads `window.localStorage` directly inside the lazy `useState` initializer. On the server, `typeof window === "undefined"` so it returns `DEFAULT_SCORE_WEIGHTS`; on the client's first (hydrating) render, `window` exists, so any returning user who previously tuned the "Ladění skóre" panel gets their *saved* weights immediately — a different value than what the server just rendered. The codebase already solved this exact problem: `src/components/ai/usePersistedForm.ts` restores via a **post-mount `useEffect`** specifically so "server render and first client render stay identical — no hydration mismatch" (its own doc comment, lines 18-23). `CompareSeoTable` doesn't use it and reimplements the unsafe lazy-init version instead.
- **Root cause**: The weight-tuning panel (`weightsKey`/`coerceWeights`/`loadWeights`, lines 176-210) was written standalone before/without reaching for the shared `usePersistedForm` hook that the AI-tool components in this same app already use for the identical "restore a per-key JSON blob from localStorage, tolerate corruption" need.
- **Impact**: Any returning user with saved weights hits a React hydration mismatch on every fresh load of `/app/[projectId]/srovnani-seo` (full reload, first visit in a new tab, or a hard navigation) — the scored/ranked rows, opportunity-tier pills, and summary cards briefly render with default weights, then flip to the saved ones as React discards the mismatched SSR subtree, alongside a hydration warning in the console. This hits the panel's core purpose: the whole feature exists to let a user "save weights for this project" (`tuningHint`: "Uloženo pro tento projekt").
- **Fix sketch**: Replace `weightsKey`, `loadWeights`, the lazy `useState` initializer (line 653) and the write-through effect (lines 681-687) with `usePersistedForm<ScoreWeights>(\`seo-weights:${project.id}\`, defaultWeights, { validate })`, where `validate` wraps the existing `coerceWeights` per-key `intent` merge logic (lines 178-197) as a type guard/coercer so partially-corrupt stored blobs keep behaving exactly as today (the hook's default no-validate path only does a *shallow* merge, which would silently drop this per-intent fallback — must not swap that in unchanged).

## 2. BriefSeed sessionStorage-and-route handoff duplicated verbatim across four owned modules

- **Severity**: High
- **Category**: duplication
- **File**: `src/components/app/modules/ClusterBuilder.tsx:124-136`
- **Scenario**: The identical three-step handoff — `sessionStorage.setItem(briefSeedKey(project.id), JSON.stringify(seed))` wrapped in a try/catch with the same "non-critical" comment, then `router.push(\`/app/${project.id}/obsahovy-engine\`)` — is implemented independently four times, all in files this context owns: `ClusterBuilder.tsx:124-136` (`briefFromCluster`), `CompareSeoTable.tsx:702-709` (`seedAndRoute`), `KeywordsModule.tsx:18-25` (`onCreateBrief`), and `OrganicChannels.tsx:229-241` (`createContent`). Each is a copy-paste of the same handoff with a different name and a different seed shape.
- **Root cause**: `src/lib/projects/brief-seed.ts` was factored out to share the sessionStorage *key* (`briefSeedKey`) but stopped short of sharing the write-and-navigate *behavior* around it, so every module that hands work off to the content engine re-wrote the wiring.
- **Impact**: Four copies mean four places to update if the route (`/obsahovy-engine`), the storage strategy, or the error handling ever changes (e.g. adding a toast on quota-exceeded, or switching routes when a new locale segment is added) — a change applied to three of four call sites and missed in the fourth is exactly the kind of silent drift this duplication invites.
- **Fix sketch**: Add a small client hook to `src/lib/projects/brief-seed.ts` (add `"use client"` — it's already only ever imported by `"use client"` modules) exporting `useBriefHandoff()` that returns a `seedAndRoute(seed: BriefSeed)` function built from `useRouter()` + `useProject()`/an explicit `projectId` arg, encapsulating the try/catch and `router.push`. Swap all four call sites to call it.

## 3. `LpVariantSeed.keywords` is a documented enrichment field with no producer — the consuming branch is permanently dead

- **Severity**: Medium
- **Category**: dead-code
- **File**: `src/components/app/modules/LpVariantIdeasPanel.tsx:67-68,78`
- **Scenario**: `LpVariantSeed.keywords` (line 68) is documented as "any additional keyword-ish phrases to ground the concepts", and `buildRequest` (line 78) has a live branch — `if (seed.keywords && seed.keywords.length > 0) req.keywords = seed.keywords;` — that forwards it to the `lp-variant-ideas` AI tool. A repo-wide grep for `LpVariantSeed` shows exactly one place constructs the array: `LpExperimentsModule.tsx:68-79`, whose object literal sets `id`, `cluster`, `status`, `controlLabel`, `controlCvr`, `losers` — never `keywords`. There is no other producer anywhere in `src/`, so `seed.keywords` is `undefined` on every call and the branch at line 78 never executes.
- **Root cause**: The field was added to the panel's request-building surface (alongside `losers`, which *is* wired end-to-end) as a planned enrichment — likely to carry the saved keyword-list terms into the "Suggest variants" prompt — but the producer side in `LpExperimentsModule.tsx` was never connected.
- **Impact**: Low runtime cost (a dead `if`), but it's a maintenance trap: a reader of `buildRequest` reasonably assumes keyword grounding is already wired end-to-end (it's positioned right next to `losers`, which is), so a future change nearby risks being built on top of a false assumption instead of noticing the gap.
- **Fix sketch**: Either wire a real producer — e.g. thread the project's saved `KeywordList` terms for the experiment's cluster into `LpExperimentsModule.tsx`'s `seeds` mapping — or, if that's out of scope for a pure refactor pass, delete the unused `keywords` field from `LpVariantSeed` (line 67-68) and the dead branch in `buildRequest` (line 78) until a producer exists.

## 4. `CompareSeoModule.tsx` is a pass-through wrapper that adds nothing over its own child's defaults

- **Severity**: Medium
- **Category**: structure
- **File**: `src/components/app/modules/CompareSeoModule.tsx:10-26`
- **Scenario**: `CompareSeoModule` forwards `queries`/`seoChannel` straight to `CompareSeoTable` and explicitly passes `defaultWeights={DEFAULT_SCORE_WEIGHTS}` (line 21) — but `CompareSeoTable` already declares `defaultWeights = DEFAULT_SCORE_WEIGHTS` as its own default parameter (`CompareSeoTable.tsx:639`), imported from the same `@/lib/seo-compare/compute` module. It also wraps the single child in `<div className="space-y-6">` (line 18), which is a no-op (`space-y-*` only affects spacing between 2+ siblings) given `CompareSeoTable`'s own root is already `<div className="stagger space-y-6">`. Both call sites — `src/app/app/[projectId]/srovnani-seo/page.tsx:33` and `src/components/demo/DemoModule.tsx:259` — pass only `queries` and `seoChannel`, so neither relies on the module for anything `CompareSeoTable` doesn't already do by itself.
- **Root cause**: Looks like a leftover composition layer from before `CompareSeoTable` grew its own `defaultWeights` default (per its doc comment, scoring used to live in the module and was later moved into the table so the tuning panel could re-rank live) — the shell was never removed once the table became self-sufficient.
- **Impact**: An extra file and an extra render layer with zero behavioral or visual difference — pure indirection a reader has to trace through for no payoff.
- **Fix sketch**: Delete `CompareSeoModule.tsx`. Update `src/app/app/[projectId]/srovnani-seo/page.tsx:6,33` and `src/components/demo/DemoModule.tsx:31,259` to import `CompareSeoTable` from `@/components/app/modules/CompareSeoTable` and render `<CompareSeoTable queries={queries} seoChannel={seoChannel} />` directly — output is identical.

## 5. Stale "DecayTable" references point at a component that no longer exists

- **Severity**: Low
- **Category**: cleanup
- **File**: `src/components/app/modules/ClusterBuilder.tsx:64-68`
- **Scenario**: Three doc comments in this context describe behavior as mirroring "DecayTable": `ClusterBuilder.tsx:64-68` ("...via the same sessionStorage seed + route handoff as DecayTable's \"Refresh\"..."), `ClusterBuilder.tsx:121-123` ("Reuse DecayTable's seed-and-route handoff for one generated cluster..."), and `CompareSeoTable.tsx:634` ("Mirrors KeywordsModule.onCreateBrief / DecayTable..."). A repo-wide search for `DecayTable` finds no such file or component anywhere in `src/` — the decaying-post table now lives inline inside `ContentEngine.tsx` (the `decaying`/`decayTitle` table, `ContentEngine.tsx:342-397`, with `seedFromDecay` at line 166), not as a separate `DecayTable` component.
- **Root cause**: `ContentEngine` was consolidated at some point (its own doc comment says "consolidation phase 5" territory), folding a formerly-standalone `DecayTable` component's markup and behavior into the module directly; the comments in the two sibling files that referenced it by name were never updated.
- **Impact**: Purely a documentation smell — a future maintainer grepping for `DecayTable` to understand "the same handoff" pattern referenced here will find nothing, and has to reverse-engineer that the comment now means "the decaying-content table inside `ContentEngine.tsx`."
- **Fix sketch**: Reword the three comments to point at the actual current location — e.g. "...the same sessionStorage seed + route handoff as ContentEngine's decaying-content row click (`ContentEngine.tsx:369`)."
