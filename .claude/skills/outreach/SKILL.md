---
name: outreach
category: Growth
argument-hint: "[research|triage|prepare|dispatch|report|status] [projectId]"
description: Headless free-channel outreach loop for Adamant projects (docs/headless-outreach/design.md). Researches verified zero-ad-spend promotion targets on the live web (subagent fan-out with WebSearch/WebFetch), triages them honestly with the operator, and dispatches twin-voiced communication drafts through the existing schranka review gate. All loop state lives in the outreach Obsidian vault; project grounding comes from the LOCAL_DB stores. Invoke with /outreach [phase] [projectId].
---

# Outreach — verified free channels → honest triage → twin dispatch

> The in-app `channel-research` op reasons but cannot look anything up. This loop
> closes the gap with what a Claude Code session has natively: web search, page
> fetches, and judgment. **A finding without evidence is not a finding.** The vault
> remembers every triage decision and every dispatch outcome, so each round is
> smarter than the last.

Design doc (read on first run of a session): `docs/headless-outreach/design.md`.
P1 scope = research + triage (interactive). P2 = dispatch. Battle-testing on the
operator's own projects; SaaS wiring comes only after the loop proves itself.

## The vault — durable loop state

Vault root resolution (first hit wins), then use `$VAULT/`:

```bash
for v in "C:/Users/kazda/Documents/Obsidian/systedo-outreach" "<repo>/.outreach"; do
  [ -d "$v" ] && VAULT="$v" && break
done
# Default: <repo>/.outreach/ — Obsidian-openable, git-ignored (shared master with
# a concurrent vibeman agent; vault content must never enter commits).
```

```
$VAULT/
  Outreach.md                  # MoC — per-project one-liner status + next action; update every phase
  config.md                    # cadence defaults, guardrail overlay, operator taste notes
  projects/<projectId>/
    profile.md                 # grounding snapshot + operator corrections (regenerate, don't hand-sync)
                               #   MUST carry a "Posture" section: pre-launch build-up | launched.
                               #   Pre-launch = engage-only presence, waitlist-friendly channels,
                               #   content/data plays, directory groundwork — no signup-driving
                               #   targets. Ask the operator once at first research, persist it.
    targets/<slug>.md          # ONE file per target — the atom of the loop (format below)
    triage-log.md              # append-only: every accept/reject + the operator's reason
    dispatch-log.md            # append-only: every action → draft → approved? → postedUrl → outcome
    learnings.md               # distilled: what kinds of targets/posts worked or died; read before EVERY research round
```

### Target file format (`targets/<slug>.md`)

Frontmatter mirrors `OutreachTarget` from the design doc — keep field names
identical so the P4 store migration is mechanical:

```markdown
---
id: reddit-r-zubari            # slug: platform + place
platform: reddit               # reddit | facebook-group | discord | firmy.cz | forum | blog | ...
name: "r/dentistry CZ thread"
url: https://…                 # verified live at research time (WebFetch, not guessed)
kind: community                # listing | community | qa | content | pr | marketplace
selfPromoPolicy: conditional   # allowed | conditional | banned | unknown
rulesSummary: "self-promo only in weekly Friday thread, 9:1 value ratio"
rulesSourceUrl: https://…
fit: 78                        # 0–100, evidence-backed
effort: medium
status: candidate              # candidate | accepted | engage-only | rejected | active | retired
twinChannel: social            # once accepted: which voice scope speaks here
maxPerWeek: 1                  # cadence cap — enforced at dispatch, never exceeded
account: none                  # none | needed | created | authed — operator-owned auth state
createdAt: 2026-08-06
decidedAt:
---
## Evidence
- <url> — "verbatim quote showing audience/activity fit" (fetched 2026-08-06)
## Audience
Observed activity: members, post recency, language.
## First action
The one concrete opening move (answer thread X / submit listing form Y).
## History
- 2026-08-06 researched (session note)
```

## Phases

`/outreach status` — read `Outreach.md` + the project folders, report where each
project stands and the single next action. Always safe.

### `/outreach research <projectId>`

