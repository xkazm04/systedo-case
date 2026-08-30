# WP S1b — Query-level negatives inside the governed envelope
card #8 (merged into #1) · XL (narrowed to L: Google search terms; no LLM lemma tool; no Sklik query API) · gate: contract (new campaign_docs doc kind; new move kinds) · wave 4 · AFTER S1 lands (extends `AdsMutator`)

## Goal
Every sync stores the account's top search terms per period; a pure recommender turns
them into `negative` moves (wasted spend, ZERO conversions) and `promote` moves
(converting non-exact queries → exact keywords); both ride the existing change-set
envelope with criterion-level snapshots and revert; a Search-terms panel in the console
proposes them. Invariant, test-pinned: **a term with ≥1 conversion is never eligible as a
negative.** Acceptance: GAQL + mapper pinned, recommender invariants pinned, apply+revert
through the mutator mock pinned (create → resource name → remove), `hasRestoreSnapshots`
sees criterion-only sets, the console row renders every move kind honestly — ≥28
assertions.

## Non-goals
- No Sklik query stats (no documented method offline — do NOT add an unverifiable read;
  a Sklik tenant's change-set with criterion moves fails honestly at the mutator with
  "not supported for Sklik"). No Czech lemma-grouping LLM tool (deferred; modes.ts,
  registry, goldens untouched).
- No ad-group-level negatives (campaign-level PHRASE negatives only); promotes go to the
  term's own ad group (`search_term_view` carries `ad_group.id`).
