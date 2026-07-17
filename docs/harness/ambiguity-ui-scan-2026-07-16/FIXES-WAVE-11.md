# Fixes — Wave 11 (Organic visibility / SEO-content workspace / content pages)

Module-clustered tail wave over lib/brand, lib/content*, lib/organic-channels,
lib/distribution, the Content*/Cluster*/OrganicChannels modules and the content
app pages. **12 of 13 findings fixed, 1 skipped with reason.**

## Commits

| Commit | Scope | Findings |
| --- | --- | --- |
| `69864b4` | `fix(brand)` — aggregate whole-catalogue nature + per-currency band | organic-visibility #1 (High) |
| `c31ae99` | `fix(organic-channels)` — degraded store read + i18n default topic | organic-visibility #2 (High), seo-keyword #4b (Med) |
| `192b090` | `fix(distribution)` — repurpose from body, drop niche hashtags | organic-visibility #3 (Med) |
| `62be917` | `fix(content-schedule)` — no overbooking full calendar + dead draft buttons | organic-visibility #4 (Med), seo-keyword #2 (High), seo-keyword #3 (Med) |
| `df1b92a` | `fix(content-engine)` — i18n seeded workspace title | seo-keyword #4a (Med) |
| `21b37cb` | `fix(cluster-builder)` — carry real volume + intent into brief | seo-keyword #5 (Med) |
| `6a16e5b` | `fix(seo-score)` — accented-glyph width + three-form plural | organic-visibility #5 (Med) |
| `3507b36` | `fix(obsah-plan)` — honor an emptied board | content-pages #2 (Med) |
| `919b2b9` | `fix(creative,patterns)` — pass projectId, kill unscoped fallback | content-pages #4 (Med) |
| `28465d1` | `fix(obsah)` — permanentRedirect (308) | content-pages #5 (Low) |

## Narratives

- **organic #1** — `deriveBrandContext` took `nature` from `active[0]` and banded prices across all currencies. Now: nature = shared nature when all active offerings agree, else `hybrid`; band computed only within the dominant currency (others omitted, not merged).
- **organic #2** — `resolveOrganicChannels` collapsed a store-read failure into the "never tracked" shape. Added `degraded: boolean`; the Kanály module renders a read-only banner and disables status writes when degraded (a write would clobber the still-present pinned plan). `kanaly/page.tsx` threads the flag.
- **organic #3** — `repurpose()` shipped fixed `#rodicovstvi #miminko` hashtags and worked from the headline only. Now derives each variant from `a.body` paragraphs (clipped to the soft channel budget) and emits no niche tags; generic lead only when body absent.
- **organic #4 / seo #2 / seo #3** — `nextFreeDay` now returns `number | null` (null = full); `ContentSchedule` disables "Naplánovat" with a tooltip and guards `schedule()` on null, so a full calendar no longer strands an invisible day-27 chip. Seed dates published posts in the past half / scheduled in the upcoming half + documents day 0. Draft buttons now `disabled={draftingId !== null}` so a click during a running draft isn't a silent no-op.
- **seo #4** — `T.cs.wsSeeded` → `t("wsSeeded")` in ContentEngine; hardcoded Czech `createContent` topic → `t("defaultTopic", …)` in OrganicChannels.
- **seo #5** — `briefFromCluster` joins each supporting keyword back to `selected.keywords` (case-insensitive) carrying real `avgMonthlySearches` + intent label; 0 only for model-invented keywords.
- **organic #5** — `charEm()` maps any glyph missing from `CHAR_EM` to its NFD base letter, so uppercase Czech titles are no longer under-measured; the outline-points hint uses bod/body/bodů.
- **content-pages #2** — `isStored = Array.isArray(stored)`: an emptied board ([]) is honored; only `null` falls back to the seed.
- **content-pages #4** — CreativeStudio + PatternsLibrary accept an explicit `projectId` prop (preferred over context); kreativa + knihovna pages pass it. Unscoped fallback survives only for the standalone host.
- **content-pages #5** — `permanentRedirect()` (308) replaces `redirect()` (307).

## Skipped

- **content-pages #3 (Med) — "three competing sample/live signaling patterns"**: Resolving this requires a cross-cutting page-level honesty convention across 9 sibling modules — a design decision, not a mechanical fix. Changing only obsahovy-engine (e.g. adding `sample={!live}`) would layer a redundant page banner over the module's existing honest Pill (which correctly reflects the tri-state: clusters can be live while the decay table is always seed), *increasing* inconsistency rather than reducing it. Better raised as a team convention decision. **Left for sign-off.**

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npm run test:unit` → **1672 / 1672 pass** (baseline 1660 + 12 new; 0 regressions).
- New tests: brand-context (nature aggregation, all-local, per-currency band = +3); seo-score (charEm accent mapping, uppercase-title width, Czech outline plural = +3); content-schedule (nextFreeDay null / last-day, chronological seed halves = +2); new `distribution-repurpose.test.mjs` (no niche hashtags, body substance, body-less fallback, budget = +4).
- No `src/lib/ai` tool schema/prompt touched → LLM contract gate ran on every commit (pre-commit hook) and stayed green; no `--force` re-run needed.

## Behavior changes needing sign-off

1. **Organic-channels read failure is now visible** — a store hiccup shows a read-only banner and blocks status writes (previously it silently served the sample and accepted writes that could overwrite the real plan). Correct, but users on a flaky store now see a degraded state instead of a seemingly-working one.
2. **`/obsah` now emits a 308** (permanent) instead of 307 — crawlers/browsers will treat the redirect as permanent and may cache it; only relevant if the legacy route is ever meant to return.
3. **Content-schedule seed layout changed** — demo boards now read chronologically (published in the past half). Demo-only, but any snapshot expecting the old seed distribution would differ.
4. **content-pages #3 convention** — see Skipped; needs a product/design decision.

## Patterns

- **null-not-lying-index**: an "everything full" sentinel should be `null`, forcing callers to branch, not a valid-looking last index that silently overbooks.
- **degraded ≠ empty**: a failed read and a legitimately-empty state must not share a return shape; carry an explicit `degraded` flag so the UI can go read-only.
- **de-hardcoding must follow the data seam**: when a sample gains real substance (`body`), the deterministic consumer has to actually read it — otherwise the niche leak survives in the tool.
- **prop-over-context for scoping**: inside a `[projectId]` route, pass the server-resolved id down; an ambient context fallback is for the standalone host only.
- **NFD-fold before a per-glyph table lookup** is the cheap correct fix for locale-blind width/measure tables.
