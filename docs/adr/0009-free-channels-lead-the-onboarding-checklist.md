# ADR-0009 — Free channels lead the onboarding checklist, and are required for the types with no ad budget

## Status

Accepted — as a **reversible default**, not a settled product position. It was
chosen by the agent implementing Ship milestone `kanaly-core-path` from the
options the impact analysis laid out; the operator has not confirmed it. Reverting
it is two edits in one file (`src/lib/onboarding/steps.ts`) plus the assertions
that pin them.

## Context

Adamant's zero-ad-budget path is the `kanaly` module — "Kanály zdarma", a ranked
plan of free visibility channels (directories, marketplaces, communities, owned
content, PR, partnerships) with a fit score, an effort level and 2–4 concrete
first actions per channel. It needs no connected account, no credentials and no
budget: it works on the first render of a brand-new project.

The onboarding checklist said the opposite. In `src/lib/onboarding/steps.ts` the
`channels` step was **last** in all five project types' orders and **optional** in
all five, sitting behind `ads` — "Připojit Google Ads". For an `app`, `content` or
`leadgen` tenant that is a step they often cannot complete at all, because
completing it means having an ad account with money in it. The result was a list
whose blocking item was "spend money" and whose skippable last item was the one
thing they could do for free on day one.

The evidence that this actually costs users is not a hypothesis:

- The 2026-08-28 `kanaly-l1` UAT run — finding **K01**, its only open major
  (run directories under `uat/` are gitignored; the finding is carried forward in
  the ship record below): "the best-grounded, most honest surface in Standa's whole reachable set is
  also the one the product never points him at … He finds it by accident or not at
  all." The run scored the module's *quality* as the strongest AI surface in the
  app and its *discoverability* as a fail.
- Two earlier characters said the same unprompted in the 2026-07-16 full
  certification run — Standa ("I didn't even know to look for [it], and it's honestly the best-fit
  thing in here for me") and Radek (his exact zero-budget job "isn't listed").
- `docs/ship/2026-08-28-kanaly-core-path.md` carries it as product gap **P6**, and
  is explicit that it is "S (decision)" — a positioning call, not a bug.

The same gap list also asked for the module to be moved to the front of its
sidebar section. It was already there: `kanaly` holds `order: 5`, the lowest in
`comms`, so `modulesFor` already renders it first in that section for every type.
No registry edit was needed; a test now pins it so the premise is not re-derived.

## Decision

**1. `channels` is the first step after the scan, in every project type.**
`BY_TYPE` becomes `scan → channels → (connectors)`. The scan stays first because
it is what grounds the channel plan — the plan a URL-first tenant gets before the
scan names "vaší firmy" instead of their business.

**2. `channels` is REQUIRED for `app`, `content` and `leadgen`; optional for
`eshop` and `local`.** Optionality is now resolved per type, through a new
`REQUIRED_BY_TYPE` map that overrides the shared definition's default; `DEF` still
carries `optional: true` as the base and callers must read `stepsForType`'s output.
The split follows what each type can reach: an e-shop or a local business has a
catalog to import and a storefront or Google Business Profile to connect, so free
channels is one honest route among several. A pre-launch app, a content site or a
leadgen site has no catalog step at all and typically no ad budget — for them it is
the only route to a first visitor, and "optional" told them the opposite.

**3. `channels` is marked `selfServe`**, and the checklist row's CTA reads "Otevřít"
/ "Open" for such a step instead of "Připojit" / "Connect". Promoting a step that
connects nothing to the head of a list titled "Připojení dat" would have put the
wrong verb on the first row a new tenant reads; the card is now titled "Vaše první
kroky" / "Your first steps" and says which steps need no account.

**4. Completion semantics are unchanged.** `resolveOnboardingProgress` has always
computed `complete` as `done === steps.length`, counting optional steps, so
"required" here is a labelling and ordering change and not a new gate on
activation. A test asserts this, because "required" is exactly the word that would
tempt a later edit into making optional steps stop counting.

## Consequences

- A new `app` / `content` / `leadgen` tenant is offered the free-channel plan as
  their first action, and is not told it is optional. This is the behaviour change;
  everything else is presentation.
- `stepsForType` now returns a **cloned** def for an overridden step. Nothing may
  read `DEF` directly to learn optionality, and a test pins that resolving one type
  cannot mutate another's.
- `REQUIRED_BY_TYPE` is an exhaustive `Record<ProjectType, …>`, so a new project
  type is a compile error until someone decides where free channels sits for it.
- The step ORDER is now asserted in three places — `test-unit/onboarding-progress.test.mjs`,
  and by position (not just membership) in `tests/first-run.spec.ts`. The e2e
  assertion is deliberate: the membership-only version of that check passed both
  before and after this change, so it could never have caught the ordering.
- Because this is a default rather than a confirmed position, the two edits that
  carry it (`BY_TYPE`'s order and `REQUIRED_BY_TYPE`) are adjacent and commented in
  one file. Reversing it does not touch the UI, the stores or the progress
  computation.
- Still **not** addressed, and out of scope here: the module has no marketing or
  positioning presence at all (gaps C1/C2 — no mention on the home page, `/cena`,
  the LP variants, `PRODUCT.md`, and no public feature page while every other
  pillar has one). A tenant who never creates a project still cannot discover it.

## Consequences observed

_Read back 2026-08-31 against the tree, not against intentions._

- **The default is still in force and still a default.** `src/lib/onboarding/steps.ts`
  orders every type `scan → channels → …` and `REQUIRED_BY_TYPE` still names
  `app` / `leadgen` / `content` and nobody else. It has survived several waves of
  unrelated work, which is the only evidence a reversible default can produce on
  its own. The operator has still not confirmed it, so the Status line is accurate
  rather than stale.
- **The discoverability gap it was written for is now closed on both sides.**
  C1/C2 were left open here; a public feature page exists since
  (`src/app/kanaly-zdarma/page.tsx`) and `PRODUCT.md` names the module. So the
  tenant who never creates a project can now reach it too — through a change this
  record did not ask for and did not block.
- **What has NOT been measured is whether any of it changed behaviour.** This
  repository carries no tenant telemetry, so "does a new `app` tenant open the
  channel plan first" is unanswerable from here; the evidence remains the UAT
  characters that produced finding K01. The honest position is that the cost of
  the change was near zero and its benefit is still unverified — which is an
  argument for leaving it, not for calling it settled.
