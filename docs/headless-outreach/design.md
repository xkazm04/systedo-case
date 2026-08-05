# Headless Outreach — free-channel research → triage → twin dispatch

Status: design v1 (2026-08-05). Battle-test target: owner's own projects, local,
before any SaaS wiring.

## Why headless, and why this is differentiated

The in-app `channel-research` op is a one-shot structured call: it *reasons* about
which free channels fit a business, but it cannot look anything up, verify a URL,
read a community's self-promo rules, or find the actual thread to post in. Its own
system prompt forbids asserting unverifiable facts — correctly, because it has no
grounding.

A Claude Code session (or Agent SDK run) has exactly what the op lacks: WebSearch,
WebFetch, browser automation, subagent fan-out, and multi-turn judgment — billed to
the operator's subscription, not per-token API spend. The unique product shape is
the full loop, not the research alone:

```
research (verified targets) → honest triage with the operator → twin setup → dispatch (drafted in the twin's voice, human-gated)
```

Competitors do channel *lists*. Nobody closes the loop into voice-true,
rules-respecting communication with an autonomy gate.

## Architecture decision

**Runtime: a Claude Code skill (`/outreach`) orchestrating subagents, backed by the
existing LOCAL_DB sqlite stores.** Not an MCP server, not a standalone Agent SDK
harness — yet.

Rationale:

- The dual-store dispatchers (`src/lib/*/store.ts`) are plain async functions with
  no Next.js coupling; with `LOCAL_DB=true` they hit `.data/systedo.db` with zero
  credentials. `test-llm/resolve-hooks.mjs` already proves the `@/`-aliased TS
  graph loads under plain Node. The skill's scripts reuse that loader.
- **The existing /app UI becomes the review console for free.** The headless loop
  writes twin drafts and channel state into the same sqlite file that
  `npm run dev:local` serves — schranka *is* the outreach inbox, kanaly *is* the
  channel board. No throwaway triage UI to build.
- Skill-first keeps iteration cost near zero while we learn which research lenses
  and dispatch cadences actually work. The Agent SDK harness (phase 3) is a
  mechanical port of a proven skill, not a rewrite. An MCP server is only needed
  when a *non-Claude-Code* client must drive this; defer.

## Data model (new domain: `src/lib/outreach/`)

New store trio (`types.ts`, `store.ts`, `store.local.ts`, `store.firestore.ts`)
following the twin/organic-channels pattern, keyed by projectId. Firestore side can
be a thin stub until SaaS wiring.

```ts
type OutreachTarget = {
  id: string;                  // slug of platform+place
  channelId?: string;          // link to pinned OrganicChannel, when derived from one
  platform: string;            // "reddit" | "facebook-group" | "firmy.cz" | ...
  name: string;                // "r/webdev", "FB: Čeští podnikatelé online"
  url: string;                 // verified live at research time
  kind: "listing" | "community" | "qa" | "content" | "pr" | "marketplace";
  evidence: { url: string; quote: string; fetchedAt: string }[];  // why we believe fit
  rules: {                     // the honesty core — captured verbatim at research time
    selfPromoPolicy: "allowed" | "conditional" | "banned" | "unknown";
    summary: string;           // e.g. "self-promo only in weekly thread, 9:1 ratio"
    sourceUrl?: string;
  };
  fit: number;                 // 0–100, evidence-backed (not model vibes)
  effort: "low" | "medium" | "high";
  audienceNote: string;        // observed activity: members, post recency
  status: "candidate" | "accepted" | "rejected" | "active" | "retired";
  rejectReason?: string;       // feeds the next research round, like twin rejections
  twinChannel?: TwinChannel;   // which voice scope speaks here (usually "social")
  cadence?: { maxPerWeek: number; lastDispatchAt?: string };  // anti-spam rail
  createdAt: string; decidedAt?: string;
};

type OutreachAction = {        // one intended post/reply/submission at a target
  id: string; targetId: string;
  intent: "introduce" | "answer" | "submit-listing" | "weekly-thread" | "reply";
  context: { url?: string; inboundText?: string };  // the thread/question found
  draftId?: string;            // TwinDraft id once drafted — review lives in schranka
  status: "found" | "drafted" | "approved" | "posted" | "skipped";
  postedUrl?: string; createdAt: string;
};
```

Design choices:

- `evidence` + `rules` are first-class, not prose: triage shows the operator *why*
  and *whether it's allowed*, quoting the source. A target with
  `selfPromoPolicy: "banned"` is presented as "engage-only / build karma" or
  auto-rejected — never queued for promo. This is the "triage honestly" contract
  in the schema.
- `OutreachAction.draftId` points into the existing `TwinState.drafts`, so the
  autonomy gate (`decideDraft`), rejection-lessons loop (`twinAvoidContext`), and
  the schranka review UI all apply unchanged. Outreach drafts start with
  `autonomy: "review"` always; `auto` is opt-in per target much later.
- `cadence.maxPerWeek` is enforced by the dispatcher, not the model. Mass posting
  is structurally impossible.

## The pipeline (skill phases)

### `/outreach research <project>`

