# UAT run — 2026-08-29 · `find-free-channels` L2 (kanaly)

**Level**: L2 (empirical — real browser, real model, live app)
**Journey**: `uat/journeys/find-free-channels.md`
**Characters**: Standa (pre-launch maker, `app`, URL-first) · Radek (bootstrapped
consultant, `leadgen`, catalog-first)
**Reports**: `standa--find-free-channels-l2.md` · `radek--find-free-channels-l2.md`
**Evidence**: `shots/` (screenshots, DOM text dumps, wire requests/responses,
metrics) · `driver/` (the Playwright drivers, re-runnable)

## Engine actually used

**Claude Code CLI, model `claude-sonnet`, on the operator's subscription.** Every
call in this run reported `meta.demo:false`, `provider:"claude-sonnet"`,
`fellBack:false`, `attempts:1`. `providerOrder(dev=true)` puts the keyless CLI ladder
ahead of Gemini (`src/lib/llm/provider-order.ts:26`); `GEMINI_API_KEY` is configured
in `.env.local` but is only reached when the CLIs are unavailable, and they were not.
So this run certifies the **dev-shaped** engine, not the production Gemini path —
which remains unmeasured for this tool (it is one of the six "unbaked" ops with no
public scorecard score).

## Verdict

| | Verdict |
|---|---|
| Standa × find-free-channels | **L2-conditional** |
| Radek × find-free-channels | **L2-fail as measured → L2-conditional after this run's fix** |
| Journey `find-free-channels` | **L2-conditional** |

The core path works, live, end to end, for both characters: a URL or an existing
project is genuinely enough to start; the plan is 8–9 named Czech channels ranked by
fit with real first actions; the pin survives a reload; a per-channel decision
survives a reload — this run is the first to drive the wizard against a **pinned AI
plan** rather than the seeded one; and the single visibility plan really does read
identically from `/kanaly` and `/klicova-slova`. No step asked for a budget, an ad
account, or an existing audience.

It is conditional because of one root cause with two faces: **`POST /api/projects`
persists a starter catalog of stand-in rows, and the grounding rule counts them as
facts the tenant curated.** For Radek that reached the screen as advice about
"Ukázková služba A". For Standa it silently outranked the offering his own website
scan had just extracted.

## Latency (measured, wall / server)

| Call | Standa (`app`) | Radek (`leadgen`) |
|---|---|---|
| `onboarding-scan` | 18.3 s / 11.8 s | not run (catalog-first branch) |
| `channel-research` | **43.3 s / 42.6 s** | **37.8 s / 36.6 s** |
| `channel-research` re-run post-fix | — | 61.9 s / 49.5 s (cold webpack server) |
| Přegenerovat (cache hit) | 0.8 s, identical plan, undisclosed | — |

Cold start for Standa — empty project to pinned tailored plan — was **~62 s of model
time**. The client ceiling is 150 s. The page reports its own latency to the user
("Vygenerováno modelem · 43 s"), which is the right behaviour and is only wrong in
the cache case.

## Findings

| id | Character | Sev | Title | State |
|---|---|---|---|---|
| **L2-KAN-001** | Standa | major | Persisted starter catalog outranks the tenant's applied website scan in the grounding (Předplatné / Free / Pro / Team) | **open — M, recorded** |
| **L2-KAN-002** | Standa | major | Mobile channel table clipped its last column, hiding the per-row CTA with no way to scroll | **fixed + re-verified live** |
| **L2-KAN-003** | Standa | minor | After a reload the app offers to "replace the sample plan" with the plan already pinned | **fixed + re-verified live** |
| **L2-KAN-004** | Standa | minor | Přegenerovat is a silent no-op inside the 15-min cache and reports the original call's latency | **open — M, recorded** |
| **L2-KAN-005** | Standa | minor | The sample gutter on this module talks about ad-account data and cites non-existent "Seam" notes | **open — S, out of scope** |
| **L2-KAN-006** | Radek | **blocker** | Starter-catalog placeholder service names asserted as fact and returned as advice | **fixed + re-verified live** |
| **L2-KAN-007** | Radek | minor | "Register here" channels arrive without registration links (0/8 for Radek, 2/9 for Standa) | **open — S/M, recorded** |
| **L2-KAN-008** | Radek | minor | A field-count grounding score cannot see a grounded lie (method note for the journey) | **open — doc** |

