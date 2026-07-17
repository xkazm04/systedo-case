# Wave 15 — AI generation/telemetry, core AI tools & skill SDK, diagnostic/twin tools, AI content UI

Module-clustered tail wave over four reports (AI generation API/telemetry, core AI
tools, diagnostic/growth/twin tools, AI content UI). **13 findings fixed** (1 High,
10 Medium, 2 Low), 0 skipped. All 20 LLM tool contracts stay green; 6 tool files
were re-proven against real Claude (7 tools total, one commit covered two).

## Commits

| # | Commit | Finding | Sev | Scope |
|---|--------|---------|-----|-------|
| 1 | `f562b17` | ai-generation #3 | M | nobg refunds the global spend unit on every no-work exit |
| 2 | `cac8ee0` | ai-content #5 | M | persist AdGenerator in-place edits (new `ad-edits.ts`) |
| 3 | `61e4241` | ai-content #3 | M | AI-status fetch retries on !res.ok + `invalidateAiStatus()` |
| 4 | `1f0acb0` | ai-content #4 | M | client abort ceiling from serving provider, not NODE_ENV |
| 5 | `d9842a1` | ai-generation #4 | M | locale-tolerant metric parse (422 on invalid, not silent 0) |
| 6 | `62675a7` | ai-generation #2 | High | metrics PATCH 404s a missing link instead of upserting a phantom |
| 7 | `01e0eb8` | ai-generation #5 | M | attribution GET carries `signedIn` for a truthful empty state |
| 8 | `78a03b9` | core-ai #3 | M | demo health score anchored to the published legend (target→65) |
| 9 | `64a9b92` | core-ai #4 | M | no demo placeholder copy leaks into a partly-real article draft |
| 10 | `e650882` | core-ai #5 | Low | article-draft prompt keeps intentional blank separators |
| 11 | `5e788fa` | diagnostic #3 | M | named CZK/ratio thresholds in the deterministic floors |
| 12 | `fd79953` | diagnostic #4 | M | twin-style converges (mature voice) + no re-asking answers |
| 13 | `935831a` | diagnostic #5 | Low | cohort demo uses the e-shop register |

## Narratives

- **ai-gen #2 (High, upsert phantom):** `updateCreativeMetrics` used Firestore
  `set(merge)` (upsert), so a stale/mistyped `linkId` created a metric-only,
  style-less document that flowed into `styleLeaderboard`/`deriveStylePrior` and
  biased future paid generations. Now pre-reads and returns `false` on a missing
  doc → PATCH 404; `listCreativeLinks` also drops style-less rows defensively.
- **ai-gen #3 (nobg global ledger):** `guardPaidGeneration` debits 1 global unit
  up front; nobg only refunded the per-user quota, stranding the global unit on
  every early return/throw. A `bail()` helper reclaims it on every no-work exit;
  the catch refunds both ledgers (mirrors `/api/images`).
- **ai-gen #4 (locale coercion):** new pure `parseMetrics`/`parseMetricField`
  accept `1,5` / `1 000`, keep 0 only for absent fields, and flag a
  provided-but-invalid field so POST/PATCH 422 instead of silently zeroing ROAS.
- **ai-gen #5 (empty vs unauth):** GET now returns `signedIn:true/false` (matching
  the images GET `offline:true` pattern); `CreativeAttribution` shows a
  session-expired notice instead of a false "no creatives yet".
- **core-ai #3 (demo score):** the demo `healthScore` scored an on-target campaign
  40/100 (bottom of "average") while the verdict praised it. Re-anchored via named
  constants: target ROAS → 65 ("solid"), ~2× → "excellent".
- **core-ai #4 (placeholder leak):** a partly-empty model draft backfilled the
  missing half from the keyless demo, splicing "Doplní AI po nastavení LLM." /
  "Ukázkový koncept" into a real draft. `validateArticleDraft` now also flags an
  empty `faq` when the brief asked for one; partial backfill uses neutral
  placeholders (empty FAQ → panel empty state); a fully-canned draft still uses the
  rich demo (meta.demo set, refund fires).
- **core-ai #5 (Low, dead builder):** removed the dead `? "" : ""` ternary and the
  blanket separator-stripping filter; skip-lines are now `null`, `""` stays a real
  separator, matching every sibling tool's builder.
