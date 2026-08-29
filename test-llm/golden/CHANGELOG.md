# Golden contract ledger

Every accepted change to an LLM tool's contract — its system prompt or its output
schema — is recorded here, with the fingerprint it moved from and to, and the
reason it was accepted.

**Why a ledger and not just the diff.** The goldens already make a prompt change
visible: `scripts/llm-eval.mjs` fails the gate when a tool's fingerprint drifts,
and the golden file itself diffs as readable text. What that could not tell you
is whether the change was *intended*. Re-baking a golden is precisely how a
regression gets absorbed into a baseline — the reviewer sees a hash and two
hundred lines of prompt, and the fact that a behaviour was traded away appears
nowhere on the page. So acceptance now carries a reason, and the reason lives
next to the hashes forever.

**How it is enforced.** `node scripts/llm-eval.mjs --update` refuses to run
without a `--reason`, rejects the words people type to get past a prompt
(`update`, `fix`, `wip`, …), and appends the entry below. The check side — which
runs in the pre-commit hook and in CI through `scripts/llm-gate.mjs` — verifies
that the **newest row for each tool matches the fingerprint actually committed**.
A golden edited by hand passes the drift check by construction (it now matches
the registry, because that is how it was edited) and fails here.

**Format.** Append-only, oldest first. The last row mentioning a tool is its
current claim. To accept a change:

```bash
npm run llm:eval:update -- --reason "chat: refuse to invent figures the grounding block does not contain"
```

---

## 2026-08-26 — ledger seeded

Provenance ledger introduced. This first entry records the fingerprints as
committed at the time the ledger was added; it makes no claim about *why* those
twenty contracts read the way they do — that history is in `git log` and in the
prompts themselves. Every change from here forward carries its reason.

| tool | from | to |
|---|---|---|
| ads | — | 153848e7e409aed6 |
| analysis | — | 4252a456bb56d723 |
| article-draft | — | b9a285bdfb1bedc0 |
| brief | — | eda325220c6605e2 |
| campaign-eval | — | 638744d64337a6fd |
| channel-research | — | 3ebb6e442c386bcb |
| chat | — | bf6aea16557ec7fe |
| cohort-diagnosis | — | 522b51e67b877731 |
| comparison-outline | — | 0d24edcc527cd1ec |
| keyword-clusters | — | 04d0aad40bf6afd0 |
| lead-source-diagnosis | — | 491215bd90c0492b |
| local-diagnosis | — | 61e66c9eda9838fa |
| local-review-reply | — | 5d4a27724638835e |
| lp-variant-ideas | — | b1645e5beb027b28 |
| monthly-recap | — | b0cc079c12253a4e |
| onboarding-scan | — | f732dcc52a0de832 |
| repurpose | — | 477112d2c6590b01 |
| social | — | d242c5030bc0cba3 |
| twin-reply | — | ecd4ef468762bdea |
| twin-style | — | ad3168196ab640e4 |

## 2026-08-28 — channel-research

channel-research: fixture replaced the paraphrased system prompt and summarised schema with the production CHANNEL_RESEARCH_SYSTEM and CHANNEL_RESEARCH_SCHEMA verbatim, so the golden pins the app's real contract instead of a hand-written copy of it (backlog 22, ship gap T4); no production prompt or schema was changed

| tool | from | to |
|---|---|---|
| channel-research | 3ebb6e442c386bcb | b78a5a2a23afd349 |

## 2026-08-29 — ads-diagnosis

ads-diagnosis: new ads-performance diagnosis tool (WP W1-D) — first golden for its contract; system prompt names the six portfolio causes and forbids cross-currency sums (ADR-0010), schema adds affectedCampaignIds bounded to supplied campaign ids

| tool | from | to |
|---|---|---|
| ads-diagnosis | — | 62d270ef58c2532e |

## 2026-08-29 — local-page

local-page: new gap-to-page local landing tool — first golden for its system prompt and page schema (headline/intro/sections/faq/cta), with the no-NAP anti-fabrication rules baked into the contract

| tool | from | to |
|---|---|---|
| local-page | — | 6f56f58e889151df |
