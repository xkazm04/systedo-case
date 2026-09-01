# ADR-0010 — A project reads the union of its per-account tenants

## Status

Accepted (2026-08-29; extends ADR-0002, supersedes nothing)

## Context

ADR-0002 keys every account-scoped store under
`u_{userId}_proj_{projectId}_{account}` where `account` is the Google
`customerId` or the fixed `sklik` suffix (`SKLIK_TENANT_SUFFIX` in
`src/lib/campaigns/store-keys.ts`). That already gives a project one tenant
*per connected ad account*, and it was designed so a later Google connection
never orphans Sklik history.

What the read and sync paths did with that was narrower than the key allows.
`resolveCampaignContext` in `src/lib/campaigns/connector.ts` resolved **one**
provider per request, first-wins, and the Sklik resolver returned `null` the
moment a Google connection existed. `chooseAdsSource` in
`src/lib/campaigns/provider-precedence.ts` encoded the same either/or. The
report spine (`src/lib/report-metrics/types.ts`) typed its source as
`"google-ads"` only, and `buildLiveDataset` neutralised the channel mix to `[]`
because an account-level Google sync cannot substantiate one.

So "Sklik + Google in one console" was true of the key and false of every
surface: a tenant running both networks had to choose which one Adamant saw,
and the profit engine (`/zisk`) ran on zero channel rows for exactly the
paying tenants it was built for.

The obvious fix — a composite account suffix so one tenant holds both — is a
key-format change, which ADR-0002 correctly calls a data migration. It is also
unnecessary.

## Decision

**The key stays per-account. The project reads the union.**

1. **Sync fans out to every connected source.** A user with both a Google
   connection and a per-user Sklik connection syncs Google into
   `…_{customerId}` and Sklik into `…_sklik`, in the same run. The Sklik
   resolver no longer yields to Google. Single-source users are byte-identical
   to before — the union of one tenant is that tenant.
2. **Rows carry their source.** `Campaign.source` (additive, optional) is
   stamped from the connector at sync time; a row without it reads as its
   tenant's `SyncMeta.source`. A project-level read
   (`listCampaignsForProject`) unions the per-account tenants and returns
   tagged rows; per-tenant reads are unchanged.
3. **Report metrics hold one section per source.** `ReportMetrics` gains
   `sources` (additive), one `{meta, rows}` section per `MetricsSource`. The
   top-level `meta`/`rows` stay the legacy single-source shape so every
   existing reader keeps working; the resolver blends sections per day on
   read and derives a *real* platform channel mix (`channels` +
   `channelDaily` with one channel per platform) from them. Sections in
   different currencies are never blended: the resolver serves the primary
   section alone and says so.
4. **Sklik linkage to a project is explicit.** Google data reaches a project
   only through `project.adsCustomerId`; Sklik data reaches it only through
   `project.sklikLinked` (additive boolean). There is no fallback to "the
   user's only Sklik account", for the same data-isolation reason
   `src/lib/report-metrics/sync.ts` refuses to resolve an unlinked project to
   the active Google account.
5. **Reads never cross users.** Every tenant in a union is built by
   `buildTenantKey` from the session's user id. The union widens what one
   user's project reads across *their own* accounts; it does not touch the
   ownership invariant ADR-0002 establishes.

Rejected: a composite `_{customerId}_sklik` suffix (migration, and the exact
drift `sklik-per-user-citizen` had to repair once); a separate
`channel_ledger` table (the per-source sections already are the ledger at
platform granularity — campaign-type segmentation is a later rung on the
same shape).

## Consequences

- The campaigns console, `/zisk`, `/vykon` and the monthly report see both
  networks for a dual tenant without any store being re-keyed. Per-platform
  POAS becomes computable on live data because the platform *is* the channel.
- Two places must agree on "which tenants does this project read": the sync
  fan-out (`planSyncTargets` + the provider registry) and the union read. The
  pure spec in `src/lib/campaigns/provider-precedence.ts` is the single source
  of truth for both and is unit-tested; a change to one that is not mirrored
  in the other is the bug this ADR exists to prevent.
- `chooseAdsSource` changes meaning from "which one" to "which set"; its
  callers and tests change with it.
- Blending is a read-time derivation, so a section can be added or cleared
  without rewriting the other. The cost is that the blended totals are not
  stored anywhere — every consumer goes through the resolver, which is
  already the rule (`resolveReportDataset` is the only door).
- Mutations remain Google-only until the Sklik write path lands (deck card 1,
  special-care rung S1); a union read must not be mistaken for a union write.
- The campaigns console reads the union since W1-G: `GET/POST /api/campaigns`
  assembles one payload per project (`loadProjectState`), rows carry `source`,
  and `sources` + `mixedCurrency` are additive keys present ONLY above one
  tenant — a single-source response is byte-identical, and every write surface
  (change-sets, alerts, analyze, the sync itself) still resolves one tenant.

## Revisit when

- **The union read stops fitting a request.** Fanning out is linear in connected
  sources, and a project-level read does it per request. A tenant with enough
  accounts to push a console route past its perf budget is the case that would
  buy a stored projection instead — and it changes the "no re-keying" claim, which
  is this decision's whole argument.
- **A second currency stops being an edge case.** The resolver refuses to blend
  sections in different currencies and serves the primary. That is right while
  mixed currency is rare; a tenant whose accounts are genuinely split across two
  currencies is being served half their data, and the answer is a converted
  section rather than a suppressed one.
- **A union WRITE is proposed.** The record says a union read must not be mistaken
  for one. The day mutations fan out to more than one tenant, the per-account key
  is carrying a guarantee it was never asked to carry.
- **`Campaign.source` stops being optional.** It is additive today, which is what
  made this a non-migration. A required field means the rows have been rewritten,
  and the argument for keeping the key per-account should be re-made rather than
  inherited.
