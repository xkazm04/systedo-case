# Fix Wave 3 — Persistence & History (systedo-case)

> 3 atomic commits. The campaign data layer stops being a single destructive
> snapshot: it keeps time-series history, dedupes re-evaluations, and shows what
> changed since the last sync.
> Baseline preserved: 0 TS / 0 lint → 0 / 0. Production build ✓.

Date: 2026-06-15. The convergent data-layer theme (`campaign_snapshots` was proposed
by 3 contexts) — and the foundation the deferred steering loop needs.

## Commits

| Commit | Fix | Finding |
|---|---|---|
| `9f34d23` | append-only `campaign_snapshots` history | campaign-connector-store #1 (Critical) |
| `b8abc2c` | evaluation fingerprint dedupe | campaign-sync-api #1 |
| `d0f6ea0` | "what changed since last sync" diff + strip | campaign-sync-api #2 + campaign-console #4 |

## What was built

1. **`campaign_snapshots`** — `upsertCampaigns` did a destructive `DELETE FROM
   campaigns` that discarded the prior state. It now also writes a per-campaign
   snapshot (cost/conversions/value/status, tagged with the sync timestamp) inside
   the same transaction. The time-series foundation the rest of the wave reads.
2. **Eval fingerprint dedupe** — `reports` gains an `input_hash` (additive column +
   a guarded `ALTER` for existing dbs). `hashEvalInputs` fingerprints exactly what an
   evaluation depends on (scope, target, period, the in-scope campaigns' raw metric
   tuples); the analyze route short-circuits to the cached report when inputs are
   unchanged — **no paid LLM call, no duplicate score-timeline point**. `?force=1`
   bypasses. Immediately demoable (click "Analyzovat" twice → second is instant/free).
3. **Change diff + `ChangeStrip`** — `getLatestChanges()` diffs the two most recent
   snapshot batches into added/removed/changed campaigns with per-metric deltas
   (client-safe shapes live in `types.ts`, since the strip is a client component and
   `store.ts` is server-only). Surfaced in `loadState`, rendered as a strip above the
   by-type breakdown: ROAS before→after and the conversion-value swing per mover.

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 (per commit) |
| `eslint` | 0 |
| `next build` | ✓ |
| LLM gate | pass |

## Patterns established (catalogue, cont.)

15. **Snapshot before destroy** — a sync that `DELETE`s and re-inserts must first
    append a timestamped snapshot, or it permanently loses the history every trend /
    diff / "what changed" feature needs.
16. **Fingerprint to dedupe paid work** — hash the exact inputs a paid call depends
    on; short-circuit identical re-runs to a cached result (with a `?force` escape).
17. **Client-safe shapes in the framework-free layer** — types a client component
    needs (here the change diff) belong in `types.ts`, not the server-only `store.ts`,
    so the client never imports `node:sqlite`.

## Demo caveat (honest)

The sample connector is deterministic, so re-syncing the *same period* yields
identical campaigns → the ChangeStrip shows "beze změn". It lights up across **period
switches** (7d → 90d differ) and would light up fully once the sample provider injects
per-sync drift (campaign-connector-store #5, not in scope). The dedupe and snapshot
history are unaffected and demoable as-is.

## What remains
- **AI-output persistence** (ai-generation-api #2: a `generations` table for the
  ads/brief/analysis tools) — same persistence theme, *different surface* (the AI
  assistant, not campaigns). Deferred to keep this wave on the campaign data layer.
- **recommend → simulate → *measure*** (Wave 2 leftover) is now unblocked: persist the
  projected target next to the report and score advice met/unmet on the next sync.
- Other open waves (INDEX): 4 (AI content), 6 (locale), 7 (pipeline/SEO).
  Done: Wave 5, Wave 1, Wave 1b, Wave 2, Wave 3.