1. Load grounding from stores exactly as `kanaly/page.tsx:23-41` does: catalog →
   offering + keywords, `localitiesFor`, `curatedCompetitors`. Optionally run the
   existing `channel-research` op first as a cheap hypothesis generator.
2. Fan out research subagents (Agent tool, `Explore`-style prompts with
   WebSearch/WebFetch), one per lens — the multi-modal sweep pattern:
   - **directories/listings** (Firmy.cz, Mapy.cz, catalogs per vertical)
   - **communities** (FB groups, Reddit, Discord — Czech-first)
   - **Q&A + forums** (living threads where the project answers real questions)
   - **comparison/marketplace** (Heureka, Zboží, Product Hunt–likes, srovnávače)
   - **PR/content** (guest-post-friendly blogs, newsletters, podcasts)
   - **competitor trace**: WebFetch curated competitors' sites/backlink-visible
     mentions — where are *they* listed for free?
3. Each researcher must return per target: live URL (fetched, not guessed),
   rules excerpt with source, recent-activity evidence, a concrete first action.
   No evidence → not a finding. Findings merge + dedupe into `candidate` targets.

### `/outreach triage <project>`

Present candidates in ranked batches (AskUserQuestion in interactive sessions;
a triage table the operator edits when run detached). Per target: accept / reject
(+reason) / engage-only. Accepted targets get `twinChannel` and `cadence`
assigned. Rejections with reasons persist and are injected into the next research
round's prompts — same learning loop the twin already uses for replies.

### `/outreach prepare <project>`

For each accepted target's `twinChannel`, check the voice is trained
(`resolveVoice` non-empty). If not, run the existing twin-style interview loop
(that flow already exists in /app — the skill just points the operator there, or
runs the gap-question interview inline in the session).

### `/outreach dispatch <project>`

1. For each `active` target within cadence: a scout subagent finds the *current*
   opportunity (this week's promo thread, a fresh unanswered question, the listing
   form) → `OutreachAction` with context.
2. Draft via a new `outreach-post` LLM op (twin-reply's sibling: voice-injected,
   confidence + risks, plus the target's rules verbatim in the prompt —
   "NIKDY neporušuj pravidla komunity uvedená výše"). Written as a `TwinDraft`
   (channel = target's twinChannel) → appears in schranka.
3. Operator reviews in schranka (or in-session). Approved actions are **sent by
   the operator** via the manual connector in v1 — paste + mark sent, `postedUrl`
   recorded. Browser-automation assisted posting (claude-in-chrome) is a v2
   experiment per platform, never unattended.

### `/outreach report <project>`

Weekly: targets active, actions posted, replies/traction observed (operator-fed
or WebFetch re-check of posted URLs), which targets earn more cadence and which
retire. This is the data that later powers the SaaS pitch.

## New LLM op: `outreach-post`

One new gate-registered tool (`// llm-tool: outreach-post`) in
`src/lib/ai/tools/`, modeled on twin-reply: `{reply → post, confidence, risks,
questions}` + the target's rules block and intent. Reuses `voiceLines`,
`twinAvoidContext`. Registered in `test-llm/registry.mjs` + modes table so the
in-app product can call it later unchanged. Everything else in the pipeline is
agentic (skill/subagents), not chokepoint ops — research quality comes from
tool-use, which `generateStructured` deliberately doesn't do.

## Guardrails (non-negotiable, also the brand)

- Rules-first: every target carries its community's policy verbatim; banned →
  never promo. Conditional → the condition is in the draft prompt.
- Human gate on every outgoing post in v1; autonomy is per-target, earned, and
  reuses the twin's threshold + zero-risks gate.
- Cadence caps enforced in code. Disclosure by default (the twin speaks *as* the
  brand, not as a fake community member).
- All sends logged with `postedUrl` — an auditable ledger, which is also the
  retraction map if something lands wrong.

## Phasing

1. **P1 — store + research + triage** (`src/lib/outreach/` local store, skill
   with research fan-out and triage; targets visible via a minimal read-only
   section or just the skill's report). Battle-test on 1 project.
2. **P2 — dispatch loop** (`outreach-post` op, scout subagents, schranka-backed
   review, manual send, cadence rails). Battle-test across multiple projects;
   measure accept-rate of drafts and traction per target kind.
3. **P3 — headless scheduling**: port the proven loop to an Agent SDK script or
   `/loop`-driven session (research weekly, scout+draft daily), still
   review-gated.
4. **P4 — SaaS wiring**: Firestore store sides, kanaly UI grows a "Cíle"
   (targets) tab fed by the same store, dispatch runs server-side per tenant via
   Managed Agents or a worker — the economics question (subscription vs API
   tokens) gets answered by P2/P3 usage data.

## Open decisions for the operator

1. Research runtime for P1: interactive skill (recommended) vs detached from day
   one.
2. Whether the pinned `OrganicChannel` plan is the *source* of targets (research
   deepens each pinned channel) or research runs open-ended and channels are just
   hypotheses. Recommended: open-ended with channel linkage when it exists.
3. v2 assisted posting via browser automation: which platforms are acceptable to
   semi-automate (listings/forms: probably yes; community posts: keep manual).
