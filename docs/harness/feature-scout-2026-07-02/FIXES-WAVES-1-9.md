# Feature Scout 2026-07-02 — Implementation Waves 1–9 (all done)

> 58 planned idea-refs → **57 implemented + 1 closed-by-verification** (design-system #3 already existed).
> 55 implementation commits + 1 scan-docs commit on `vibeman/feature-scout-2026-07-02` (56 total, +10 177/−731 across 198 files).
> Quality: tsc 0 → 0 · unit **173 → 305** (+132, 0 fails) · full `next build` green after every [CLIENT] wave · seed:check ✓ · llm:gate:check ✓.
> Run in an isolated worktree (`systedo-case-fswave`) because a ship-loop agent was concurrently writing to the main checkout.

## Wave ledger

| # | Wave (execution order) | Idea refs | Result | Commits |
|---|---|---|---|---|
| 1 | W4 Dev-tooling & gate hygiene | build-tooling #1–#5, llm-test-gate #1–#3 | 8/8 | 08e7b7b…687d575 + 69cbebb (cache) |
| 2 | W1 Data-trust & staleness | campaign-connector-store #1, campaign-sync-api #1, trend-channel #2, dashboard-kpis #2 #4, article-content #3 | 6/6 | c8b47e2…fbcebbc |
| 3 | W2 Dashboard analytics depth | metrics-engine #1+dataset-seed #3 (merged), metrics-engine #2+dashboard-kpis #1 (merged), dashboard-kpis #3, trend-channel #1, metrics-engine #3 | 5/5 builds (7 refs) | cdc2d86…b8249d8 |
| 4 | W3 Shell & SEO completeness | home-app-shell #1–#5, design-system #3, nav-header-footer #1 | 6/7 (+1 already existed) | d6aa7ee…f889f17 |
| 5 | W5 Article & content surfaces | article-reading #1, article-reading #2+article-content #4 (merged), article-content #1 #2 #5 | 5/5 builds (6 refs) | 5352a16…ba07689 |
| 6 | W6 AI workbench iteration | ai-generation-api #1 #2 #3, ai-tool-forms #1 #3, ai-workspace #3 | 6/6 (#2's hashed part → W9) | ac645ae…829b99f |
| 7 | W7 Proactive machinery | dataset-seed #1 #2, campaign-connector-store #4 #5, campaign-model-prompts #2, campaign-sync-api #2 #4, llm-provider-wrapper #5 | 8/8 | 0df49a7…a31e061 |
| 8 | W8 Handoffs & batch ops | ai-workspace #1 #2, ai-generation-api #5, campaign-console #1 #4, trend-channel #3 | 6/6 | 648fb98…4b1c4d1 |
| 9 | W9 Gate-locked LLM batch (LAST) | campaign-model-prompts #1, llm-provider-wrapper #1 #3, llm-test-gate #5, + ai-generation-api #2 remainder | 5/5, ONE hashed commit | 5f4bb2d, 58b79e3, f3cfe8c (stage-1) + 398a4ce (stage-2) |

## Highlights by theme

- **The gate got cheaper and stronger (W4):** per-tool incremental v2 cache (a one-tool edit re-proves one tool, not 14), key-free `llm:gate --check` freshness lane in CI, golden-drift line diffs, `server-only` poisoning of Node-bound modules (the repo's twice-paid client/server landmine now fails at dev time), `npm run doctor`, seed drift guard + `check:ci` + e2e-smoke CI lanes.
- **The demo finally demonstrates (W7 + W1):** deterministic story events (Black Friday, tracking outage, cost runaway) make the anomaly engine, impact headlines and AI anomaly blocks actually fire; weekly sample drift makes re-syncs visibly change; degraded live syncs are labeled truthfully; stale AI reports are badged.
- **Dashboard grew real analytics (W2):** YoY baseline (the 730-day dataset finally used), required daily run-rate prescription, goal attainment history, PNO goal line, sustained-trend (slow-bleed) detection feeding insights + AI prompts.
- **The AI workspace became a workbench (W6 + W8 + W9):** per-tool history, refine-with-instructions on all 14 tools, in-place ad editing with live Ad-Strength recompute, brief→ads handoff, ?tool= deep links, a 4-step content pipeline wizard, batch "evaluate all flagged", model-tier routing (fast tools on haiku/flash-lite), request-abort propagation, change-aware campaign evaluation prompts.
- **Article/SEO completeness (W3 + W5):** branded 404/error/loading/manifest/robots, mobile TOC, Markdown twin + copy-for-AI, article OG cards, first-class table blocks, JSON-LD completion.

## Gate economics (measured this run)

- Scan-docs commit paid a full real run (cold cache): first attempt died on a Claude-CLI usage limit, retry passed.
- W6's refine work re-proved 9 tools mid-wave (~5 min) — the HASHED_FILES set now covers ALL 14 tool files (older docs claiming 5 are stale).
- W9's single hashed commit: first proving run failed 12/14 on sonnet JSON flakes → wrapper retry hardened (2→3 attempts, raw snippet in parse errors, same commit) → final run 14/14 in 511 s. The v2 cache + LLM_CAPTURE corpus seeding rode the same run.

## What remains (INDEX leftovers — 42 ideas, none [GATE])

Ready-made Wave 10 = campaign console depth (campaign-connector-store #2 #3, campaign-console #2 #3 #5, campaign-model-prompts #3 #4 #5, campaign-sync-api #3 #5). Then: design-system/helper sweeps, reader/keyboard tail, AI status/latency, ad-form polish, demo-data remainder, testing/tooling remainder. Also open: Playwright e2e extended but not executed this run; dashboard alert-focus e2e noted as a follow-up by W8.

---

# Tail close-out (T1–T6, 2026-07-03) — the whole scan is now worked

After the master merge (8fddb9a: 17 conflicts, 3 double-implementations reconciled, gate 14/14 ~484 s zero drift), all **42 leftover ideas** were implemented in 6 tail waves — **100/100 scan ideas closed** (99 implemented + 1 already-existed).

| Tail wave | Ideas | Result | Tests after |
|---|---|---|---|
| T1 Campaign console depth | 10 | 10/10 (budget pacing, per-campaign sparklines, funnel detail, pause recommendations, health timeline, type roles, batch endpoint, per-period store) | 381 |
| T2 Design-system & helper sweeps | 11 | 11/11 (toFixed sweep — 3 gate-hashed sites deferred; locale-bound builders; signed-CZK; csvNum; fmtDuration; Sparkline unification ×4 clones; contrast guard — caught+fixed a 4.43:1 accent; DeltaBadge showcase; period labels; 3-mode theme cycle) | 394 |
| T3 Reader/keyboard a11y | 9 | 9/9 (FAQ permalinks, resume-reading chip, print styles, tabs keyboard model, ⌘K palette, journey beacon, pager hotkeys, trend CSV, chart keyboard nav) | 416 |
| T4+T5 AI status & ad-form polish | 6 | 6/6 (gate-free /api/ai/status preflight + provider health + per-tool expected latency; Ads-Editor CSV; RSA combo sampler; Sklik preview) | 433 |
| T6 Demo/metrics/testing remainder | 6 | 6/6 (shared demo PRNG + envelope, impressions/clicks + CTR/CPC metrics, weekday profile card, profit metric, keyless fixture e2e, llm:new scaffold) | 455 |

Final state: **tsc 0 · unit 455/455 · next build ✓ · seed:check ✓ · llm:gate:check ✓**; zero real-model gate runs in the entire tail (all hashed sites deferred or avoided).

Remaining known-open (all deliberate): 3 gate-hashed toFixed sites (lp-variant-ideas, cohort-diagnosis, analyze route — batch with the next gate-paying change), Playwright suite extended across waves but not executed (incl. a /design-system VR baseline that needs `--update-snapshots`), dashboard alert-focus e2e.
