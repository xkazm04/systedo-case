# Moonshot orchestration plan — 15 accepted cards, parallel Opus builders

Source deck: [`moonshot-deck-2026-08-29.md`](moonshot-deck-2026-08-29.md). Build law: `.claude/perfect/config.md`
(shared `master`, pathspec commits, concurrent vibeman agent, one `next dev` per machine, gates).

## 0. Operating model

| Role | Who | Does |
| --- | --- | --- |
| **Director** | Fable 5 (this session) | writes every spec, owns the hotspot files, dispatches builders, reviews every diff, merges, runs the whole-tree gates, drives smoke |
| **Builder** | Opus subagent, one per work package (WP), `isolation: worktree` | builds from the spec ONLY, verifies with `npx tsc --noEmit` + targeted `test:unit` + `npx eslint <files>`, returns a report: diff summary, gates run, what it could not verify, **seam requests** |
| **Spec** | `docs/specs/wp-<id>.md`, written before dispatch | Goal · Non-goals · Seams (`file:line`) · Data contract (types, store trio, migration) · Invariants (ADR refs) · Build steps · Gates · Acceptance (a number) · Hotspot requests · Rollback |

**Why worktrees, not one checkout:** several builders committing into one index collide, and the vibeman agent already shares `master`. Each builder gets `git worktree` + branch `wp/<id>`; the Director rebases onto `master`, runs `npm run check && npm run test:unit`, and lands it with a path-scoped commit. Builders never run `next dev` (dev-lock); they verify with tsc + unit tests, as the overlay already prescribes.

**Hotspot rule (the conflict-avoidance mechanism).** These files are edited by many WPs and are the only real source of merge conflict. Each wave names exactly ONE owner per hotspot; every other builder writes a *seam request* (exact insert, exact anchor) in its report and the Director applies it in a batched "seams" commit between waves.

| Hotspot | Why it collides | Owner rule |
| --- | --- | --- |
| `src/lib/db.ts` (`MIGRATIONS`, DDL) | every new store trio appends a migration | append-only, one migration per WP, Director numbers them at merge |
| `vercel.json` + `src/app/api/cron/*` | three cards want a new cron | **one new cron** `/api/cron/ledgers` with sub-steps (conversions drain, webhook retry, go-link rollup, social read-back) — owned by F4 |
| `src/app/api/ai/modes.ts` + tool registry + goldens | every new `llm-tool` | one LLM-touching WP per wave; commit with the gate `run_in_background` |
| `.github/security/sast-allowlist.json` | every public route | Director-only, with the written reason from the spec |
| `src/lib/projects/delete-cascade.ts` / `duplicate-cascade.ts` registries | every new per-project store | seam request; Director applies |
| `src/lib/insights/aggregate.ts` producers | several cards add a `Recommendation` producer | one producer WP per wave |
| `src/lib/campaigns/control-plane*.ts`, `mutations.ts` | cards 1, 3, 2 all touch the envelope | serialized: F2 → W3-A → S1 → S3 |
| `context-map.json`, `.ai/manifest.yaml` | Class C | Director-only after each wave (`/contexts` rescan) |
| colocated `T` dicts, barrel exports | Class B | builder edits its own component's `T`; never a shared dict |

## 1. Work packages and write sets

Sizes are the deck's. "Write set" is the directory/file ownership the builder may touch; anything else is a seam request.

### Foundations (Wave 0) — serial, Director-reviewed line by line; everything downstream stands on them

