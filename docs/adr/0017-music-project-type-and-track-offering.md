# ADR-0017 — A `music` project type, a `track` offering kind, and per-channel metrics that state their source

## Status

Accepted (2026-10-13, by the owner). The owner chose this as the forge case for the area roofs
(ADR-0013) and the research stance (ADR-0016). Spotify was descoped by the owner
on 2026-10-13: it is not a connected channel in this record.
Plan: `docs/roadmap/app-redesign-plan.md` §4.

## Context

The owner's own requirement is free marketing for a digital product, specifically
music tracks. The journey runs:

1. an empty project;
2. LLM onboarding that researches where to distribute and which metadata makes a
   track visible;
3. guided connection to channels;
4. views and comments per channel.

Nothing in the tree models this:

- **Project types:** `ProjectType` in `src/lib/projects/types.ts` is `eshop`,
  `app`, `leadgen`, `content` or `local`.
- **Offerings:** an offering in `src/lib/catalog/offering.ts` is a product, plan
  or service, and the product shape is built for physical goods (sku, stock,
  gtin).
- **Metrics:** social metrics (`src/lib/social/metrics.ts`) are per post and have
  no views field.
- **Connectors:** the social platforms (`src/lib/social/types.ts`) are Facebook,
  Instagram, LinkedIn and TikTok.

The pipeline it can reuse is real. The onboarding checklist
(`src/lib/onboarding/steps.ts`) and the free-channel plan (`channel-research`,
`ChannelTrack`, `src/lib/organic-channels/next-step.ts`, the channel wizard)
already take a business from nothing to a ranked plan with next steps.

## Decision

**1. `music` is a sixth project type, added the compiler-driven way.** It is
appended to `PROJECT_TYPES`. Every `Record<ProjectType, …>` map then fails to
compile until it has a deliberate `music` entry. There are 23 such maps today,
and the failure is the checklist. Two prompt maps get written guidance and not
just an entry: the onboarding-scan type hint and the channel-research framing.
There is a demo seed for a fictional artist, labelled sample.

**2. `track` is a fourth offering kind, not a stretched product.** Its fields
are isrc, upc, title, artists, credits, genre, subgenre, mood, language,
explicit, releaseDate, durationSec, artworkUrl and lyrics. It joins the
`Offering` union with its own type guard. The catalog UI renders it with its own
editor. A product-shaped row with an empty sku is not acceptable.

**3. Onboarding for `music` puts research first.** The steps are:

1. who and what (artist, release, goals);
2. research — ADR-0016, against the music channel catalog;
3. a metadata audit — each chosen channel's requirements checked against the
   `track` fields, with gaps shown as a checklist;
4. connect;
5. launch board.

Free channels lead the checklist, in line with ADR-0009. A music project has no
ad budget by default, so `channels` is required for it.

**4. Connectors are rows in a catalog, and each row declares how its numbers
arrive.** The modes are `api` (we read it), `import` (the operator uploads an
export) and `manual` (the operator types it in). The first rows:

- **YouTube:** api. Views, likes and comments, read through the YouTube Data
  API on the Google OAuth the app already has, with a read-only scope.
- **Last.fm:** api. Listeners and playcount.
- **Deezer:** api. Rank and fans.
- **Audius:** api. Plays and comments.
- **Everything else:** manual or link-tracked.

Before Phase 5, each of these API claims is re-checked against the provider's
current documentation. Spotify is not a row. The research output may still name
Spotify and similar services as places to be distributed to through a
distributor.

**5. Metrics are per channel and per asset, and every number names its source.**
Each `ChannelMetricDay` row records:

- channel, asset, day;
- views, plays, likes, comments, followers;
- source: `api`, `import`, `manual` or `sample`.

It follows the read-back rule already in force for social metrics: a failed read
writes no row, never a zero. The provenance badge (ADR-0014) shows the source on
every figure, and the UI never shows a number it did not read.

**6. Comments go to the one inbox.** YouTube comment threads become real inbound
`schranka` items, which is the first real (not sample) social intake. The twin
may draft a reply; the operator presses send. That red rule is unchanged.

## Consequences

- Adding a type touches 23 maps across 17 files. That is a large diff, but the
  compiler checks it, and it forces a decision for every place a type matters.
- The Channels roof (ADR-0013) has to render a per-channel, per-asset board
  generic enough that `content` projects can reuse it later. The music board is
  its first tenant.
- A new OAuth scope (`youtube.readonly`) is a console and environment change the
  owner makes. No agent moves a credential.
- `ChannelMetricDay` is a new store behind the store seam, with a `LOCAL_DB` twin
  (ADR-0001), registered in the read-back cron, and covered by a context test
  floor because it feeds what the product claims.
- With Spotify out of scope, the board under-reports where most listening happens.
  The UI says so in plain words rather than implying the board covers all of it.

## Revisit when

- **The owner brings Spotify back into scope.** That needs its own decision on
  how numbers are read. The only paths in view are import of the Spotify for
  Artists export and operator-present browser reading. Each has terms-of-use and
  red-list questions this record deliberately does not answer.
- **A second digital-product type is proposed** (podcasts, e-books, courses). The
  `track` kind and the music catalog are then one case of a "digital release"
  shape, and should be generalised rather than copied.
- **The API-mode rows mostly fail their re-verification.** If most channels end
  up `manual`, the board is a form and not a dashboard, and the journey's last
  step needs a different promise.
