# Adamant — value case

Why a buyer picks Adamant over the tools that already exist. Three claims, each
matched against named incumbents, each with a reason it is hard to copy, and one
honest pre-launch caveat at the end. Positioning context lives in
[`PRODUCT.md`](../PRODUCT.md) (§ Positioning, § Monetization).

## The killer triad

### 1. Sklik unification — the Czech lane nobody serves whole

**Claim.** Adamant treats Sklik (Seznam's ad platform) as a real channel next to
Google Ads inside one diagnostics-and-generation workspace. The Czech/Sklik lane
has feed and campaign tooling — **Dotidot** (feed management + campaign
automation) and **Mergado** (feed management) — but neither is a performance
*intelligence* workspace: they move product data into channels; they do not
diagnose an account, explain the numbers, and generate the next batch of ads
from the same data spine. Western diagnostics tools (**Optmyzr**, **Opteo**,
**Adalysis**) do not support Sklik at all.

**What ships today (stated honestly, per the channel-support pills):** Google
Ads is the live-data connector; Sklik gets ad-copy limit checks, keyword
suggestions and a typed JSON-RPC client (`src/lib/sklik/`); Meta/TikTok are
publishing surfaces. The unification claim is about the workspace treating Sklik
as a first-class channel — checks, currency, character limits, Czech-first copy —
not about claiming live Sklik sync it does not have yet.

**Why it's hard to copy.** The Czech market is too small for Optmyzr-class
vendors to prioritize: Sklik support means a second RPC dialect, CZK/PNO
conventions, diacritics-aware ad limits, and an authored (not translated) Czech
product voice. That is a rewrite of their product assumptions for a market that
doesn't move their revenue. For Dotidot/Mergado the blocker is the opposite:
they'd have to build the measurement-and-diagnostics spine from scratch.

### 2. Diagnostics grounded in the account's own spine

**Claim.** The loop is measure → triage → generate, and the generation step reads
the same data spine the measurement step wrote. **Optmyzr**, **Opteo** and
**Adalysis** are strong at audits, alerts and optimization suggestions — but
their output is a recommendation list, not the marketing asset itself. Adamant
ends every diagnosis in something publishable: ad copy within Google Ads and
Sklik limits, an article, a post, a budget move — conditioned on the account's
live performance, catalog and captured brand voice.

**Why it's hard to copy.** A neighboring tool can bolt an LLM onto a dashboard;
it cannot truthfully claim its generation is conditioned on the advertiser's
live performance, catalog inventory and captured voice unless it also owns that
spine. Owning the spine is the product; retrofitting it into an audit tool is a
re-architecture, not a feature.

### 3. Price — free during validation

**Claim.** The diagnostics incumbents price for agencies (Optmyzr, Opteo and
Adalysis all sell monthly subscriptions in the hundreds-of-dollars-per-year to
hundreds-per-month range, scaling with spend and account count). Adamant is
**free in full during validation**, with fair daily limits (see `/cena`), and
Czech-first — priced (eventually) for the e-shop operator without an agency
retainer, not for the agency stack.

**Why it's hard to copy.** Incumbents cannot match "free" without cannibalizing
their subscription base; their cost structure and sales motion assume the agency
budget. Adamant's validation-phase economics are protected by daily metering
(`src/lib/plans.ts`) and BYOM (users bring their own model key), so free does
not mean unbounded model spend.

## Honest caveat — pre-launch must

`src/lib/sklik/client.ts` says it plainly: the Sklik drak API keyword surface is
not stably documented offline, and the RPC method set (e.g.
`SKLIK_KEYWORDS_METHOD = "keywords.suggest"`, `src/lib/sklik/client.ts:62`) has
**not been verified against a live Sklik account**. The client degrades safely
(an unknown method throws and the connector contributes nothing), but claim #1
leans on Sklik being real — **verifying the RPC set against a live account is a
pre-launch must**, before the Sklik pill on the landing page is load-bearing in
sales conversations.