| WP | From card | Write set | Delivers |
| --- | --- | --- | --- |
| **F1 Channel ledger (read side of #1)** | 1 | `src/lib/report-metrics/**`, `src/lib/campaigns/{types,connector,provider-precedence,sync}.ts`, `src/lib/campaigns/store/**`, `src/lib/sklik/adapter.ts`, `src/lib/google/ads.ts` (segment select only) | `platform` on `Campaign`/`SnapshotEntry`; `MetricsSource` gains `sklik`; per-source report-metrics blob with tolerant legacy reader; `channel_ledger` store trio; provider fan-out = union of connected sources (single-source tenants byte-identical, fixture-pinned); `buildLiveDataset` emits `channels` + `channelDaily` from the ledger. **Composite tenant suffix for two accounts needs ADR-0010 first** (amends 0002). |
| **F2 Control plane offline** | 1, 3 | `src/lib/campaigns/control-plane.ts`, `store/backend.ts` | change-sets / mutations / alerts move onto `TenantDocStore` (sqlite twin) — closes the documented out-of-scope; no behaviour change (fixture-pinned). |
| **F3 Microsite registry twin + kind** | 12, 15 | `src/lib/microsite.ts` (+ `store.local.ts`, dispatcher) | `MicrositeConfig.kind: "performance" \| "local-landing" \| "lp"` + LOCAL_DB backend; `/m/[slug]` unchanged. |
| **F4 Ledgers cron + outbound seam** | 2, 13, 29, 9 | `src/app/api/cron/ledgers/route.ts`, `vercel.json`, `src/lib/cron/**` | one guarded cron with a sub-step registry (`{ id, due(), run() }`), `recordCronRun` per step, `SentGuardKind` widened. Later WPs register a step; nobody else edits `vercel.json`. |

### Wave 1 — six builders, disjoint write sets, no foundation dependency

| WP | Card | Write set | Hotspot requests |
| --- | --- | --- | --- |
| **W1-A Catalog change ledger** | 27 | `src/lib/catalog/events*.ts` (+ store trio), `src/app/api/projects/[id]/catalog/**`, `src/lib/inventory/sync.ts` (hook only) | migration; cascade registries |
| **W1-B Publishing calendar + cadence** | 24 | `src/lib/publishing/**` (new), `src/components/social/WeekPlanner.tsx`, `ContentSchedule.tsx`, `src/lib/distribution/handoff.ts`, `src/components/app/twin/TwinOutbox.tsx` (slot only), `ChannelPlaybook.tsx` pill | insights producer (cap/collision) |
| **W1-C Dual-engine local pack** | 16 | `src/lib/local-signals/**`, `src/lib/mappack/**`, `src/components/app/modules/{MapPackClient,RankLadder,LocalSourcePanel}.tsx`, `src/lib/diagnoses/local-request.ts` | none |
| **W1-D Ads diagnosis kind** | 23 | `src/lib/diagnoses/**` (except local-request), `src/lib/ai/tools/ads-diagnosis.ts`, `src/app/app/[projectId]/vykon/**`, digest-plan/run | **modes.ts owner this wave**; registry + golden (`llm:eval:update --reason`) |
| **W1-E Outbound event bus** | 29 | `src/lib/outbound/**` (new), `src/app/api/projects/[id]/webhooks/**`, `src/lib/integrations/compute.ts` (one row), hooks in `alerts.ts`/`activity` (emit call only) | migration; sast (SSRF-guarded route); registers a retry step with F4 |
| **W1-F Response-curve reallocation** | 19 | `src/lib/metrics/response-curve.ts` (new), `src/lib/profit/compute.ts`, `src/lib/metrics/pacing.ts`, `ProfitReallocationPanel.tsx`, `GoalPacing` | none (simulate.ts calibration deferred to W3-A to avoid the control-plane hotspot) |

### Wave 2 — five builders; needs F1/F3 and specific Wave-1 landings

| WP | Card | Write set | Depends on |
| --- | --- | --- | --- |
| **W2-A Organic outcome ledger** | 13 | `src/lib/organic-channels/outcomes*.ts`, `src/app/go/**` (route), `src/lib/distribution/{utm,provenance,learnings,sample}.ts`, `visibility-plan.ts`, `src/lib/content-engine/resolve.ts`, kanály table `measuredFit` | W1-B (handoff.ts landed); F4 (rollup step); sast (public `/go`) — **modes.ts owner** (channel-research grounding) |
| **W2-B Public `/sken`** | 21 | `src/app/sken/**`, `src/components/marketing/kanaly/**`, `src/lib/onboarding/{claim-token}.ts`, `src/lib/analytics/funnel` | W1-D landed (modes.ts free); adds `onboarding-scan-public` mode as a **seam request**, not an edit; sast |
| **W2-C Gap-to-page local microsites** | 15 | `src/lib/ai/tools/local-page.ts`, `src/app/m/[slug]/**` (local-landing branch), `src/lib/local-signals/resolve.ts` (overlay), `LocalModule.tsx`, `CoverageCell.tsx` | F3; W1-C landed (local-signals free); LLM gate |
| **W2-D Outbound product feed** | 4 | `src/lib/catalog/{feed-out,feed-labels}.ts`, feed-tokens store trio, `src/app/api/feed/[token]/**`, Katalog `FeedOutPanel`, `inventory-plan` effects | W1-A landed (catalog routes free); sast; migration |
| **W2-E Realized-impact ledger (change-sets)** | 3 (narrow half) | `src/lib/campaigns/{realize,calibration}.ts`, `control-plane-types.ts` (additive `realized`), `simulate.ts` (multiplier), post-sync hook in `sync.ts`, console ledger row | F1, F2; W1-F landed (simulate.ts free) |

### Wave 3 — four builders; the big spines

| WP | Card | Write set | Depends on |
| --- | --- | --- | --- |
| **W3-A Advice ledger (generalises W2-E)** | 3 | `src/lib/advice/**` (new), `src/lib/insights/{types,aggregate}.ts` (`subjectKey`, snapshot, locale-free id), `src/lib/report/{recap-context,assemble}.ts`, status route, Overview chips, digest section | W2-E; **insights producer owner** |
| **W3-B Hosted LP experiments** | 12 | `src/lib/lp-exp/**`, `src/app/m/[slug]/lp/**`, `src/app/api/m/**` (convert), `src/lib/analytics/**` (arm counters), `LpExperimentsManager/Module.tsx`, `lp-variant-draft` tool | F3; W2-C landed (`/m/[slug]` free); LLM gate; sast |
| **W3-C Conversion ledger + CSV connector** | 2 (safe half) | `src/lib/leads/{conversion-events,mutate}.ts` + store trio, `src/lib/conversions/**` (connector seam, `csv` impl), Kvalita leadů strip, F4 step | F4; migration; cascade. **No live upload here** (→ S3) |
| **W3-D Twin intake + social read-back** | 9 (safe half) | `src/lib/twin/{connectors,inbound}*.ts` + store trio, `src/app/api/twin/inbound/**`, `src/lib/social/{providers,publish,types,store}.ts` (`reply`, `insights`), `social_post_metrics` trio, Schránka reads inbound, F4 read-back step | F4; sast (HMAC routes); Meta/LinkedIn adapters fixture-tested. **No autonomous delivery here** (→ S2) |

### Special care (Wave 4) — serialized, Director drives or pairs; each is irreversible or contract-breaking

| WP | Card | What makes it special | Precondition |
| --- | --- | --- | --- |
| **S1 Sklik write path + cross-platform moves** | 1 | first real Sklik mutation (method names offline-unverifiable → isolated constants + `halereConfirmed` refusal); `AdsMutator` seam; per-platform snapshots + revert; `crossSource` guardrail off by default | ADR-0010 accepted; F1, F2, W2-E landed; live Sklik creds for a fixture-then-real proof |
| **S1b Query-level negatives in the envelope** | 8 (merged) | `search_term_view` + Sklik query stats store; `negative`/`promote` move kinds with criterion-level revert; "terms with conversions never eligible as negative" invariant test-pinned; optional Czech lemma tool (LLM gate) | S1 |
| **S2 Twin delivery + autonomy on the wire** | 9 | real sends are irreversible: `decideDraft` becomes safety-critical, `maxPerWeek` enforced by the dispatcher, `mayContact` gates every cadence draft, `sentAt` still minted only by the claim path | W3-D, W1-B (calendar cadence) |
| **S3 Live conversion upload (Google click-conversion, Sklik import)** | 2 | double-counting risk → first mapping approved via change-set, dry-run CSV precedes first live upload | W3-C, F2 |

## 2. Wave schedule and gates

```
Wave 0  F1 ──► F2 ──► F3 ──► F4          (serial; Director + one Opus each; ADR-0010 written before F1)
Wave 1  W1-A  W1-B  W1-C  W1-D  W1-E  W1-F   (parallel; modes.ts → W1-D; producer → W1-B)
        └ seams commit (migrations numbered, cascade registries, sast entries) ┘
Wave 2  W2-A  W2-B  W2-C  W2-D  W2-E          (parallel; modes.ts → W2-A; producer → none)
        └ seams commit ┘
Wave 3  W3-A  W3-B  W3-C  W3-D                (parallel; modes.ts → W3-B; producer → W3-A)
        └ seams commit · /contexts rescan · docs sync ┘
Wave 4  S1 ──► S1b ──► S2 ──► S3              (serial, special care)
```

**Per WP:** spec → dispatch (worktree, branch `wp/<id>`) → builder report → Director review against the spec's acceptance number and the repo law list (primitives, tokens, Cache Components, `T` dicts, store/resolver seam, chokepoint) → rebase → `npm run typecheck && npx eslint <files> && npm run test:unit` → path-scoped commit on `master` → `npm run build` once per wave.
**Per wave:** seams commit → full `npm run check:ci` → smoke on the one `next dev` (Director) → `/contexts` rescan → outbox progress nodes.
**Demotion rule (from scan-sweep §7.4):** a WP that grows past its write set mid-build stops, reports, and is re-specced — never forced.

## 3. Spec template (`docs/specs/wp-<id>.md`)

```markdown
# WP <id> — <title>            card #<n> · size · gate · wave
## Goal (one sentence, the acceptance number)
## Non-goals (what the builder must NOT touch — names the hotspots and the special-care rungs)
## Seams  (file:line for every read/write; the store-trio pattern to copy; the resolver it extends)
## Data contract (types verbatim, store trio names, migration DDL, legacy-read rule)
## Invariants (ADR-0001 both backends · ADR-0002 owner-derived key · ADR-0003 one chokepoint · Cache Components · honest sample labels)
## Build steps (ordered, each ≤ one commit)
## Gates (exact commands; which tests must go red-then-green)
## Acceptance (the measurement: count / fixture assertion / e2e)
## Hotspot requests (exact insert + anchor for db.ts / cascade / modes.ts / sast / vercel.json)
## Rollback (what to revert; what data a rollback strands)
```

## 3b. Wave 0 outcome (2026-08-29) — DONE

Landed on master, in this order: F4 `7e5d858e` · F3 `e55eabbe` · F2 `d923d8f9` · F1 `ed6477f0`
(ADR-0010 + specs `77b7093d`). Whole-tree `build` green, `test:unit` 2662/2662, `agents:surface`
+ `adr:check` green; `sast` raw-engine ratchet lowered 18 → 15 (the 3 blocking findings it
prints predate the wave).

**What changed against the plan, and why:**
- ADR-0010 replaced the "composite tenant suffix" idea: per-account tenants already exist, so
  a project *reads the union* — no key migration. The "channel ledger" is the per-source
  `sources` sections inside the report-metrics blob, not a new table.
- The four builders ran in parallel in the main checkout (disjoint write sets), not in
  worktrees — the serial-review promise held (every hunk reviewed before its commit).
- The worktree is checked out CRLF with `autocrlf=false`: every touched file must be LF-normalized
  (`sed -i 's/$//'`) before commit or the diff is whole-file. Builders caught it; the Director
  hit it once. Put it in every builder brief.

**Carried forward (not blockers, but owed):**
- **W1-G (new, M): campaigns console union read.** `listCampaignsForProject` exists and is
  tested; `api/campaigns/route.ts` + `state.ts` still assemble a single-tenant state. Switch the
  route + state assembly + client derive together, and only then change the `kampane` copy
  from "Google Ads". Owner: whoever takes W2-E or a Wave-1 slot.
- `alerts.ts` still imports firestore for the tenant ROOT doc (`criticalAlertState`) shared
  with `anomaly-alerts.ts` — needs a root-doc pair on `TenantDocs` (M, no owner yet).
- `src/app/api/microsite/route.ts:111-115` maps every non-`invalid-slug` error to 409;
  `invalid-kind` needs its own branch + cs/en string when W2-C/W3-B add a kind picker.
- Sklik report section window is 90d (the adapter takes a `CampaignPeriod`), Google's is 400d;
  stamped honestly on the section's `days`. Widening it is an adapter change.
- `src/lib/db.ts:1070` says "28-table schema"; it is 36. Cosmetic, fix when next in the file.
- `context-map.json` is Class C: the Director mapped the 8 new files this wave.

## 3c. Wave 1 outcome (2026-08-29) — DONE

Seven parallel Opus builders in the MAIN checkout (not worktrees), specs `62aa5b09`, landed in
review order: A `c828de67` · F `b3ae8627` · C `390798c9` · D `5899d4ec` · G `2d55c793` ·
E `6081f634` · B `0a598138` · seams `711503a7`. Whole-tree `check` (tsc+lint+build) green,
`test:unit` 2940/2941 (1 skipped), seed/adr/llm-gate/llm-quality/agents-surface green; `sast`
red on the SAME 3 pre-wave findings (architect backlog), raw-engine ratchet 15/15.

**What changed against the plan:**
- W1-G ran inside Wave 1 (the wave-0 carry-forward), so the wave was seven builders.
- Migrations: A=v25 (`catalog_events`), E=v26 (`webhook_configs`/`webhook_deliveries`) — the two
  builders self-coordinated contiguity in-tree; the Director staged each WP's migration into its
  own commit via curated index blobs (`git hash-object` + `update-index`), since `git commit
  <paths>` would have committed working-tree content.
- **Trap (new):** the pre-commit whole-tree `tsc` + lint-staged's stash of unstaged halves of
  partially-staged files means you CANNOT partially stage a file that other builders' unstaged
  files depend on (W1-F's DashboardClient attempt failed exactly this way). Resolution: a
  co-owned file lands whole with the LAST WP that needs it, noted in both commit messages.
- W1-F rejected (not clamped) fitted slopes ≥ 1 — b=1 IS constant ROAS; on the sample dataset
  nothing fits and every visible number is byte-identical. The feature activates on accounts
  that genuinely saturate.
- gitleaks blocked a test-fixture "secret" in `outbound-sign.test.mjs` → `// gitleaks:allow`.

**Carried forward (owed):**
- `ads-diagnosis` has no baked quality score: quality-gate unbaked ratchet raised 6→7 with the
  reason recorded; bake on the next `npm run llm:quality` run and lower it back.
- D's non-blocking seams: `useDiagnosisPersistence` should export a `DiagnosisResult` union
  (delete the typed bridge in `AdsDiagnosisPanel.tsx`); `src/lib/ai/tools/index.ts` barrel
  export for `ads-diagnosis`. `GoalPacing`'s `statRequiredTitle` hover still says "at current
  ROAS", contradicting the curve footnote when basis="curve" (one-key fix).
- W2-E can plug curves into `simulateBudgetShift` via `reallocateBudget(rows, {curves})` /
  `marginalPoas`/`revenueAt` — `simulate.ts` untouched as planned.
- The ads diagnosis reads change diffs / PNO goal from the PRIMARY tenant while rows are the
  union — a union-aware change read is the follow-up if Sklik campaigns need per-row deltas.
- Sklik pack/ladder data is import-only (CSV `engine` column); live Seznam rank fetching is out
  of scope until a data source exists. W2-C overlays `local-signals/resolve.ts` next.
- i18n:audit leftover 41 > baseline 40 (pre-existing, reporting rung — fix + lower together).

## 3d. Wave 2 outcome (2026-08-29) — DONE

Five parallel Opus builders in the MAIN checkout, specs `c07fd3be`, landed in review order:
E `4e9c59f7` · A `675034a7` · C `3859c7c3` · B `4522a2d1` · D `350b640b` · seams `cea42d01`.
`tsc` clean, `test:unit` 3102/3104 (2 skipped), adr/seed/llm-gate/llm-quality/agents-surface
green; `sast` red on the SAME 3 pre-wave findings (architect backlog), raw-engine 15/15.
Migrations landed v27 (`go_links`/`go_clicks`) + v28 (`scan_claims`) + v29 (`feed_tokens`);
schema is 42 tables. 22 registered LLM tools (`local-page` golden `6f56f58e889151df`).

**What changed against the plan:**
- Shared-file protocol evolved: db.ts carried all three migrations and landed whole with
  W2-A (first lander), noted in the message — no curated index blobs needed this wave.
  `ai-types.ts`/`validation.ts` (co-owned A+C, marked hunks) landed the same way.
- W2-B and W2-C were ordered NOT to touch modes.ts even locally (shared checkout) — their
  entries landed as Director-applied seam requests; they tested their pieces as functions.
- W2-B found a real latent bug: `resolvePrepared` called guards synchronously, so an async
  guard's Promise would have been returned as a Response. Guards are now awaitable.
- W2-D dropped the plan's "inventory-plan effects" seam (it does not exist — zero `effect`
  hits in src/lib/inventory/); labels derive from `stockRows`/`marginOf` directly. It also
  found+fixed a missing-await bug in its own revoke path, and un-gamed a sast false pass
  (a doc comment mentioning a guard name satisfied GUARD_RE — reworded so the finding
  fires honestly and the waiver is in the allowlist where it belongs).
- W2-A routed measured grounding through `resolved.outcomes` rather than
  `buildKanalyGrounding` (precedence arbiter, no precedence question here); channel-research
  fingerprint unmoved (prompt block is conditional, byte-identity pinned).
- `/go/{id}` lives OUTSIDE src/app/api on purpose (public address like /m/{slug}) — no
  route-auth waiver needed; the open-redirect posture (owner-minted http(s) URLs only,
  `safeChannelUrl` floor, noindex) is a conscious accept.

**Carried forward (owed):**
- `local-page` has no baked quality score (unbaked ratchet 7→8, reason recorded) — bake on
  the next `npm run llm:quality` run and lower it back (together with ads-diagnosis' 6→7).
- Firestore twins of the new stores (outcomes, claims, feed-tokens, microsite listByTenant,
  calibration docs) are tsc-checked + shape-mirrored but unexercised (standing gap).
- W2-E's realization window: the campaign-series doc holds only the active period, so a
  set realized >23d after apply degrades to `insufficient` — capture-at-apply is the
  upgrade if that bites (W3-A's call).
- W3-A substrate notes are in W2-E's builder report: `ControlPlane.tsx` was reshaped
  (ledger row extracted to `ChangeSetLedgerRow.tsx`, one hoisted clock — reuse it),
  `readCalibration` in control-plane.ts is the function to generalise.
- i18n:audit leftover 41 > baseline 40 (pre-existing, reporting rung — fix + lower together).

## 4. What the Director does first (next session)

1. ~~ADR-0010~~ ~~foundation specs~~ ~~F1–F4~~ — done (§3b).
2. ~~Write the six Wave-1 specs~~ — done (§3c). ~~Write the five Wave-2 specs~~ — done (§3d).
3. ~~Dispatch Wave 1~~ — done (§3c). ~~Dispatch Wave 2~~ — done (§3d). Next: write the four
   Wave-3 specs (W3-A..D from §1; modes.ts → W3-B, insights producer → W3-A); read W2-E's
   substrate notes in §3d before speccing W3-A. Then Wave 4 (S1 needs live Sklik creds).

## 5. Risks the plan accepts

- The vibeman agent keeps committing to `master`: every rebase is a possible conflict; the hotspot rule covers ours, not theirs — rebase often, keep WPs small.
- LLM-gate commits (W1-D, W2-A, W2-C, W3-B, S1b) block the Director for the gate's duration: one per wave, always `run_in_background`.
- Foundations are the critical path: F1 alone changes the tenant-suffix rule that `sklik-per-user-citizen` had to drift-proof once — it gets fixture pins for every existing single-source tenant before anything unions.