- No term-level alert (`AlertItem.kind:"term"` exists as an extension point — note it,
  don't use it). No change to `recommendBudgetMoves`.
- Do not touch S2/S3 files (twin/**, leads/**, conversions/**). `src/lib/google/ads.ts`
  is CO-OWNED with S3 this wave: append your functions in a `// ── S1b ──` region, never
  reformat, list every hunk.

## Seams
- **Read (Google):** `src/lib/google/ads.ts` — `searchStream` is private (:141-155):
  export it (byte-identical) and add `fetchSearchTerms(token, customerId, days,
  timeZone)`: GAQL `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
  search_term_view.search_term, segments.keyword.info.match_type, metrics.cost_micros,
  metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value
  FROM search_term_view WHERE segments.date BETWEEN … AND campaign.status != 'REMOVED'
  ORDER BY metrics.cost_micros DESC LIMIT 500` (date range via `dateRange` :560-563; the
  id-quoting and `AdsApiError` invariant :30-34 apply). Pure `mapSearchTermRows(rows,
  currencyScale)` beside the other mappers (:360-…), micros→CZK like `fetchCampaigns`
  (:598-615). `SearchRow` (:118-138) gains the optional `searchTermView`/`adGroup`/
  `segments.keyword` fields (additive).
- **Connector capability:** `AdsConnector` (`connector.ts:64-89`) gains OPTIONAL
  `fetchSearchTerms?(period)` (the `diagnoseMoneyUnit` optional precedent :349-350);
  `googleAdsProvider` (:256-314) implements it via `withLiveRetry`; sample connector
  returns `[]` with the sample flag; Sklik provider leaves it undefined.
- **Store:** NEW `src/lib/campaigns/store/search-terms.ts` on `tenantStore()`
  (`campaign_docs`, the series precedent `store/series.ts:11-57`): doc id
  `searchTermsDocId(period)` (`store-keys.ts` beside :128-130), payload
  `{ period, syncedAt, rows: SearchTermRow[] }`, capped `SEARCH_TERMS_CAP = 500` by cost,
  whole-doc overwrite only on success; `getSearchTerms(tenant, period?, root?)`. Barrel
  `campaigns/store.ts:26-29`.
- **Sync:** `sync.ts` — after `saveCampaignSeries` (:131): third best-effort fetch with
  the :77-89 try/catch contract, gated `!degradation.campaigns` (:100-104 argument: no
  negatives mined from sample terms); `TenantSyncResult` gains `searchTermsOk`.
- **Recommender (NEW `src/lib/campaigns/term-moves.ts`, pure):**
  `recommendTermMoves(terms, opts)` → `BudgetMove[]` with `kind:"negative"` (cost ≥
  `minSpend` 500 CZK, `conversions === 0`, clicks ≥ 10) and `kind:"promote"`
  (`conversions ≥ 2`, `matchType !== "EXACT"`), ≤ `maxMoves`, dedupe by term+campaign,
  never both kinds for one term. `amount` = the term's period cost; `estValueGain` = 0
  for negatives (saved cost is not value — state it), `conversionValue` for promotes
  (already realized — the projection is "keep it", state it). Invariant pinned with a
  property-style loop over a 200-term random fixture: no negative has conversions > 0.
- **Move kinds:** `BudgetMove` (`simulate.ts:6-34`) `kind?: "shift"|"pause"|"negative"|"promote"`
  + optional `criterion?: { term, campaignId, adGroupId?, matchType }`;
  `moveDonorShare` (:62-66) → 0 for the new kinds; `simulateBudgetShift` loop (:114)
  `continue`s on criterion kinds (they move no budget). `checkPolicy`
  (`control-plane-types.ts:193-208`) message arm per kind.
- **Mutator extension (S1's `AdsMutator`, `src/lib/campaigns/mutator.ts`):**
  `addNegativeKeyword?(campaignId, term): Promise<CriterionSnapshot>` (Google:
  `customers/{cid}/campaignCriteria:mutate` create `{campaign, negative:true,
  keyword:{text, matchType:"PHRASE"}}`, returns the created resource name),
  `addExactKeyword?(adGroupId, term): Promise<CriterionSnapshot>` (`adGroupCriteria:mutate`
  create `{adGroup, status:"ENABLED", keyword:{text, matchType:"EXACT"}}`),
  `removeCriterion?(resourceName)` (`remove` operation on the right mutate endpoint —
  derive from the resource name). Google impl in `ads.ts` (S1b region, `AdsApiError`
  invariant); the Sklik mutator leaves them undefined → `mutations.ts` returns
  `{ok:false, error:"Klíčová slova ve Skliku zatím neupravujeme."}`.
- **Apply/revert:** `control-plane.ts:276-299` gains the two arms (results +
  `criterionSnapshots` accumulator, `persistEvidence` :263-275 payload + settle :305-315
  key); revert :387-408 gains the criterion loop (`removeCriterion` per snapshot) and
  `settledRevertStatus` (`control-plane-types.ts:272-274`) a third flag;
  `hasRestoreSnapshots` (:279-281) + `planApproveClaim`'s recovery read (:313-315) see
  `criterionSnapshots`; `inverseMoves` (:211-225) drops kinds — fix it to carry `kind`
  (it's exported; pin). Audit action names: `criterion_add`, `criterion_remove`.
- **Creation:** `createChangeSet` (`control-plane.ts:86-145`) gains
  `opts.moveSource?: "budget" | "terms"`; `"terms"` reads `getSearchTerms(tenant)` and
  runs `recommendTermMoves` instead of the budget recommender (simulation = identity
  before/after — `simulateBudgetShift` skips the kinds). Route `create` action accepts
  `moveSource`.
- **Console:** NEW `src/components/campaigns/SearchTermsPanel.tsx` (client, ≤200 LOC,
  `T`) mounted between `BudgetMoves` and `ControlPlane` in the governance section
  (`CampaignsClient.tsx:548-562`, the `onProposed` refresh handshake; `dynamic()`
  import per :4/:43-45): top wasted terms (cost, clicks, 0 conv) + top converters, one
  "Navrhnout negativa" button (POST create `moveSource:"terms"`). `ControlPlane.tsx`
  move rows (:220-233) branch on `m.kind`: shift `A → B`, pause `⏸ A`, negative
  `− "term" (kampaň)`, promote `+ "term" [exact] (sestava)` — this also fixes the
  existing dishonest pause row (empty `toName`). `ChangeSetLedgerRow.tsx` unchanged
  unless a kind pill is one line.
- Tests to copy: `campaigns-control-plane-local-store.test.mjs` (extend the mutator
  mock with the three criterion methods; sequence pin), `ads-account-daily.test.mjs`
  (pure mapper over fixture rows), `campaigns-control-plane-pauses.test.mjs` (pure
  recommend + policy), `campaigns-changeset-transitions` (settle flags).

## Data contract
```ts
// store/search-terms.ts
export interface SearchTermRow { term: string; campaignId: string; campaignName: string;
  adGroupId: string; adGroupName: string; matchType: "EXACT" | "PHRASE" | "BROAD" | "OTHER";
  cost: number; clicks: number; impressions: number; conversions: number; conversionValue: number }
export interface SearchTermsDoc { period: CampaignPeriod; syncedAt: string; rows: SearchTermRow[] }
export const SEARCH_TERMS_CAP = 500;
// simulate.ts (additive)
BudgetMove.kind?: "shift" | "pause" | "negative" | "promote";
BudgetMove.criterion?: { term: string; campaignId: string; adGroupId?: string; matchType: SearchTermRow["matchType"] };
// control-plane-types.ts (additive)
export interface CriterionSnapshot { platform: "google-ads"; resourceName: string; campaignId: string;
  adGroupId?: string; term: string; action: "negative" | "promote" }
ChangeSet.criterionSnapshots?: CriterionSnapshot[];
// term-moves.ts
export const TERM_MIN_SPEND_CZK = 500; export const TERM_MIN_CLICKS = 10; export const PROMOTE_MIN_CONVERSIONS = 2;
```
No migration (`campaign_docs` is schemaless; change-set fields additive).

## Invariants
- Negatives never for converting terms (pinned twice: unit + property loop).
- Sample terms never persisted (degradation gate) and never recommended.
- Revert restores exactly: every created criterion has a snapshot BEFORE the next move
  starts (`persistEvidence` after each), and a partial apply is revertable.
- Existing suites unmodified-green: shift/pause behaviour byte-identical; `simulate`
  no-opts pin (W2-E) still holds; `inverseMoves` now carries `kind` (its own pin).
- ADR-0002/0010 as S1; no `export const dynamic`.

## Build steps
1. `ads.ts` fetch + mapper + `SearchRow` fields + GAQL string pin + mapper pin (≥6).
2. Store + `store-keys` id + sync join + `searchTermsOk` + local-store test (≥4).
3. `term-moves.ts` + invariant pins (unit + property; ≥8).
4. Move kinds + simulate skip + `checkPolicy` arms + `inverseMoves` kind fix + pins.
5. Mutator methods (Google impl + Sklik undefined) + apply/revert arms + snapshots +
   `hasRestoreSnapshots`/`settledRevertStatus` + local-store sequence pin (create →
   resource name recorded → revert removes; ≥8).
6. `createChangeSet` moveSource + route + `SearchTermsPanel` + move-row kinds;
   LF-normalize; gates; report (list every `ads.ts` hunk for S3's benefit).

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/campaigns src/lib/google/ads.ts
src/app/api/campaigns/control-plane src/components/campaigns` · `npm run test:unit`
(all `campaigns-*`, `ads-*`, `budget-math`, `campaigns-changeset-transitions` green).

## Acceptance
- Fixture terms: `{term:"levné boty", cost 900, clicks 40, conv 0}` → negative;
  `{cost 3000, conv 3, PHRASE}` → promote; `{cost 900, conv 1}` → neither (pinned).
- Apply fixture: 1 negative + 1 promote → mutator saw `addNegativeKeyword(campaignId,
  term)` then `addExactKeyword(adGroupId, term)`; `criterionSnapshots.length === 2`;
  revert → `removeCriterion` ×2 in reverse order; status `reverted` (pinned).
- Console: a pending set with one move of each kind renders four distinct row shapes
  (snapshot-free assertion on the rendered strings via the pure row-label helper —
  put `moveRowLabel(m, t)` in a lib so it is testable).
- ≥28 new assertions.

## Hotspot requests
- None mechanical. `context-map.json` (Director). `ads.ts` hunks listed (co-owned with S3).

## Rollback
Revert; `searchTerms_*` docs inert; change-sets with criterion moves become un-revertable
under old code (`hasRestoreSnapshots` ignores the key) — revert them BEFORE rolling back.