- **diag #3 (magic thresholds):** hoisted the undocumented `pickCause`
  (30/200/0.35/0.15/3000) and cohort lever (`cac/ltv >= 0.4`, `m3 < 0.4`) literals
  into named, commented constants (values unchanged; CZK/SMB assumption noted).
- **diag #4 (non-converging loop):** twin-style `validate` forced ≥1 gapQuestion
  every round; now empty is a valid end state once the voice is mature (≥5 samples
  or ≥3 answered rounds), and the canned fallback is filtered against
  already-answered questions.
- **diag #5 (Low, register drift):** cohort demo recommendations now switch
  "M3 retence"/"registraci"/"Zvedněte retenci" to the e-shop pairs for `req.eshop`.
- **ai-content #3 (stale cache):** `fetchAiStatus` reset `inflight` on a non-2xx so
  a transient error no longer freezes preflight for the page's life; new
  `invalidateAiStatus()` busts the cache after a generation spends budget.
- **ai-content #4 (env↔provider):** new pure `resolveRunCeilingMs` keys the abort
  ceiling off the runtime `wouldServe` path (+2× observed latency), falling back to
  the build constant until status loads — a Claude-backed prod deploy no longer
  aborts a real result at 60s.
- **ai-content #5 (volatile edits):** AdGenerator in-place edits persist keyed by
  the active history entry's `savedAt` (new pure `ad-edits.ts`), rehydrated on
  reseed and pruned to live history.

## Verification

- `npx tsc --noEmit`: **clean** (checked before every commit; lint-staged also runs
  full-project tsc on each commit).
- `npm run test:unit`: **1719/1719 pass, 0 fail** (baseline 1698 + 21 new tests). No
  regressions. (`tenant-docs-local-store` flake did not surface.)
- `npm run llm:gate:check`: **green** — the committed cache proves the current LLM
  code; all 20 tool contracts match their goldens.
- LLM gate real re-proves (via the pre-commit hook, machine Claude subscription):
  campaign-eval, article-draft (×2), lead-source-diagnosis, cohort-diagnosis (×2),
  twin-style — all passed, cache shipped in-commit. No golden (system+schema)
  fingerprint changed; only prompt/validate/normalize/demo bytes moved.
- New tests: `test-unit/attribution-metrics-parse.test.mjs` (7),
  `test-unit/ai-run-ceiling.test.mjs` (7), `test-unit/ad-edits.test.mjs` (7).

## Behavior changes needing sign-off

- **Attribution PATCH now 404s** a missing/stale `linkId` (was a silent 200/ok).
  Any client that fire-and-forgets metric edits should treat 404 as "reload".
- **Attribution POST/PATCH now 422** on a provided-but-unparseable metric value
  (was silently stored as 0).
- **Attribution GET payload gained `signedIn`** (additive; existing consumers
  ignore it).
- **Client AI abort ceiling is now provider-derived**, so in a Claude-backed
  environment heavy tools wait longer than the old flat 60s (intended fix).
- **twin-style can now return zero `gapQuestions`** for a mature voice — the
  training UI should treat empty as "fully trained", not an error.

## Patterns

- **Every `src/lib/ai/tools/*` byte-edit forces a real re-prove**, even
  normalize/demo-only changes (the gate keys on file hash, not just the
  system+schema golden). Golden = `fingerprint(system, schema)`; the gate's
  per-tool key also folds in `prompt` + `validate`. Keeping `system`/`schema`
  untouched avoids golden regen; the pre-commit real run (machine Claude sub)
  handles the re-prove and stages the cache in-commit.
- **lint-staged runs full-project `tsc` against the working tree**, not the staged
  snapshot — so per-finding hunk splitting across a shared file is safe as long as
  the whole working tree type-checks. Shared files (`attribution/route.ts` ×3,
  `useAiTool.ts` ×2) were committed atomically by re-editing between commits.
- **Prefer neutral backfill over keyless-demo copy** in any normalize() partial
  path: demo strings carry "connect an LLM"/marketing tails written for the fully
  keyless preview and read as nonsense spliced into a live result.
