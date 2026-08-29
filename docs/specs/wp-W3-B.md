# WP W3-B — Hosted LP experiments: /m pages split traffic and count arms
card #12 · XL (narrowed to L: no stickiness cookie, no new URL namespace) · gate: contract (new table; new llm-tool + golden) · wave 3 · **modes.ts owner**

## Goal
An LP experiment can be PUBLISHED as a hosted microsite (`kind: "lp"` — the type has
declared it since F3, `microsite/types.ts:11`; the renderer finally exists): `/m/{slug}`
serves one arm per request (stateless equal split), counts a view per served arm and a
conversion when the visitor acts, a `lp-sync` ledgers-cron step folds the counters back
into the experiment's `visitors`/`signups` — so `evaluate()` (`lp-exp/compute.ts:113-188`),
the module's verdicts and the patterns miner run on REAL traffic instead of hand-typed
numbers. A new `lp-variant-draft` tool writes the arm page copy. Acceptance: assignment is
uniform and bot-skipped (pinned), the convert beacon attributes to the SERVED arm
(pinned), the sync step is recompute-not-accumulate idempotent (pinned), the tool passes
the static gate with a golden — ≥26 assertions.

## Non-goals
- **No sticky assignment, no cookie**: nothing in the repo sets a measurement cookie and
  the analytics/go headers disclaim them by design (`analytics/track.ts:6-9`,
  `go/[id]/route.ts:19-20`). Assignment is per-request; attribution is correct anyway
  because the served arm's id rides the page into the beacon. State this trade-off in the
  renderer header (a returning visitor may see a different arm; CVR math is unaffected
  because each VIEW is its own trial).
- **No new URL namespace**: the plan's `src/app/m/[slug]/lp/**` and `src/app/api/m/**`
  are OVERRIDDEN by the W2-C precedent — kind lives on the config, the branch lives in
  `src/app/m/[slug]/page.tsx` (:76-88), and the convert endpoint goes at
  `src/app/m/[slug]/convert/route.ts` — OUTSIDE `src/app/api/`, the `/go/[id]/route.ts:4-10`
  reasoning verbatim, so `route-auth` never fires and no waiver exists to write.
- No edits to `src/lib/insights/aggregate.ts` (W3-A owns producers — the sample-only
  experiments rec at :203-211 stays; note it in your report for W3-A).
- No paid-media integration, no client portal. `lp-variant-ideas` (the ideas tool) is
  untouched — draft is a NEW tool, not a rewrite.
- `src/lib/ai-types.ts` + `src/lib/ai/validation.ts` are CO-OWNED with W3-C/W3-D:
  marked additive hunks (`// ── W3-B ──`), never reformat, list every hunk.

