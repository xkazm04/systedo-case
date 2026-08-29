# Headless Outreach — free-channel research → triage → twin dispatch

Status: design v1.1 (2026-08-06) — operator decisions folded in; P1 shipped as
`/outreach` skill + `scripts/outreach/grounding.mjs` + git-ignored `.outreach/`
vault. Battle-test target: owner's own projects, local, before any SaaS wiring.

## Operator decisions (2026-08-06)

1. **P1 is interactive** (skill in a live session), research is **open-ended** —
   the pinned channel plan is hypotheses, never a boundary.
2. **Memory is mandatory**: every triage decision (with the operator's reason)
   and every dispatch outcome (success/failure per target) is persisted and fed
   into subsequent research/dispatch rounds.
3. **Obsidian vault is the temporary knowledge base** while the design settles —
   the `src/lib/outreach/` store trio moves from P1 to the SaaS-wiring phase
   (P4); target frontmatter keeps the `OutreachTarget` field names so the
   migration is mechanical.
4. **v2 keeps community/forum posts in scope.** The twin's principle: replace
   the operator without the community noticing — i.e., voice-indistinguishable
   posts under the operator's OWN authenticated accounts (operator handles
   account creation and OAuth personally; auth is never automated). No invented
   personas. First posts per target are operator-approved and banked as voice
   training examples, so approval doubles as twin training.

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
  is structurally impossible. In-app this is no longer aspirational: the kanály
  `ChannelTrack.maxPerWeek` cap is enforced at the ONE social write chokepoint
  (`POST /api/social/posts` → `409 cadence-exceeded`, overridable only by an
  explicit human click) over the four-scheduler publishing calendar in
  `src/lib/publishing/` — the outreach dispatcher inherits that rail rather than
  re-implementing one.

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
- Cadence caps enforced in code. Identity is real: the twin writes in the
  operator's voice under the operator's own authenticated accounts — no invented
  personas, no fake grassroots, auth never automated.
- All sends logged with `postedUrl` — an auditable ledger, which is also the
  retraction map if something lands wrong.

## Dev-project intake — `/onboard` (added 2026-08-06)

The headless sibling of the in-app `onboarding-scan`, for products that exist as
a local repo (possibly pre-launch, no scannable homepage). `/onboard <repoPath>`
scans the repository (README, docs, landing/i18n copy, pricing config, deployed
site when found) → synthesizes a marketing profile → operator triages → applies
via `scripts/outreach/apply-onboarding.mjs`, which mirrors the in-app apply
route seam-for-seam: `sanitizeScanProfile` → onboarding state (`scanApplied`),
`mergeScanSuggestions` → unconfirmed competitor suggestions, idempotent
`SCAN_LIST_SEED` keyword list, optional `sanitizeOfferings` catalog write, and
`createProject` when no project exists yet. Profile `extras` (value props,
differentiators, pricing, community hints) exceed Adamant's schema and live in
the outreach vault as researcher grounding. Output is immediately
`/outreach research`-ready and visible in the app under `dev:local`.

Unblocking fix shipped with it: db.ts migration v20 backfills seven tables
(`organic_channels`, `diagnoses`, `recaps`, `annotations`, `lp_experiments`,
`twin`, `onboarding`) that were added to the v1 SCHEMA without ledger entries —
the UAT 2026-07-16 "migration ledger drops new tables" finding.

## Content gate — reader-panel critique (v1.2, 2026-08-06)

First execution showed drafting is the blind spot: one master draft written for
no one in particular (the parked benchmark write-up) fits no channel well.
Content now goes through a gate that reuses the proven `/uat` + `/tiger`
machinery, scoped to writing:

- **Reader Characters** (`$VAULT/projects/<id>/readers/<channel-cluster>.md`) —
  the channel's real reader/gatekeeper as a durable Character: who they are,
  what they reward and punish, a **senior bar** ("would a top author in this
  venue publish this?"), and **scored acceptance criteria applied identically to
  every draft** — always including the channel's self-promo rules verbatim and a
  promotional-smell threshold. One Character per channel *cluster* (HN/IH/dev,
  intl HR trade editors, CZ HR practitioners, CZ tech media…), `maps_to` the
  concrete targets.
- **Channel calibration research** (before first draft, refreshed by outcomes):
  WebSearch/WebFetch exemplars of similar topics that demonstrably worked in the
  venue (and flamed ones where visible) → distilled into the reader note as
  format/length/tone/evidence norms + references. Characters without research
  are fiction — same rule as UAT init.
- **Per-track topic selection**: topics are chosen by reader fit, never by what
  we happen to have. A theme may yield per-channel variants, but each variant
  passes its own panel; no master draft is ever multi-posted.
- **L1 — panel critique** (mass-parallel, cheap): drafter and judges are
  different subagents; each reader Character scores the draft against its
  criteria; plus one **adversarial promotional-smell refuter** ("would this get
  flagged as vendor content in this venue?") that defaults to fail. Refine loop
  (max 2 rounds) until pass.
- **Operator gate** (always): nothing publishes without operator review, under
  the operator's identity.
- **L2 — reception** (empirical): after publication, record the real outcome
  (comments, votes, editor acceptance/rejection, replies) back into the reader
  note — the calibration loop that makes round N+1 sharper, mirroring the twin's
  rejection-lessons pattern.

## Phasing

1. **P1 — research + triage, vault-backed** (SHIPPED 2026-08-06): `/outreach`
   skill with research fan-out and interactive triage; state in the `.outreach/`
   Obsidian vault (target files mirror `OutreachTarget` frontmatter); grounding
   via `scripts/outreach/grounding.mjs` (LOCAL_DB stores, no next-auth in the
   graph). Battle-test on 1 project. The `src/lib/outreach/` store trio is
   deferred to P4.
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

## Resolved decisions

All three P1 open questions were resolved 2026-08-06 — see "Operator decisions"
at the top. Remaining open for P2: which platforms get browser-automation-
assisted posting (candidate order: listing forms first, community posts only
after the twin's approval rate on a target is high and the operator opts in
per target).
