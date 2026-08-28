# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, both confirmed by the codebase:

- **Primary (in-product):** operators of Czech e-shops, small digital products and
  local service businesses, plus the small agencies that serve them. They have neither
  an in-house performance team nor an agency retainer. Two jobs, and a given user may
  only ever have the first: *(a)* with a website and no ad budget — find the free
  places worth being visible on and work them one at a time; *(b)* once they do run
  paid acquisition on Google Ads and Sklik and publish to Meta and TikTok — find out
  what is actually working this week, fix the campaigns that are leaking, and produce
  the next batch of ads, articles, and posts without hiring a copywriter.
- **Secondary (evaluative):** a technical reviewer assessing this repository as a
  case study for the Systedo "AI Vibecoder" position (see README.md). This audience
  is real and durable: it is why the public surfaces must read as a shipped product
  rather than a demo, and why honesty about data provenance is a hard requirement
  rather than a nicety.

The product is Czech-first. Copy ships `cs` and `en`, and `cs` is the primary locale.

## Product Purpose

Adamant is an AI marketing workspace that does two jobs, in this order.

**First, discovery without a budget.** Given nothing but a web address, it reads the
site, works out what the business sells and to whom, and returns a ranked plan of the
free places that business can be found on the Czech market — directories, price
comparison sites, communities, owned content, PR and partnerships — with a fit score,
an effort level and concrete first actions for each, and then keeps the lifecycle of
each channel as real state. Nothing needs to be connected and nothing needs to be
spent. This is the first thing the product can do for a new user, and for a business
with no ad account it may be the only thing it needs to do.

**Second, paid measurement and generation.** For advertisers who do buy clicks, it
ingests live channel data, tells them what the numbers mean, and generates the
marketing assets those numbers call for — ad copy, articles, social posts, creative
images, local-SEO and keyword work — inside one workspace instead of across a
dashboard, a spreadsheet, and a chat window.

Success is that an operator lands with a URL and leaves with somewhere to be found for
free; and that a paying advertiser opens it weekly, gets a correct read on performance
without interpreting charts themselves, and leaves with assets they actually publish.

## Positioning

**Free visibility first, paid performance second.** The entry path assumes no media
budget: `/kanaly-zdarma` (public) and the `Kanály zdarma` module compose free channels,
target search queries and prepared content into ONE visibility plan, with the proposed
links stated as proposals and any leg the tenant has no data for left explicitly empty
rather than invented. Most adtech starts at "connect your ad account"; this starts at
"here is where you can be found for nothing".

**Grounded AI generation.** Every generative operation is anchored to the account's
own live performance data, product catalog, and trained brand voice — not to a blank
prompt box. For the paid half the loop is measure → triage → generate, and the
generation step reads the same data spine the measurement step wrote. A neighboring
tool can bolt an LLM onto a dashboard; it cannot truthfully claim its output is
conditioned on the advertiser's live Google Ads performance, catalog inventory, and
captured voice unless it also owns that spine.

Supporting (not the claim itself): Sklik is treated as a real channel next to Google
Ads, which western adtech generally does not do.

Full competitive value case — the killer triad (Sklik unification / grounded
diagnostics / price) versus named incumbents (Optmyzr, Opteo, Adalysis; Dotidot,
Mergado in the Czech lane), with per-claim "why it's hard to copy" and the honest
pre-launch caveat on Sklik RPC verification — lives in
[`docs/value-case.md`](./docs/value-case.md).

## Monetization

**Decision (2026-08-04): Adamant is free during validation.** Paid CTAs are
dropped from public surfaces; `/cena` keeps the three-tier table as documented
intent, with paid tiers marked "coming after validation" and the free CTA leading
into `/app`. The metering machinery (`src/lib/plans.ts`, daily limits) stays live
so free never means unbounded model spend.

**Revisit trigger:** roughly **10 organically activated projects** (real users who
connected an account and returned) — at that point pricing gets re-evaluated
against observed usage instead of assumptions.

## Operating Context