## Fixes landed in this run

All three are S-sized, gated, and each was re-measured live against the fixed code
before being written up.

1. **`src/lib/organic-channels/grounding.ts`** — a grounding value the product itself
   wrote as a placeholder never grounds the model (leading ukázkov* / vzorov* /
   sample / demo / example / placeholder, plus the starter's whole-string stand-in
   categories such as "Hlavní kategorie"), and a catalog that is the illustrative
   **seed** rather than saved rows grounds nothing at all (`catalogIsSample`,
   supplied by `/kanaly` via `loadProjectCatalogWithSource`). The seeded plan's
   `{category}` fill is deliberately untouched — that plan is labelled "Ukázkový
   plán" on screen, the prompt is not. **+9 unit tests.**
2. **`src/components/app/channels/ChannelTable.tsx`** — the table scrolls
   horizontally instead of clipping (`overflow-x-auto overflow-y-hidden`,
   `min-w-[26rem]`).
3. **`src/components/app/modules/OrganicChannels.tsx`** — the "apply this plan"
   banner is suppressed when the generation in hand is already the pinned plan,
   compared by identity against what the server rendered rather than by an in-memory
   flag a reload resets.

**Gate (in the worktree):** `tsc --noEmit` clean · `eslint .` **0 errors** (166
pre-existing warnings) · `npm run test:unit` **2602 pass / 1 fail** — the single
failure is `test-unit/patterns-embeddings.test.mjs`, a pre-existing red on this box
(needs local GCP credentials; green in CI, named as such in
`.claude/ship-loop/state.md`) and untouched by this work · `npx next build --webpack`
exit 0.

## Not done, and why

- **K01–K06 could not be closed by id.** `uat/runs/2026-08-28-kanaly-l1/SUMMARY.md`
  **does not exist**: `/uat/runs/` is gitignored (`.gitignore:81`), so the L1 run was
  never committed and went with the worktree it was written in. It survives only as
  prose — K01 in `docs/adr/0009-free-channels-lead-the-onboarding-checklist.md:29`
  (which says so explicitly: run directories under uat/ are gitignored) and K05 in
  `tests/support.ts`. This L2 was therefore certified against the **journey's own L2
  checklist**, which is the durable contract, and every item of it is answered in the
  two reports. K06 is reported as *not closable by reference*, not as closed. This
  run's directory is committed with `git add -f` for the same reason; the root ignore
  rule and `uat/.gitignore`'s note that "the textual findings, reports and journals
  next to them ARE committed" contradict each other, and the root rule wins.
- **The degraded path** (saved plan unreadable, so no control may accept a decision
  it cannot save) was not reached. Inducing it means corrupting the store, which is
  state the operator owns. Remains L1-only.
- **The rename/reconcile path** was not exercised live: the only regenerate in the
  run was served from the response cache and returned an identical plan, so no
  channel was ever renamed (L2-KAN-004).
- **The production engine (Gemini) is still unmeasured** for `channel-research`.
- **The public demo shell's `kanaly` case** (`DemoModule` has one, `DemoShell` has no
  nav entry) was not investigated — out of journey scope.

## Environment notes (not product findings)

- Turbopack **cannot run this repo from a git worktree with a junctioned
  `node_modules`**: "Symlink [project]/node_modules is invalid, it points out of the
  filesystem root" (fatal panic). `next dev --webpack` works. Worth knowing for any
  future worktree-based L2 run.
- `/api/ai/status` took **17–27 s** on this box because the durable rate limiter
  reaches for Firestore with no ADC credentials in `LOCAL_DB` mode and retries. It
  gates the tailor CTA, so any driver must wait for the button to be *enabled*
  rather than for a fixed settle. Local-only; Firestore is reachable in production.
- The whole run used a scratch `SYSTEDO_DB_FILE` inside the worktree. The operator's
  `.data/systedo.db` and the main checkout were never written to.

## Rating input

**Free-Channel Discovery (Kanály zdarma): 4 / 5.** The plan quality, the latency, the
persistence and the cross-module artifact all clear both characters' bars on live
evidence, and the one thing that made the output untrustworthy has been fixed and
re-measured — but the same root cause still has an unfixed face (L2-KAN-001), and the
production model path has never been scored.