1. **Ground.** Run the dump and paste key facts into `profile.md`:
   `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --conditions react-server scripts/outreach/grounding.mjs <projectId>`
   (no arg = list projects). The dump carries scan keywords and
   `competitorSuggestions` (unverified leads — researchers verify them; the
   curated-only rule applies to LLM-as-fact prompts, not to verification).
   Read `learnings.md` and `triage-log.md` — prior rejections with reasons are
   CONSTRAINTS on this round, not suggestions. Read the posture from
   `profile.md` (ask the operator once if unset) and put it in every
   researcher prompt.
2. **Fan out researchers** (Agent tool, run concurrently, one per lens):
   directories/listings · communities (FB groups, Reddit, Discord — Czech-first)
   · Q&A + forums (live threads the project could genuinely answer) ·
   comparison/marketplaces · PR/content (guest-post blogs, newsletters, podcasts)
   · competitor trace (WebFetch curated competitors — where are THEY listed free?).
   Research is **open-ended**: the pinned channel plan in the grounding is a set
   of hypotheses to deepen, never a boundary.
3. **Researcher contract** (put verbatim in each subagent prompt): for every
   target return live URL (WebFetch it — a 404 or parked domain disqualifies),
   the community's self-promo rules as a verbatim excerpt + source URL, recent-
   activity evidence (quote + date), one concrete first action. **No evidence →
   drop the target.** Never fabricate member counts or rules; `unknown` is a
   valid selfPromoPolicy.
4. **Merge + dedupe** into `targets/*.md` as `candidate` (skip anything already
   rejected for a reason that still holds). Update `Outreach.md`.

### `/outreach triage <projectId>`

Interactive — the operator decides, the skill presents honestly:

- Rank candidates by fit; present in batches (AskUserQuestion, one question per
  batch of 3–4 with evidence + rules in the descriptions).
- A `banned` selfPromoPolicy is NEVER offered as a promo target — offer
  `engage-only` (build presence, answer questions, zero promotion) or reject.
- Record every decision + reason in `triage-log.md`; set frontmatter
  `status`/`decidedAt`, and for accepts: `twinChannel`, `maxPerWeek`, `account`.
- Rejection reasons are the loop's memory — write the operator's actual words.

### `/outreach prepare <projectId>` (bridge to P2)

For each accepted target: check the grounding dump's `twinVoices` covers its
`twinChannel`; if not, direct the operator to the twin module's voice studio (or
run the gap-question interview in-session and save via the app). Track the
`account` field — account creation/OAuth is **always the operator's own hands**;
the skill only records state and lists what's needed.

### `/outreach dispatch <projectId>` — P2, gate until design doc marks P2 open

Scout the current opportunity per `active` target (within `maxPerWeek`), draft in
the twin's voice with the target's rules verbatim in the prompt, write into the
twin draft inbox for schranka review. **First posts on every target are approved
by the operator and banked as voice training examples** — the approved text goes
back into the twin's style facts so the voice converges on posts the operator
would have written. Operator posts manually in v1; log `postedUrl` + outcome in
`dispatch-log.md`.

### `/outreach report <projectId>`

Re-check posted URLs (replies? traction?), fold outcomes into `learnings.md`
(which target kinds earn cadence, which retire), update `Outreach.md`.

## Guardrails (non-negotiable)

- **Rules first.** The target's own policy travels with it verbatim; banned →
  never promo. Conditional → the condition is in every draft prompt.
- **Identity = the operator's real accounts.** The twin writes in the operator's
  voice under accounts the operator authenticated. No invented personas, no
  sockpuppets, no fake grassroots. Auth is never automated.
- **Human gate on every send** in P1/P2. Cadence caps (`maxPerWeek`) checked
  before drafting, not after.
- **Ledger everything.** Every send has a `postedUrl` — the audit trail is also
  the retraction map.
- Vault files never enter git commits; repo commits from this skill touch only
  `scripts/outreach/`, `docs/headless-outreach/`, and this skill (pathspec
  commits, per AGENTS.md).
