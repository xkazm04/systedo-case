# Feature Scout Fix Wave 1 — "Wire what's already built"

> 6 commits, 6 findings closed (one per module).
> Baseline preserved: tsc 0 → 0 · unit tests 7/7 → 7/7 · `next build` pass → pass · 0 regressions.
> Branch: `vibeman/feature-scout-wave1` (off `master`). The user's pre-existing
> uncommitted work (README, next.config, package*, dev-inspector) was left untouched.

## Theme

Every fix in this wave realizes a module's *promised headline capability* by
connecting machinery that already existed in the repo but was wired nowhere — the
dominant finding of the scan. No new server-side LLM tool was added, so the
repo's `llm-gate` pre-commit hook stayed on its cached pass (no real-Claude run).

## Commits

| # | Commit | Module | Finding | Files |
|---|---|---|---|---|
| 1 | `f05ae2c` | local | local.md #1 | `LocalModule.tsx`, `lib/local/compute.ts` |
| 2 | `a99f9ed` | content-engine | content-engine.md #1 | `ContentEngineModule.tsx`, `DecayTable.tsx` (new) |
| 3 | `7a8e024` | compare-seo | compare-seo.md #1 | `CompareSeoModule.tsx`, `CompareSeoTable.tsx` (new), `srovnani-seo/page.tsx` |
| 4 | `1d16660` | catalog | catalog.md #1 | `CatalogModule.tsx` |
| 5 | `f036623` | distribution | distribution.md #3 | `DistributionModule.tsx`, `lib/distribution/handoff.ts` (new) |
| 6 | `fda0a56` | speed-lead | speed-lead.md #2 | `SpeedLeadModule.tsx` |

## What was fixed

1. **Local — service×location rank grid.** `LocalTarget.rank` was captured in the data model but never rendered. Added a matrix coloring each cell by SERP position (TOP 3 / 4–10 / 11+ / chybí), a `coveredButWeak` rollup (`hasPage && rank > 10`) in `compute.ts`, and a "Slabé pozice" KPI tile. The gap table is preserved.
2. **Content-engine — „Obnovit" handoff.** The decay table was read-only; the footer told users to refresh manually. A new `"use client"` `DecayTable` child adds a per-row „Obnovit" button that seeds a `BriefSeed` to `sessionStorage` and routes to Obsah — reusing the exact keyword→brief bridge.
3. **Compare-seo — query→brief handoff.** The only outbound action was a static empty link. A new `CompareSeoTable` child gives each row an intent-aware "Vytvořit obsah" action (vs → srovnání, alternative → alternativy, pricing → ceník, review → recenze) that seeds the brief and routes to Obsah. Removed the now-dead `projectId` prop (the table resolves it via `useProject`).
4. **Catalog — AI ad-copy wiring.** The fully-built `ads` AI tool was unused. Added a "Generovat AI texty" button per SKU calling `useAiTool<AdResult>("ads")`, rendering AI headlines/descriptions/callouts/keywords through the existing `AssetSection`/`AssetChip` layout, with the deterministic `buildAssetGroup` kept as the offline/loading/error fallback. Client-only wiring — no hashed LLM file touched.
5. **Distribution — copy/edit/push-to-social.** Each variant rendered in a dead `<pre>`. Replaced with an editable textarea (live `délka/max` counter + over-budget trim), a Kopírovat button, and a "Naplánovat na {platform}" button that drafts a `SocialPost` via `POST /api/social/posts` and routes to Social. New `handoff.ts` maps Distribuce channels → `SocialPlatform` (Newsletter & X have no Social target → button hidden).
6. **Speed-lead — live SLA countdown.** SLA never ticked. Added a per-lead live countdown (one shared 1s interval; arrival pinned via a lazy `useState` initializer) with on-track / warning (≤60s) / breached states, a header escalation strip when any lead breaches, and breached-leads-pinned-to-top sorting.

## Verification (before → after)

| Gate | Baseline | After Wave 1 |
|---|---|---|
| `tsc --noEmit` | 0 errors | **0 errors** |
| `next build` | pass | **pass** (all 6 routes build) |
| `npm run test:unit` | 7/7 | **7/7** |
| `eslint` (changed files) | — | **0 errors** |

## Patterns established (catalogue)

1. **Wire-the-seam beats build-from-zero.** The highest-value features were 1-file client wirings of code that already existed (an AI tool, a sessionStorage bridge, an unused data field). Grep for "documented-but-unimplemented" footer hints — they mark these directly.
2. **Server→client split via a co-located child.** To add interactivity to a server-component module, extract just the interactive part into a `"use client"` sibling (`DecayTable`, `CompareSeoTable`) and keep the rest server-rendered, rather than flipping the whole page to client.
3. **`BriefSeed` cross-module bridge is reusable verbatim.** `sessionStorage[briefSeedKey(project.id)]` + `router.push('/app/${id}/obsah')` is the canonical "send work to another module" pattern; populate only existing `BriefSeed` fields to avoid touching the shared type.
4. **This repo enforces React-Compiler lint rules.** `react-hooks/refs` + `react-hooks/purity` forbid reading a ref or calling `Date.now()` *during render*. Pin once-at-mount values with a **lazy `useState` initializer**, not `if (!ref.current) ref.current = …`.
5. **The `llm-gate` hook hashes a fixed file set** (`src/lib/llm/*`, `src/lib/ai/tools/*`, `src/app/api/ai/route.ts`, `test-llm/*`). Touching any of them triggers a real-Claude pre-commit run. Wiring an *existing* tool from the client avoids this; *adding* a tool requires a `// llm-tool:` tag + `test-llm/registry.mjs` entry and a working Claude CLI.
6. **Czech UI text needs curly quotes in JSX.** A straight `"` in JSX text trips `react/no-unescaped-entities`; use „ … " (U+201E / U+201C).

## What remains (next waves, per INDEX)

- **AI-assist wave** (deferred from this wave due to the llm-gate): distribution #1 (AI repurpose), speed-lead #1 (AI reply), local #2 (review-response drafting), content-engine #2 (cluster map) — each needs a new server LLM tool + coverage test + a verified Claude CLI.
- **Cross-module handoffs** (Theme B): keywords→brief depth, ship-the-winner, audience/speed-lead NextSteps.
- **Analytical correctness** (Theme D): LP sample-size gate, per-channel CAC, POAS simulator.
- **Real integrations** (Theme E), **Alerts/trends** (Theme F), **Settings/admin** (Theme G).
