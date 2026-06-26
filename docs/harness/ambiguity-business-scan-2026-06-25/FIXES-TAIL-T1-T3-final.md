# Ambiguity + Business scan — Tail close-out (tracks T1–T3)

**Branch:** `vibeman/ambiguity-business-tail-2026-06-26` (11 commits ahead of `master`)
**Date:** 2026-06-26
**Scope:** the ≈12 items left on the "Remaining" list of `FIXES-WAVE-8-10-tail.md` — the
last Medium/Low + a few higher-value-but-deferred findings the user asked to finish after
the main fixes (Waves 1–11) shipped to `master`.

## Outcome

**All 12 remaining items resolved.** 10 implemented, 2 closed by verification (one was already
satisfied in the code; one would have regressed an existing convention, so it is won't-do with
cause). Build-verified end to end.

| Track | Finding (ref) | Resolution |
|---|---|---|
| **T1** | `article-content #4` — content→shop attribution | **Done.** `utmHref()` helper in `ArticleBody.tsx`; external inline links + CTA blocks now carry `utm_source/medium/campaign`. `article.ts` gains an optional `campaign?` on the link + CTA variants. |
| **T1** | `article-reading #2` — shareable section permalinks | **Done.** `HeadingAnchor` copy builds a UTM'd permalink (`utm_source=permalink`, `medium=anchor`, `campaign=clanek`); address bar stays `#id`-only — only the copied artifact carries the tag. |
| **T1** | `ai-generation-api #2` — glass-box result panel | **Already satisfied.** `ResultMeta` (primitives.tsx:206–226) already renders the model/latency/cache provenance. No change; verified, not re-built. |
| **T2** | `design-system #5` — swatches are a working reference | **Done.** New `"use client"` `Swatch` island: click-to-copy `--color-*` token name with a transient check. |
| **T2** | `design-system #3` — type scale shown from source | **Done.** `fontTokens` export (`parseDeclarations("font")`); page renders the font-family tokens from `@theme` rather than a hand-kept copy. |
| **T2** | `design-system #4` — kill system-dark token drift | **Done.** Added the missing `--pattern-line` to the `@media (prefers-color-scheme: dark)` block + a sync comment (it existed only on the `[data-theme]` trigger before). |
| **T3** | `metrics #3` — significance test variance | **Done.** `meanVar` now uses Bessel's sample variance (`÷ n−1`, `n>1 ? … : 0`); doc updated. |
| **T3** | `home-app-shell #5` — fade feels like lag in /app | **Done.** `template.tsx` is now a client wrapper that applies `animate-fade-in` only when the path is **not** under `/app`. |
| **T3** | `article-reading #5` — permalink button on touch | **Done.** Anchor button reveals at `opacity-60` under `[@media(hover:none)]` so touch readers get a tappable control. |
| **T3** | `ai-generation-api #5` — typed error contract | **Done.** New `AiError`/`AiErrorCode` envelope in `ai-types.ts` (field is `error`, matching existing clients); `rate-limit.ts` + `/api/ai` routes emit the typed `code` (`rate_limited`/`too_large`/`quota`/`invalid`/`failed`). |
| **T3** | `nav #5` — migrate TaskPager to `getMessages` chrome i18n | **Won't-do (with cause).** TaskPager already uses `getT`/`useT` (the dominant app-i18n pattern). Moving it to the Nav/Footer `getMessages` system would *regress* consistency, not improve it. |

(That is 11 rows; `ai-generation-api #2` + `nav #5` are the two "no new code" resolutions, leaving
the 9 net code changes plus the build fix below.)

## Build-boundary fix (caught at final verification — important)

The T2 `Swatch` island (`design-system #5`) imported the runtime helper `readableInkOn` from
`src/lib/design-tokens.ts`. That module runs `readFileSync(globals.css)` **at module scope** and is
explicitly server-only. Pulling it into a `"use client"` component dragged `node:fs` into the
browser chunk, and **`next build` (Turbopack) failed** with a chunk-codegen `new_merged` error.

- **tsc did not catch it** — the client/server boundary is a *bundler* concern, not a type one.
- The T2 wave was verified with `tsc + unit` but **not a full `next build`**, so it shipped green.
- **Fix:** extracted the pure colour math (`luminance` + `readableInkOn`) into a new Node-free
  module `src/lib/design-tokens-color.ts`. `design-tokens.ts` re-exports `readableInkOn` from there
  (server callers unaffected); `Swatch.tsx` imports the runtime helper from the pure module and
  takes `ColorToken` as a **type-only** import (erased at compile time → no runtime edge to the
  disk-reading module). Commit `9da6bf7`.
- **Lesson (added to harness-learnings):** any wave that creates or edits a `"use client"`
  component must run a full `next build`, not just `tsc + unit` — a server-only import crossing the
  client boundary is invisible to tsc.

## LLM-gate interaction

Only the `ai-generation-api #5` route wiring touched hashed files (`src/app/api/ai/route.ts`).
That single gated commit (`847afa9`) ran the real Claude suite once: **14/14 tools pass, ~317s**,
then re-cached. Every other commit (incl. the build fix, which touches no hashed file) used the
gate's fast-path and skipped the real run.

## Final verification (whole branch)

- `tsc --noEmit` → **0 errors**
- `npm run test:unit` → **173 / 173 pass**
- `npx next build` → **✓ Compiled successfully** (17/17 static pages; `/design-system` builds)
- Real Claude LLM suite (at the one gated commit) → **14 / 14 pass**

## Commits (oldest → newest)

```
4fd8d01 feat(article): UTM-tag external links so content→shop is measurable
69c5d14 feat(article): attribute copied section permalinks with a UTM tag
236cc32 fix(theme): sync the system-dark token block (close the --pattern-line drift)
4450c2b feat(design-system): click-to-copy swatches + token-generated fonts
d628453 fix(metrics): use sample variance (÷n−1) in the significance test
be76a48 fix(ui): skip the per-navigation page-fade inside the /app workspace
0e43d19 fix(a11y): expose section permalinks on touch devices
f673b29 feat(ai): add a typed AiError envelope + documented status→code contract
847afa9 fix(ai): emit the typed AiError code from the /api/ai routes   [gated — real Claude run]
4e9dbc5 chore(llm): refresh gate cache after the AiError route wiring
9da6bf7 fix(design-system): keep node:fs out of the client swatch bundle [build-boundary fix]
```

The `context-map.json`, `docs/contexts/`, and `uat/` working-tree changes are the user's
pre-existing uncommitted work and were deliberately left untouched throughout.
