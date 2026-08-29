# WP W1-G — Campaigns console union read (Google + Sklik in one table)
carried from wave 0 (ADR-0010) · M · gate: contract (response shape additive; copy changes) · wave 1

## Goal
`GET /api/campaigns?projectId=` returns the UNION of the project's per-account tenants (Google first,
Sklik second — `resolveProjectTenants`), every row tagged with `source`, the console table shows a
platform badge + filter and stays single-tenant for WRITES (change-sets, alerts, analyze stay on
`resolveTenant` — "a union read must not be mistaken for a union write", ADR-0010:89-90), and the
`kampane` copy stops saying "Google Ads" where both networks may be present. Acceptance:
`campaigns-state-shape.test.mjs` passes UNMODIFIED for a single-source project (byte-identical response),
and a two-tenant fixture yields one response with rows from both, `sources` metadata, and no cross-currency
sums (all pinned).

## Non-goals
- No mutation on Sklik rows (`mutations.ts:66-78` refuses; the UI must not offer it). No change-set changes.
- No edit to `control-plane*.ts`, `mutations.ts`, `alerts.ts`, `budget-moves.ts`, `simulate.ts`, `src/lib/i18n/messages.ts`,
  the public `src/app/kampane/page.tsx` (bonus page stays Google-only by design), `AdsAccountPicker.tsx`,
  `SklikConnectCard.tsx`, `BudgetMoves.tsx` copy (`:36,:77` are correct — moves are Google-only).
- No report-metrics changes (F1 already blends); no `db.ts`.

## Seams
- Route `src/app/api/campaigns/route.ts:40-81` (`loadState(tenant, period)`: ONE `readTenantRoot` per tenant
  `:48`, `listCampaigns(tenant, period, root)` `:54`, series `:60-61`, snapshots `:64`), GET `:83-103` (`resolveTenant`
  `:97`), POST `:197` (sync tenant — keep single: POST returns the union state too, after syncing its one tenant).
- `src/app/api/campaigns/state.ts:11-34` (`CampaignsStateInputs`, `CampaignsState` — `meta: SyncMeta | null`
  single), `assembleCampaignsState` `:36` (stale-by-hash `:56-67`, non-active-period rewrite `:71-74`).
- Union primitives: `src/lib/campaigns/store.ts:37-70` (`listCampaignsForProject` — no root threading; add an
  overload/variant `listCampaignsForTenants(tenants, period, roots)` that the route uses so the per-tenant root
  optimisation survives), `connector.ts:469-492` (`resolveProjectTenants`), `provider-precedence.ts:65-75`.
- Client: `src/components/campaigns/useCampaigns.ts:38-77` (`CampaignsMeta`, private `State`, `load()` `:115-135`),
  `CampaignsClient.tsx:66-155` (`T` incl. `sourceSample/Live/Sklik`, `SOURCE_KEY` `:151-155` → `:479`, degraded banner
  `:536-538`, money formatters `:255-266` keyed on `meta?.currency`), `SyncProvenance.tsx` (`:29-38,:56-65`),
  `table/derive.ts:65-115` (`deriveCampaignRows`, `RowFilter` — no source filter), `CampaignTable.tsx:47,410-430`
  (zero `source` references today). Badge precedent: `src/components/ai/KeywordResearch.tsx:605-635`.
- Copy: `src/app/app/[projectId]/kampane/page.tsx:19,:22` (`desc`), `:52` (`resolveTenant` for `getClientProfile` —
  leave), `src/lib/projects/modules.ts:129-130` (`blurb`/`blurbEn`), `CampaignsClient.tsx:68-75,:106,:109-116,:147`.
- Pins: `test-unit/campaigns-state-shape.test.mjs:30` (exact key set — keep by adding NO key when single-source),
  `campaigns-source-union.test.mjs`, `campaigns-table-derive.test.mjs` (triage call count), `report-metrics-blend`.
  Harness: `test-unit/firestore-fake.mjs` + `firestore-fake-hook.mjs`; LOCAL_DB temp-db pattern
  (`campaigns-local-store.test.mjs:1-30`).

## Data contract
```ts
// state.ts (additive)
export interface CampaignsSourceMeta { source: AdsSource; meta: SyncMeta | null; campaigns: number; currency?: string }
export interface CampaignsState { …existing…; sources?: CampaignsSourceMeta[]; mixedCurrency?: boolean }
//  `sources` and `mixedCurrency` are PRESENT ONLY when the project resolved to >1 tenant. Single tenant ⇒
//  assembleCampaignsState output byte-identical (the shape test pins the key set).
export function assembleProjectCampaignsState(parts: Array<{ source: AdsSource; inputs: CampaignsStateInputs }>): CampaignsState;
```
Union rules (pure, in `state.ts`, tested):
- `campaigns`: concat in tenant precedence order; each row gets `source` from its tenant meta when absent
  (`listCampaignsForProject` rule). `meta`: the PRIMARY tenant's (first in order) — unchanged semantics.
