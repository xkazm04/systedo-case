# Feature Scout — Distribuce (`/app/[projectId]/distribuce`)

> Module: src/components/app/modules/DistributionModule.tsx
> Project type: content
> Total: 5 ideas

## 1. AI repurposing on top of the template (on-brand variants, not hardcoded copy)
- **Category**: feature
- **Impact**: 9
- **Effort**: 5
- **Risk**: 4
- **Gap today**: `repurpose()` in `src/lib/distribution/generate.ts:13` returns four fully hardcoded strings (incl. fixed `#rodicovstvi #miminko` hashtags, line 28) regardless of article body — the module's headline promise ("AI repurposing") is currently a static template. The whole AI seam (`src/lib/llm/index.ts` `generateStructured`, `/api/ai`) already exists and is used by `social`/`ads`/`brief`, but Distribuce never calls it. The file's own comment (lines 1-3) flags this as the intended "seam".
- **Proposal**: Add a `distribution` mode to `/api/ai` (mirroring the `brief`/`ads` validators) that takes `{ title, url, body, channels, tone }` and returns one channel-native variant per requested channel via `generateStructured`, using the existing per-channel `validate` hook to enforce each `max` length (re-prompt-to-self-correct is already built in). Keep the deterministic `repurpose()` as the `demo()` fallback so a clean checkout still renders. Render a "Přegenerovat AI variantu" button per card; gate on the per-user `aiEval` quota like the other AI tools.
- **User value**: A content marketer gets genuinely tailored, on-brand copy for each network in one click instead of editing four boilerplate stubs that ignore the article.
- **Fit**: Directly delivers the registry blurb ("AI repurposing into platform-specific variants with limits") for a content project, reuses the single LLM chokepoint, quota, and length-validation machinery the codebase mandates.

## 2. UTM-stamped variant links + close the attribution loop to real channels
- **Category**: functionality
- **Impact**: 9
- **Effort**: 4
- **Risk**: 3
- **Gap today**: The attribution table (lines 57-89) is fed entirely by the static `SAMPLE_ATTRIBUTION` array (`src/lib/distribution/sample.ts:21`) — the per-channel `clicks`/`reach` numbers have **no connection** to the links emitted in the variants. The variant text embeds the bare `a.url` (e.g. `generate.ts:18,23,33`) with **no UTM tags at all**, so nothing the user actually distributes is attributable. A clean `withUtm()` helper already exists but is trapped inside `src/components/article/ShareBar.tsx:13`.
- **Proposal**: Extract `withUtm()` into `src/lib/distribution/utm.ts`, stamp every variant's URL with a per-channel `utm_source` + shared `utm_medium=distribution` / `utm_campaign=<article-slug>` so each card's link is self-attributing. Surface the resolved UTM under each variant. Then make the attribution table read those same `utm_source` keys back from the analytics data source so reach/clicks/CTR/share reflect the links the user actually shipped (sample stays as the empty-state fallback).
- **User value**: "Which channel actually drove traffic from this article?" becomes a real, trustworthy answer instead of demo numbers — the core attribution promise.
- **Fit**: The blurb explicitly promises "atribucí podle kanálu"; this wires the variants → links → attribution into one honest loop and reuses the app's established UTM convention.

## 3. Copy / edit / push-to-social handoff per variant (kill the dead-end `<pre>`)
- **Category**: user_benefit
- **Impact**: 8
- **Effort**: 3
- **Risk**: 2
- **Gap today**: Each variant renders in a read-only `<pre>` block (lines 49-51) with no copy button, no edit, and no way to act on it. The only path forward is the generic `NextSteps` strip (line 91) that just `router.push`-es to the Social module — where the user must **retype everything**. Over-budget text is flagged red (`over`, line 40) but there is no trim affordance.
- **Proposal**: Add a per-card action row: (a) copy-to-clipboard (reuse the toast/`navigator.clipboard` pattern from `ShareBar.tsx:101-121`), (b) inline-editable textarea with live `length/max` counter, (c) a "Naplánovat na {platform}" button that pre-fills the matching `SocialPost` draft (`src/lib/social/store.ts` `createPost`, status `draft`) for the channels Social supports (facebook/instagram/linkedin per `social/types.ts:8`). Map Distribuce channels → `SocialPlatform` and skip channels Social can't post (Newsletter, X).
- **User value**: Repurpose → tweak → schedule without copy-pasting between modules; the variant becomes actionable, not decorative.
- **Fit**: Realizes the module's existing "Naplánovat publikaci → Sociální sítě" intent (line 91) as a real handoff and reuses the social store + draft model already built.

## 4. Newsletter channel handoff (the half-present channel with nowhere to go)
- **Category**: feature
- **Impact**: 7
- **Effort**: 4
- **Risk**: 3
- **Gap today**: "Newsletter" is a first-class variant (`generate.ts:15-19`, with a `Předmět:` subject line) and the top attribution row (`sample.ts:22` — the **best** channel by clicks, 1260). Yet the only downstream is the Social module, which has **no email/newsletter concept** (`SOCIAL_PLATFORMS = facebook/instagram/linkedin`, `types.ts:8`). The newsletter variant is generated and then orphaned.
- **Proposal**: Give the Newsletter variant a dedicated handoff: split the generated `Předmět:` into a real subject field + body, add a "Kopírovat pro newsletter" / "Stáhnout HTML" action (subject + body + UTM'd CTA from idea #2), and a `NextSteps` link to whichever module owns email (or a lightweight `mailto:`/clipboard export if none exists). Validate the subject length separately from the body.
- **User value**: The single highest-converting channel stops dead-ending; the marketer can actually ship the newsletter draft.
- **Fit**: Newsletter is core to a content project's distribution mix and is already modeled in the variant set — this finishes a feature that's started but unwired (a recurring "built-but-unwired" theme).

## 5. Per-variant performance learnings ("co funguje na kterém kanálu")
- **Category**: feature
- **Impact**: 7
- **Effort**: 6
- **Risk**: 4
- **Gap today**: Attribution is a single static snapshot (lines 74-85) with no history, no per-variant link, and no insight — it shows *that* Newsletter wins but never *why* or *what to do next*. There is no feedback from outcomes back into how the next article is repurposed. `best` (line 19) is computed but only used for a one-line Pill (line 61).
- **Proposal**: Track variant text + its UTM key + outcome over time (JSON-in-repo per the project's no-DB rule, like other content modules), then surface a "Poznatky" panel: which channel/format/length/CTA correlated with the best CTR across the project's articles, and a CTR sparkline per channel. Optionally feed those learnings into the idea-#1 AI prompt as guidance ("LinkedIn posts under 1200 chars with a 3-bullet structure performed best"). Start descriptive (rollup of past variants) before prescriptive.
- **User value**: Turns one-off distribution into a compounding system — each article's results make the next one's variants smarter.
- **Fit**: "atribucí podle kanálu" plus a content workspace's natural arc from publishing → measuring → learning; closes the loop opened by ideas #1 and #2.
