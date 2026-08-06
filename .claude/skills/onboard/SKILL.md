---
name: onboard
category: Growth
argument-hint: "<repoPath> [projectId] [--locale cs|en]"
description: Headless intake of a dev project into Adamant. Scans a local repository (README, docs, landing copy, pricing, deployed site) to synthesize a marketing profile, triages it with the operator, then applies it to the LOCAL_DB stores through the same seams as the in-app onboarding flow — creating the Adamant project, scan profile, competitor suggestions, keyword seed, and optional catalog. The applied project is immediately /outreach-ready. Invoke with /onboard <repoPath>.
---

# Onboard — repo scan → marketing profile → Adamant project

> The in-app `onboarding-scan` reads one homepage's text. A repo is a far richer
> source: the README says what it is, the landing copy says how it sells itself,
> the pricing config says what it charges, the i18n files say which markets it
> speaks to. This skill turns that into an applied Adamant profile so `/outreach`
> and every grounded module speak the real product from day one.

Design doc: `docs/headless-outreach/design.md` (Dev-project intake section).
Sibling loop: `/outreach` (run `research` right after a successful apply).

## Phase 1 — Scan the repo (read-only)

Given `<repoPath>` (never this repo itself — it's the target product's checkout):

1. Read, in priority order: `README*`, `package.json` (name/description/homepage),
   docs/marketing pages (landing/hero/pricing components, i18n message files),
   pricing or plan config, `CHANGELOG`/releases for launch stage, deploy config
   (`vercel.json`, env examples) for the production URL.
2. If a deployed URL is found, WebFetch it — live positioning copy beats repo
   copy when they disagree (the site is what the market sees).
3. For a large repo, delegate to one Explore subagent with the file priorities
   above; the deliverable is facts with file-path provenance, not impressions.
4. Extract: what it is, who it's for, how it's positioned, what it charges,
   which language(s) its audience speaks, launch stage, and any competitors or
   alternatives named in docs/comparisons.

## Phase 2 — Synthesize the marketing profile

Build ONE JSON file. The `scan` block must satisfy `sanitizeScanProfile`
(`src/lib/onboarding/types.ts` — `summary` or `offering` required; keywords ≤12,
competitors ≤8). Write profile content in the audience's language (`--locale`,
default `cs` — matches the in-app scan and the Czech-first market; use `en` for
an international-audience product).

```json
{
  "project": { "name": "…", "type": "app", "domain": "product.example" },
  "scan": {
    "businessName": "…", "summary": "…", "offering": "…",
    "audience": "…", "toneOfVoice": "…",
    "keywords": ["…"], "competitors": ["…"],
    "suggestedType": "eshop|app|leadgen|content|local",
    "scannedUrl": "https://…"
  },
  "offerings": [ /* optional: plans/services for the catalog, passed through sanitizeOfferings */ ],
  "extras": {
    "valueProps": ["…"], "differentiators": ["…"],
    "pricing": "…", "launchStage": "pre-launch|launched|growing",
    "communityHints": ["where this product's audience already gathers"]
  }
}
```

`extras` is NOT stored in Adamant (no schema for it) — it lives in the outreach
vault as researcher grounding. Everything in `scan` is honest: derived from the
repo/site, no invented numbers, competitors are suggestions the stores keep
unconfirmed until curated.

## Phase 3 — Triage with the operator

Present the profile (the `scan` block verbatim + extras) and iterate until the
operator confirms. Type, name, and competitor list are operator decisions;
everything else is correctable copy. Record corrections — they are taste data
for the next onboarding.

## Phase 4 — Apply + verify

```bash
# write the confirmed JSON to the outreach vault first (see /outreach for $VAULT)
$VAULT/projects/<projectId-or-pending>/profile.source.json

node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --conditions react-server \
  scripts/outreach/apply-onboarding.mjs <profile.json> [existing-projectId]
```

The script mirrors the in-app apply route exactly: scan profile saved +
`scanApplied`, competitors MERGED as unconfirmed `scan` suggestions (never
replacing curated), keyword list seeded idempotently, optional catalog write. It
prints a receipt with the `projectId` — if it created the project, rename the
vault folder to the real id and record it in `Outreach.md`.

Verify the round trip:

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --conditions react-server \
  scripts/outreach/grounding.mjs <projectId>
```

The dump must show the profile, keywords and (unconfirmed ⇒ absent) competitors.
Then hand off: `/outreach research <projectId>`; the operator can inspect the
project any time in the app via `npm run dev:local`.

## Guardrails

- The scan never executes the target repo's code — read-only file access plus
  at most a WebFetch of its already-public site.
- Never apply an unconfirmed profile; Phase 3 is mandatory.
- Competitor entries stay unconfirmed until the operator curates them in-app —
  that is what keeps them out of LLM grounding (`curatedCompetitors`).
- Local-dev only: both scripts force `LOCAL_DB` and refuse production.