- `campaignSeries`, `reports`, `histories`, `inputHashes`: merged by campaign id; on an id COLLISION across
  tenants the primary wins and the collision is counted in `sources[i].collisions` (report it; do not rename ids —
  change-sets reference them).
- `series` (portfolio daily): summed per day ONLY when every tenant's `meta.currency` is equal (or absent);
  otherwise the primary's alone and `mixedCurrency: true` (mirrors `report-metrics/blend.ts`).
- `changes`, `snapshotSummaries`: primary tenant only (they feed mutation surfaces).
- `staleKeys`: union.
Client: `CampaignsMeta` gains `sources?`, `mixedCurrency?`; `RowFilter` gains `sourceFilter: "all" | AdsSource`;
derive is unchanged in call count (filter after derive, as `filterCampaignRows` does today).

## Invariants
- ADR-0010 union read; writes single-tenant: the row action menu / budget-move seeds pass only
  `source !== "sklik"` rows to `recommendBudgetMoves` and the analyze route (client-side filter; the server
  already refuses). Sklik rows show a "jen ke čtení" hint in the actions cell.
- ADR-0002: every tenant comes from `resolveProjectTenants(userId, projectId)` (session user id).
- No cross-currency sums anywhere (totals strip when `mixedCurrency`: show per-source totals instead).
- Cache Components: route handlers only; no page changes beyond copy.

## UI
- `CampaignTable.tsx`: `source` badge column (Google / Sklik, `KeywordResearch.tsx:631` classes → semantic tokens)
  rendered only when `meta.sources` present; a `Segmented`-style source filter in the toolbar (reuse
  `src/components/dashboard/vykon/Segmented.tsx`); ≤200 LOC → extract `table/SourceBadge.tsx` + `SourceFilter.tsx`.
- `SyncProvenance.tsx`: when `sources` present, one line per source ("Google Ads · živá data · 12 kampaní ·
  synced …", "Sklik · …") + the mixed-currency note. Single source: unchanged output (pin by snapshot string).
- `CampaignsClient.tsx`: totals per source when `mixedCurrency`; empty state + sync button copy become
  network-neutral ("Zatím žádná data z reklamních účtů" / "Připojte Google Ads nebo Sklik…"); degraded banner
  names the degraded source.
- Copy: `kampane/page.tsx` `desc` → "Kampaně z Google Ads a Skliku, triáž, AI vyhodnocení a přesuny rozpočtu…";
  `modules.ts:129-130` likewise (cs+en).

## Build steps
1. `state.ts` union assembler + `test-unit/campaigns-state-union.test.mjs` (≥14: single-tenant byte-identity via
   `deepStrictEqual(assembleProjectCampaignsState([one]), assembleCampaignsState(one.inputs))`; two-tenant merge; id
   collision primary-wins + count; same-currency series sum; mixed currency no-sum; staleKeys union).
2. `store.ts` `listCampaignsForTenants` (root-threaded) + route GET/POST wiring + `test-unit/campaigns-route-union.test.mjs`
   (LOCAL_DB temp db: seed two tenants via the tenant-docs adapter as `campaigns-local-store.test.mjs` does; call
   the exported `loadProjectState(userId, projectId, period)` helper — extract it from the route so it is testable).
3. Client state + derive filter + badge/filter components + provenance lines + copy; `campaigns-table-derive` green.
4. LF-normalize; gates; report.

## Gates
`npx tsc --noEmit` · `npx eslint src/app/api/campaigns/route.ts src/app/api/campaigns/state.ts src/lib/campaigns/store.ts src/components/campaigns "src/app/app/[projectId]/kampane" src/lib/projects/modules.ts` ·
`npm run test:unit` (`campaigns-*`, `report-metrics-*` green; `campaigns-state-shape.test.mjs` unmodified).

## Acceptance
- ≥22 new assertions; `campaigns-state-shape.test.mjs` diff = 0.
- `grep -c "Google Ads" src/components/campaigns/CampaignsClient.tsx` decreases (report before/after); the
  remaining occurrences are the source-label strings (`sourceSample`, `sourceLive`) and BudgetMoves.

## Hotspot requests
- `src/lib/projects/modules.ts:129-130` blurb (2 lines) — edit directly, it is copy only.
- `context-map.json` (Director). Doc-sync: `docs/adr/0010-…md` "Consequences" may gain one line "console reads the
  union since W1-G" — you may edit that ADR line only.

## Rollback
Revert; response shape returns to single-tenant; nothing persisted.