- Weekly or ad-hoc review sessions, desktop-first, often with the advertiser's own
  Google Ads UI open alongside.
- Multi-tenant: authenticated users work inside per-project workspaces at `/app`,
  with tenancy scoped per project rather than per user.
- Four public case-study surfaces (`/`, `/dashboard`, `/clanek`, `/ai-asistent`,
  plus `/kampane`) present the product without login; the full product lives behind
  auth.
- Scheduled cron jobs sync campaigns and send e-mail alerts, so the workspace is
  expected to be correct when opened cold, not only after a manual refresh.

## Capabilities and Constraints

Confirmed capabilities: performance dashboard and metrics engine; campaign triage and
ad-ops control plane; Google Ads connector with scheduled sync; product catalog with
feed import; inventory sync; cost/profit and LTV analytics; monthly client reporting;
AI ad-copy, article, social, and keyword generation; Creative Studio image generation;
brand-voice twin and inbox; local SEO and map-pack tracking; competitive intelligence;
onboarding scan; BYOM (per-user encrypted provider keys) with a per-operation
model matrix.

Hard constraints:

- **Channel support is tiered and must be stated, never implied.** Google Ads is the
  only live-data connector. Sklik receives ad-copy limit checks. Meta and TikTok are
  publishing surfaces. Public copy states each level explicitly.
- **Case-study data is illustrative and must be labeled as such.** The numbers the
  dashboard and the homepage proof band render belong to a fictional client, the
  e-shop Mionelo (nuts, seeds, superfoods). They are not customer results.
- Stack is fixed: Next.js 16 App Router, React 19, TypeScript, Tailwind v4, with
  Cache Components enabled — no `force-dynamic` or `runtime` exports, dynamic reads
  wrap in Suspense.
- Locale-aware output: generated copy follows the active locale.

Explicitly undecided: nothing material to visual work.

## Brand Commitments

- Name: **Adamant**. The name carries the meaning — unbreakable, immovable — and the
  voice leans on it directly (`Stůjte pevně.` / `Stand adamant.`).
- Voice: direct, technical, unhedged, faintly severe. Claims are quantified or
  qualified; nothing is oversold. Czech copy is not a translation of English copy —
  both are authored.
- The incumbent visual world is **Monolith**: an obsidian monument, onyx surfaces, a
  faceted background pattern, a wide key visual at `/brand/hero-monolith.png`.
- Token-driven theming is binding: `onyx-*`, `brand-accent`, `*-soft` tokens carry
  light and dark; raw hex, `navy-800`, and `brand-700` are not to be used directly.

## Evidence on Hand

- Real, renderable case-study metrics from the shared snapshot model (`buildSnapshot`)
  — the homepage proof band shows the exact figures the dashboard computes.
- A complete working product behind auth: Google sign-in, Firestore persistence,
  cron sync, Creative Studio.
- Brand key visual and facet pattern assets under `public/brand/`.
- A live design-system route at `/design-system`.
- **Absent, and never to be fabricated:** customer testimonials, named customers,
  logos of real advertisers, press mentions, pricing case results, uptime or scale
  claims. There are no real customers to quote.

## Product Principles

1. **State the level of support, don't imply parity.** Where a channel is weaker, the
   interface says so. Honesty is the differentiator, not a tax on it.
2. **Generation is downstream of measurement.** Any AI surface must show what data
   grounds it; an ungrounded generator is a different, lesser product.
3. **Label illustrative data every time it appears.** Case-study numbers may be shown
   prominently, never ambiguously.
4. **Czech-first, not Czech-also.** The primary locale gets authored copy and correct
   currency and formatting, not fallbacks.
5. **The operator should leave with an artifact.** Every workspace surface ends in
   something publishable, not in a chart to interpret.

## Accessibility & Inclusion

No customer-mandated standard was established. The project's own bar is WCAG AA:
token-driven contrast in both themes, keyboard-reachable controls, and reduced-motion
alternatives that preserve state change rather than deleting feedback.