## Seams
- **Model:** `src/lib/lp-exp/sample.ts:7-13` `Variant` gains `armId?: string` (additive;
  minted at publish, absent for hand-typed arms — positional identity noted at
  `compute.ts:132` stays for legacy). `sample.ts:15-22` `LpExperiment` gains
  `hosted?: { slug: string; publishedAt: string }`. Sanitizers
  (`lp-exp/types.ts:54-96`) pass both through with bounds (armId ≤ 40 chars,
  slug via `MICROSITE_SLUG_RE`); the `signups ≤ visitors` clamp (:59) is the integrity
  boundary the counters must satisfy too (`types.ts:9-12` — auto-populated numbers enter
  live tenants' AI prompts via `patterns/extract.ts:329-334`).
- **Payload:** `src/lib/microsite/types.ts` gains `LpPagePayload` (contract below) and
  `MicrositeConfig.lp?: LpPagePayload` (additive-optional, the `local?` rule :76).
  `src/lib/microsite.ts:49` `PUBLISHABLE_KINDS` gains `"lp"`; the payload-required gate
  copies :139-141 (`kind === "lp" && !input.lp` → `invalid-kind`).
- **Publish route:** `src/app/api/microsite/route.ts` — the kind narrowing at :98 is a
  literal comparison; add the `"lp"` branch: body carries `{ kind: "lp", lp: { experimentId,
  arms } }`; the route re-derives brand facts server-side, sanitizes arm copy through a
  NEW pure wire-door `src/lib/microsite/lp-page.ts` (`sanitizeLpArms`, `mintLpSlug` —
  copy `local-page.ts`'s shape), verifies the experiment exists and arms match its
  variant count via `listExperiments`, stamps `armId`s + `hosted` onto the experiment
  (`updateExperiment`), and publishes. Activity module label: third branch (`"experimenty-lp"`).
  DELETE `?slug=` already works per-slug (:191-207) — unpublishing clears `hosted` on the
  experiment (best-effort).
- **Renderer:** `src/app/m/[slug]/page.tsx` — `config.kind === "lp"` branch after the
  local-landing one (:81-84): `!config.lp → notFound()`; NEW
  `src/components/microsite/LpMicrosite.tsx` (server, ≤200 LOC): pick an arm
  (`pickArm(arms, Math.random)` — pure, injectable RNG from NEW
  `src/lib/lp-exp/serve.ts`), render its copy, bump `view` best-effort
  (`void … catch(()=>{})`, bot-skipped via `isBotUserAgent` —
  `organic-channels/outcomes.ts`), CTA button carries the served `armId` to the beacon.
  Metadata: `robots: noindex` for lp kind (an experiment page must not build SEO
  identity that dies with the test — opposite of local-landing, say why in code).
  Page stays dynamic the same way it already is (:1-4) — no `export const dynamic`.
- **Convert beacon:** NEW `src/app/m/[slug]/convert/route.ts` — POST
  `{ arm: string }` (≤ 64 bytes read guard); loads config by slug, arm must exist in
  `config.lp.arms` (unknown → 204 silently — a probe learns nothing), bot-skip,
  fire-and-forget `bumpLpCount(expId, armId, day, "conversions")`, always 204
  `no-store`. Client side: a tiny `"use client"` CTA child inside LpMicrosite that
  `navigator.sendBeacon`s (fallback fetch keepalive) then follows the operator's target
  (tel:/mailto:/URL from the payload — operator-typed, `isOperatorContact` precedent).
- **Counters trio (NEW `src/lib/lp-exp/counts-store.ts` + `.local` + `.firestore`):**
  the `go_clicks` shape (`db.ts:604-609`, upsert-increment, never RMW —
  `outcomes-store.ts:19-22`): `bumpLpCount(experimentId, armId, day, kind)`,
  `listLpCountDays(experimentId, sinceDay)`, `pruneLpCounts(beforeDay)`,
  `clearLpCounts(projectId)` — rows carry `project_id` for the cascade.
- **Sync step (NEW `src/lib/lp-exp/sync-step.ts`):** `LP_SYNC_STEP_ID = "lp-sync"`,
  shape from `rollup-step.ts:39-47`; run = per project with hosted experiments:
  recompute each hosted arm's `visitors`/`signups` as the TOTALS from the counter table
  (overwrite, never add — idempotent by construction, the `rollup-step.ts:12-17`
  rationale), save via the store's CAS-ish update, prune counters past 180d LAST;
  counts `{projects, experiments, views, conversions, pruned, failed}`. Register: append
  to `LEDGER_STEPS` (`src/lib/cron/ledgers.ts:88` — the line is yours).
- **Tool (NEW `src/lib/ai/tools/lp-variant-draft.ts`):** drafts the full page copy for
  ALL arms of one experiment in one call — request = experiment cluster/topic, per-arm
  `{ armId, label, hypothesis?, headline? }` seeds (from `lp-variant-ideas` output or
  hand-typed), brand grounding (`deriveBrandContext` via an injected resolver — the
  `resolveLocalPage` pattern, `modes.ts:299-309`); result = per-arm
  `{ armId, headline, intro, bullets[3-5], cta }`; anti-fabrication (no invented
  numbers/claims), armIds coerced to the request set. Full ceremony: `llm:new`, registry
  entry (system+schema verbatim), golden + CHANGELOG (`llm:eval:update --reason`), BYOM
  row (`keys/types.ts:211`), barrel export, quality-matrix one-liner + unbaked ratchet
  +1 with reason (`scripts/quality-gate.mjs` — the W2-C shape).
- **modes.ts + dispatch.ts (you are the OWNER):** mode `"lp-variant-draft"` with an
  injected `resolveLpDraft` (project-owned experiment check + brand facts; lives in
  `src/lib/lp-exp/draft-grounding.ts`, injected not imported — the
  `ai-mode-table` import-graph rule, `modes.ts:299-303`); deps + dispatch wiring direct.
  Mode-id union additions in `ai-types.ts` (your hunk).
- **Manager UI:** `LpExperimentsManager.tsx` (411 LOC, may NOT grow) — extract the new
  publish flow to NEW `src/components/app/modules/lp/HostedLpPanel.tsx` (client,
  ≤200 LOC): pick experiment → draft arms (`useAiTool("lp-variant-draft")`) → preview →
  publish → hosted badge + `/m/{slug}` link + per-arm live counts (from the module's
  server-side data). `LpExperimentsModule.tsx` mounts it and passes hosted state; its
  footer "Seam: reálné rozdělení návštěvnosti" hint (:35) finally comes TRUE — update
  the copy.
- Tests to copy: `test-unit/organic-go-routes.test.mjs` (public route + counter),
  `cron-ledgers` step shape, `microsite-local-page` (payload/JSON-LD pin shape),
  `lp-exp` existing suites (extend, don't break — `evaluate` fixtures must stay green).

## Data contract
```ts
// src/lib/microsite/types.ts (additive)
export interface LpArmCopy { armId: string; label: string; headline: string;
  intro: string; bullets: string[]; cta: string }
export interface LpPagePayload {
  experimentId: string; projectId: string;
  arms: LpArmCopy[];                       // 2..VARIANT_MAX, armIds unique
  target?: string;                         // operator-typed CTA target (tel:/mailto:/https:)
  generatedAt: string;
}
// src/lib/ai-types.ts (additive, marked)
export interface LpVariantDraftRequest { cluster: string; brand: string;
  brandContext?: string;
  arms: Array<{ armId: string; label: string; hypothesis?: string; headline?: string }>;
  refine?: string; sample?: boolean }
export interface LpVariantDraftResult { arms: LpArmCopy[] }   // coerced to request armIds
```
Sqlite (seam request, migration **v30** — first of wave 3; append after `db.ts:1151`;
DDL also into SCHEMA; LATEST = highest present when you finish):
```sql
CREATE TABLE IF NOT EXISTS lp_arm_counts (
  experiment_id TEXT NOT NULL, arm_id TEXT NOT NULL, day TEXT NOT NULL,
  project_id TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0, conversions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (experiment_id, arm_id, day)
);
CREATE INDEX IF NOT EXISTS idx_lp_arm_counts_project ON lp_arm_counts (project_id);
```
Firestore: `lpArmCounts/{experimentId}/days/{armId_day}` with `FieldValue.increment`.
`LP_COUNT_RETENTION_DAYS = 180`.

## Invariants
- ADR-0001 trio; ADR-0002: publish keys off the authed microsite route; the public
  page/beacon read only by slug and write only counters — no tenant from the wire.
- ADR-0003: the only provider call is `generateStructured` in `lp-variant-draft.ts`.
- Honesty: counters OVERWRITE hosted arms' numbers (recompute); hand-typed experiments
  are untouched by the sync step; the sanitizer clamp holds after sync (pin it);
  a hosted experiment whose page is unpublished stops accumulating but keeps its counts.
- Privacy: view/conversion counters only — no IP/UA/cookie stored (analytics posture).
- Cache Components: no `export const dynamic` anywhere.

## Build steps
1. Model + payload + `serve.ts` (`pickArm` uniform pin over 10k injectable-RNG draws ±2%)
   + `lp-page.ts` wire-door + tests (≥6).
2. Counters trio + test (increment both kinds, day rows, prune, project clear; ≥6).
3. Renderer branch + convert route + tests (arm served ∈ payload, view bumped, bot not,
   unknown arm 204-silent, beacon attributes to served arm; ≥6).
4. Publish/unpublish route branch + experiment stamp + tests.
5. Sync step + `LEDGER_STEPS` + idempotence pin (run twice → identical blob) + clamp pin.
6. Tool + ceremony (`llm:gate:check` green, 23 tools) + modes/dispatch wiring +
   `ai-mode-table` extension; HostedLpPanel + module wiring; LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/lp-exp src/lib/microsite* "src/app/m/[slug]"
src/app/api/microsite src/components/microsite src/components/app/modules/lp
src/components/app/modules/LpExperimentsModule.tsx src/lib/ai/tools src/app/api/ai
src/lib/cron/ledgers.ts test-llm/registry.mjs` · `npm run test:unit` ·
`npm run llm:gate:check` · `npm run test:llm:coverage`. NOT `npm run test:llm` (Director).

## Acceptance
- `llm:gate:check` exit 0 with 23 tools; CHANGELOG `lp-variant-draft | — | <hash>`.
- Assignment uniformity + attribution + sync idempotence + clamp pinned as above.
- A published fixture experiment round-trips: publish → 3 views + 1 conversion on arm B
  → sync → `evaluate()` sees visitors/signups moved on arm B only (pinned).
- ≥26 new assertions.

## Hotspot requests (seam requests — verbatim inserts + anchors)
- `db.ts` v30 + SCHEMA DDL (+ LATEST; W3-C=v31, W3-D=v32/33 append in parallel — never
  renumber theirs); table-count comments — Director settles at seams.
- `delete-cascade.ts` `{ name: "lp-arm-counts", delete: (p) => clearLpCounts(p) }` +
  import + cascade-suite seed/present fixture (the wave-2 lesson).
- `duplicate-cascade.ts` exclusion bullet (accumulated operating data).
- `context-map.json` (Director). ai-types/validation hunks listed for the Director.

## Rollback
Revert; `lp_arm_counts` inert; published lp configs 404 via the kind policy (old
`PUBLISHABLE_KINDS` refuses, `normalizeConfig` leaves stored kinds); golden+CHANGELOG
revert with the registry entry.
