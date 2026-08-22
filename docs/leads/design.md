# Lead management — the entity layer

Design record for `src/lib/leads/**` and `/api/projects/[id]/crm/**`.
Condensed from the R2 research pass (2026-08-22). **Data layer only** — the UI
module is a separate phase.

---

## 0. Why this exists

Adamant had **four disjoint lead surfaces and zero lead entity**. Nothing stored an
identified person with a name, an email, a stage history or a consent record:

| Surface | What it actually holds | Real or sample | Persisted |
|---|---|---|---|
| `lib/lead-quality` | aggregate counts per **source** | real when imported, else sample | yes (`lead_imports` blob) |
| `lib/speed-lead` | 4 hardcoded `InboundLead` constants + a pure BANT scorer | **always sample** | **no** |
| `lib/twin` (drafts) | reply drafts with `contact: string` | real | yes (`twin` blob) |
| `lib/lead-signals` | prompt text derived from lead-quality | derived | no |

A naive new module would have forked all four. This layer sits **underneath** them
instead, and the existing surfaces read from it.

**The do-not-fork list** (things that already exist and must be reused, not rebuilt):
CSV tokenizing (`catalog/feed.ts#parseCsvRecords`, `lead-quality/import.ts#parseLeadDate`);
the stage vocabulary (`LeadStage` + `STAGE_RANK`); BANT scoring
(`speed-lead/qualification.ts#qualificationScore`); the reply/approval gate (the whole
`twin` draft lifecycle — a lead module hands off to it, never grows its own reply box);
connector config + token crypto + sync health (`inventory/*`); the integration
readiness rows (`integrations/compute.ts`); and above all the **channel vocabularies** —
the repo already has three (`LeadChannel`, `TwinChannel`, lead-quality's free-string
`source`) and adding a fourth was the failure mode to avoid.

---

## 1. Entity model

The **collapsed** CRM model (HubSpot/Attio/Pipedrive convergence), not the
Salesforce Lead→Contact conversion split, which forces painful duplicate handling
and reporting seams.

- **`Contact`** — the identified person, carrying the lifecycle stage, the dedup
  keys, the consent record and the timeline. This is the spine.
- **`Company`** — optional, materialised only when a domain or **IČO** is known.
  A B2C project never creates one. (IČO is a perfect Czech natural key.)
- **`Deal`** — optional, the money opportunity. A `local` project's booking has no
  deal; a `leadgen` roof replacement does. Keeping value on a separate entity is
  what lets one contact enquire twice without corrupting the funnel counts.

Plus two supporting records, deliberately kept distinct:

- **`LeadEvent`** — the immutable raw connector output, kept for replay/audit and
  as the **idempotency ledger**.
- **`Activity`** — the human-meaningful, editable timeline row.

All in `src/lib/leads/types.ts`: framework-free, pure, type-only imports.

---

## 2. Stage projection — the unification guarantee

`PipelineStage` is a **superset** of `lead-quality`'s `LeadStage`, never a
replacement:

```
new → working → lead → qualified → opportunity → won
                          ↘            ↘           ↘  lost (with reason)
                                                   ↘  disqualified (with reason)
```

- The **old four keep their `STAGE_RANK` values** (0..3), so an aggregate built
  from contacts is comparable with one built from `aggregateLeads`. A unit test
  pins this equality.
- `new` / `working` sit at rank 0 alongside `lead`.
- `lost` / `disqualified` get rank **-1** — outside the cumulative funnel.
  `toLeadStage()` returns `null` for them.
- Loss reasons are a **fixed preset** (`LOST_REASONS`), following the twin's
  `REJECT_REASONS` precedent, *because they are counted*. Free text rides alongside
  in `lostNote`.

**The proof** is `aggregate.ts#contactsToLeadSources`: real contacts produce the same
`LeadSource[]` that `lead-quality/compute.ts` consumes, with **zero changes to
compute.ts**. `test-unit/leads-aggregate.test.mjs` round-trips a contact set through
`withMetrics` / `summarize` / `funnelBySource` / `avgVelocity` / `sourceAlerts`.

Two things the contact tier can give that an aggregate import never could:
**real `daysToQualify` / `daysToClose`**, computed from `stage_change` activities —
which is why every stage move MUST append one (`mutate.ts#changeStage`).

---

## 3. Attribution

Never a single `source: string`. The standard tuple (`Attribution`): `source`,
`medium`, `campaign`, `term`, `content`, `landingPath`, `referrerHost`, `gclid`,
`connectorId`, `externalId`.

The **display label is derived**, never stored twice: `aggregate.ts#sourceLabel`
maps `(source, campaign)` to one human label. Storing it on the contact is how a
rename desyncs a funnel. First touch wins for `source`; last touch fills the blanks
(`apply.ts#mergeAttribution`).

---

## 4. Dedup (§B6)

- **Email**: lowercase + trim; canonicalise `googlemail.com → gmail.com`; strip
  `+tag` and dots **only for gmail/googlemail**. Stripping dots for an arbitrary
  domain is a correctness bug — `a.b@example.com` and `ab@example.com` are two
  different mailboxes.
- **Phone**: E.164, CZ default (`+420`), SK second. `+420 777 123 456`,
  `777123456`, `00420777123456` and `420777123456` all fold to `+420777123456`.
  ~40 lines, pure, **no new dependency** — add `libphonenumber-js` only if non-EU
  numbers start to matter.
- **Name**: `normalizeForSearch()` (NFD strip + lowercase, Czech-safe) for
  **fuzzy suggestion only**, never an auto-merge.
- **Company**: `ico` exact; else the registrable domain from the email, with free-mail
  domains excluded (half a town shares gmail.com).
- **Merge policy**: auto-merge on exact normalised email **OR** exact E.164 phone,
  and nothing else. Everything else is a *suggested duplicate* a human confirms.
  Auto-merge is reversible: `mergedFrom` on the survivor.
- **Idempotency**: `dedupKey = ${connectorId}:${externalId}`, unique per project.
  This is what makes polling safely re-runnable and webhook retries harmless — and
  it is not optional, because Meta retries for an undocumented window and LinkedIn's
  notifications are at-least-once.

---

## 5. Scoring — two axes, never one number

`fit × engagement`, because a 70 built from "great fit, no engagement" needs the
opposite action from "poor fit, very engaged".

- **Fit** (0–100): reachability, service match against the **catalog Offering
  spine**, business signal (IČO / company), region match, channel quality.
  Deterministic, computable at creation, **no LLM**. Components that cannot be
  evaluated are *dropped and the rest re-normalised*, so an unconfigured project is
  not punished with a low score.
- **Engagement** (0–100): half is `qualificationScore()` **reused verbatim** from
  speed-lead; half is behavioural (inbound volume, did we reply, meeting booked).
  Multiplied by a **recency decay that halves every 30 days**.
- **Grade**: the plain 2×2 at a threshold of 60. `A` = both, `B` = fit only,
  `C` = engagement only, `D` = neither. `B` outranks `C` because fit is the half you
  cannot change.

An optional `lead-triage` LLM layer was scoped in the research and **deliberately not
built here**: it must be a *proposal*, never an auto-write, must be tagged
`// llm-tool: lead-triage`, must register in `test-llm/registry.mjs`, and must redact
PII first (see §7).

---

## 6. Storage — ROW-BASED, and why that is a deviation

Every other per-project store in this repo is **one JSON blob per project**
(`twin`, `lead_imports`, `onboarding`, `local_signals`…). That is right for a
bounded settings object and **wrong here**:

- a lead archive with an activity timeline is the first genuinely **unbounded,
  append-heavy** domain in the repo;
- Firestore documents cap at **1 MiB** and the whole blob is read+written on every
  mutation;
- a webhook write and a UI write would race on read-modify-write and lose updates.

So: **one row/doc per record.**

| Local (`node:sqlite`) | Firestore |
|---|---|
| `lead_contacts (project_id, id, stage, email_key, phone_key, updated_at, data)` | `leads/{projectId}/contacts/{contactId}` |
| `lead_events (project_id, dedup_key, occurred_at, status, data)` | `leads/{projectId}/events/{dedupKey}` |
| `lead_activities (project_id, contact_id, id, at, kind, data)` | `leads/{projectId}/activities/{id}` |
| indexes on `(project_id, updated_at)`, `(project_id, email_key)`, `(project_id, phone_key)`, `(project_id, contact_id, at)` | mirrored `emailKey` / `phoneKey` / `stage` / `updatedAt` fields; a tiny `leads/{projectId}` index doc holds `contactCount` |

⚠ **`src/lib/db.ts` invariant**: a new table needs BOTH a `CREATE TABLE IF NOT
EXISTS` in `SCHEMA` **and** an append-only `MIGRATIONS` entry (here: **v21**).
`test-unit/db-migrations.test.mjs` diffs a fresh db against a v1-era db carried
through the migrations and fails on drift. (v20 exists purely as the catch-up for
seven tables that were once added to SCHEMA only — do not repeat that.)

Caps: `ACTIVITY_CAP` 500 per contact (oldest evicted), `EVENT_CAP` 20 000 per
project, `CONTACT_CAP` 20 000 per project (a create beyond it is rejected, not
silently dropped).

---

## 7. Consent & GDPR — a legal requirement for a Czech-first product

- **Lawful basis per purpose**, not one boolean. Purposes: `service`,
  `marketing_email`, `marketing_sms`, `profiling`. Bases: `consent`, `contract`,
  `legitimate_interest`, `legal_obligation`.
- A `ConsentRecord` must be **provable**: purpose, granted, basis, timestamp,
  origin, the exact `evidenceText` shown, optional IP, `withdrawnAt`. Append-only —
  never overwrite. `mayContact()` **fails closed**: an absent record is not a
  permission.
- **Czech specifics**: ZoZOÚ 110/2019 Sb. implements GDPR; **§ 7 zák. 480/2004 Sb.**
  governs commercial communications (opt-out for existing customers on similar
  products, opt-in otherwise). Record which route applies for `marketing_email`.
- **Retention**: `retainUntil` on the contact, default 24 months from last activity
  for unconverted leads, so a cron can sweep. A `leads-retention` cron is the
  natural sixth (mind Vercel's cron-count limits). *Not built in this phase.*
- **Erasure** (`mutate.ts#eraseContact`): hard-clears every PII field AND deletes the
  whole timeline (where message bodies live), then leaves a **tombstone** —
  `erasedAt` + `eraseReason` on an anonymous funnel skeleton (stage, attribution,
  timestamps). Art. 17 does not require destroying anonymous statistics, and a row
  delete would silently rewrite historic funnel counts in Kvalita leadů. The timeline
  is deleted *first*, so a crash between the two writes can never leave message
  bodies behind a "tombstoned" record. `isErased()` contacts are hidden from lists
  and never rendered as a person.
- **Data minimisation**: `bodyRetention: "full" | "snippet" | "none"` per connection,
  **default `snippet`**. A Gmail connector that ingests full bodies is a large PII
  surface.
- **No lead PII in the LLM chokepoint.** `generateStructured` mirrors traffic to
  LightTrack (`lib/llm/lighttrack.ts`), so PII in a prompt is mirrored to a
  self-hosted analytics store too. **There is no LLM call anywhere in
  `src/lib/leads/**` or `/api/projects/[id]/crm/**`, and adding one requires a
  `redactPii()` pass first.**

---

## 8. Connector abstraction

Shaped as a **sibling** of `twin/connectors.ts` (same `id/label/labelEn/configured`
+ client-safe projection + degrade-at-write) and a copy of
`inventory/connection-store.ts` for the persisted record. That one *sends*; this one
*receives*.

**Polling is the universal baseline; webhooks are a cloud-only accelerator.** A
self-hosted or `LOCAL_DB` deployment behind NAT cannot receive a webhook, so every
connector implements `pull()`. `IngestMode` is `poll | webhook | push_only`, and the
active mode is **derived, never stored** (`resolveIngestMode`) — a stored "webhook"
would keep claiming webhooks after a move to a NAT'd box.

### 8.1 The one place the principle breaks: WhatsApp

Meta exposes **no read path at any tier**: `/{phone-number-id}/messages` is
POST-only, the WABA node has no messages/conversations edge, `GET /{wamid}` does not
exist, and `conversation_analytics` returns counts, never bodies. If your endpoint is
down past the (undocumented) retry horizon, those leads are **gone permanently** —
there is no backfill, replay or dead-letter API.

The honest resolution: WhatsApp's `poll` drains **our own relay queue**, not Meta.

```
                    ┌──────────── CLOUD (Vercel) ────────────┐
 Meta ──webhook──▶  │ /api/hooks/whatsapp                    │
                    │  verify X-Hub-Signature-256 over RAW   │
                    │  body → enqueue LeadEvent → 200 (<5 s) │
                    └──────────────┬─────────────────────────┘
                                   │ durable queue (Firestore collection / sqlite table)
                    ┌──────────────▼─────────────────────────┐
 self-host ──poll──▶│ GET /api/relay/drain?cursor=…          │  ← outbound 443 only
                    └────────────────────────────────────────┘
```

For an operator who refuses any hosted component the options are exactly: a
Cloudflare Tunnel / VPS reverse proxy in front of their own box, a BSP that exposes
message retrieval (360dialog ≈ €49/mo flat), or **no WhatsApp**. Do not ship a
"WhatsApp (polling)" toggle that cannot work — which is why `push_only` exists and a
unit test pins that WhatsApp does not declare `poll`.

### 8.2 The registry

| Connector | State | Honest caveat (shipped cs+en in `registry.ts`) |
|---|---|---|
| `manual` | ✅ implemented | no-op registrar; the degrade target for any unknown id |
| `csv` | ✅ implemented | one-off import; re-importing the same file duplicates nothing |
| `gsheet` | 🟡 stub | Picker + `drive.file` needs **no verification, no CASA, no user cap** — but the Picker must run in the browser with the user signed in, which is a UI phase |
| `gmail` | 🟡 stub | restricted scopes → verification + **annual CASA Tier 2** (≈$540–1 800/yr, *not* the folklore $15k–75k). Plan: BYO Cloud project. Pub/Sub **pull** works behind NAT |
| `whatsapp` | 🟡 stub | cannot be polled; number registration **destroys** the existing WhatsApp account + history and is effectively irreversible; inbound is free |
| `linkedin` | 🟡 stub | no self-serve Lead Sync access (months, discretionary); 90-day retention; **inbox reading does not exist at any price** and the vendors selling it risk the *customer's* account |

`storableLeadConnectorId()` degrades an unknown or unimplemented id to `manual` **at
the write boundary**. The ingest API refuses an unimplemented connector with a 501
rather than degrading — degrade-at-write applies to *stored* ids, not to a request
asking us to do something we cannot do.

Per-connector normalisation converges on `LeadEvent`:

| Connector | `externalId` | identity | attribution |
|---|---|---|---|
| WhatsApp | `wamid.…` | **`user_id` (BSUID) primary**, `wa_id` secondary | `whatsapp` + free-entry-point flag |
| Gmail | `messages[].id` | From header (RFC 5322), reply-to | sender domain / label rule |
| Sheets | `${fileId}:${rowIndex}` + row hash | mapped columns | UTM columns |
| LinkedIn | `responseId` | `answers[].questionId` → `predefinedField` | `sponsoredLeadMetadata.campaign` + `hiddenFields` |
| CSV / manual | `${importId}:${rowIndex}` | mapped columns | `import` / `manual` |

### 8.3 Credentials (when connector code is written)

Reuse `inventory/token-crypto.ts` (**v2 per-token salts**, `hasTokenCrypto()`), not a
fifth implementation. Follow `llm/keys/crypto.ts`'s fail-safe posture: **no secret
configured ⇒ the connect flow refuses to store a token** rather than writing
plaintext. Lead connections are keyed **per (user, project)** like
`inventory/connection-store.ts` — a tenant may run two brands. OAuth refresh
(`refreshTokenEnc` + `tokenExpiresAt` + refresh-on-401) is genuinely new code:
`social/connection.ts` stores a token but has no refresh loop.

**BYO OAuth app** is the answer to the verification/CASA burden — let the operator
paste their own Google client id + secret, exactly the pattern the repo already
shipped for models (BYOM).

### 8.4 Build order (C4.6)

1. **Sheets/Drive import** (Picker + `drive.file`) — zero approvals, proves the
   `LeadEvent → applyLeadEvent → Contact` pipeline end to end.
2. **CSV / manual** — ✅ *done in this phase*; also the LinkedIn day-one path.
3. **Gmail, BYO Cloud project** — `history.list` polling first, Pub/Sub pull as the
   upgrade.
4. **WhatsApp** — self-hoster with their own Meta app + the relay queue; BSUID-keyed
   from day one.
5. **LinkedIn Lead Sync** — start the approval clock now, ship behind CSV/Zapier
   meanwhile.

Runtime notes for later: webhook routes at `/api/hooks/<connector>` would be the
**first unauthenticated POST routes in the repo** — raw-body HMAC
(`await req.text()`, never `req.json()`), tenant routing from a provider id, <5 s
response. Nothing in `route-utils` / `api-guard` covers that yet. The polling sweep
should copy `cron/catalog-sync/route.ts` verbatim (walk connections → decrypt → pull
→ apply → `classifySyncResult` → alert only on the healthy→failing transition →
`recordCronRun`, `maxDuration = 300`).

---

## 9. API surface (this phase)

Namespace is **`/api/projects/[id]/crm/**`**, NOT `/leads/**`:
`POST /api/projects/[id]/leads/import` already exists and belongs to the *aggregate*
funnel importer. Two different meanings of "lead" must not share a prefix.

| Route | Method | Behaviour |
|---|---|---|
| `crm/contacts` | `GET` | list; `?stage=&q=&limit=&offset=`; returns the **resolved** set (`live: false` + sample when the project has none) |
| `crm/contacts` | `POST` | create one by hand — routed through `applyLeadEvent`, so a resubmit is a no-op |
| `crm/contacts/[contactId]` | `GET` | contact + timeline (newest first) |
| `crm/contacts/[contactId]` | `PATCH` | stage move (appends `stage_change`; terminal stages require a preset reason) and/or field edits |
| `crm/contacts/[contactId]` | `DELETE` | GDPR erase → tombstone (not a row delete) |
| `crm/events` | `POST` | ingest `manual` or `csv`; unimplemented connector ⇒ 501 |

All ownership-guarded through `requireOwnedProject` (the one place the
`currentUserId` + `getProject` + 401/404 handshake lives). No route in this namespace
accepts a wire-supplied project id, so `rejectUnknownProject` — the guard for ids
that get turned into tenant keys — has nothing to protect here; add it the moment a
body starts carrying one. Writes are rate-limited through the existing
`WORKSPACE_RATE.leadsImport()` bucket. Errors carry a machine `code` alongside the
human string, per the route-utils catalog.

---

## 10. Open items / deviations from the blueprint

1. **`lead-quality/resolve.ts` was NOT extended with a third "contacts" tier.**
   `ResolvedLeadSources.source` is `"sample" | "import" | "url"`, and
   `kvalita-leadu/page.tsx` passes it straight into `LeadQualityModule`'s typed
   `source` prop. Widening the union is therefore a typecheck failure in a component
   — outside this phase's write set (no component edits). **TODO for the UI phase:**
   widen `ResolvedLeadSources["source"]` to include `"contacts"`, add the tier
   (`live contacts → imported CSV → sample`) using `contactsToLeadSources`, and add
   the cs+en copy to `LeadQualityModule`'s dict in the same commit.
2. **`Company` and `Deal` are typed but have no store yet.** `contactsToLeadSources`
   already accepts `Deal[]`, so the aggregate is ready for them; nothing writes one.
3. **No retention cron.** `retainUntil` is on the type; the sweep is not built.
4. **No merge/unmerge UI or suggested-duplicate queue.** `isDuplicateCandidate` and
   `mergedFrom` exist; nothing surfaces them yet.
5. **`Contact.erasedAt` / `eraseReason` are an addition to the B9 type set** — the
   blueprint described a separate tombstone record; keeping the skeleton in place is
   simpler and keeps the funnel counts stable by construction.
6. **Firestore `listContacts` filters `stage` in memory** over a bounded scan window
   rather than requiring a `stage + updatedAt` composite index (the
   `cron_runs`/`twin_archive` posture). Revisit if a project's contact count makes
   the scan window bite.

### ⚠ [U] — claims that MUST be re-verified before connector code is written

The research pass marked these **unverified**. Treat each as a design hypothesis,
not a fact:

- **WhatsApp BSUID / `user_id`** — every date and field name in that block, against
  `developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/`.
  (The *advice* — key on the opaque provider id, keep the phone number as enrichment
  — is sound regardless and costs nothing to follow.)
- **WhatsApp Coexistence** history-sync details and its Tech-Provider gating —
  re-check before promising any history import.
- **Cloud API Local Storage** EU data residency — confirm before it appears in any
  marketing or DPA copy.
- **WhatsApp throughput numbers** (80/20 mps, error `130429`, shared inbound+outbound
  budget) and **media URL/id TTLs**. Regardless of the exact TTLs, **download media
  eagerly at ingest**.
- **LinkedIn's 1 500 webhook subscriptions per app** cap — reap dead subscriptions
  either way.
- **The LinkedIn `predefinedField` enum membership.**
- **Google Picker `drive.file` grant persistence** (observed behaviour, not a
  documented guarantee — store file ids and handle 404/403 by re-prompting) and the
  `trigger_onepick=true` desktop flow.

Third-party-only figures (do not plan around them): Czech WhatsApp per-message rates
(pull Meta's CSV rate cards instead of hardcoding), CASA assessor pricing, WhatsApp
retry windows, LinkedIn approval timelines.

---

## 11. Exported surface

Pure / framework-free: `types.ts`, `normalize.ts`, `score.ts`, `aggregate.ts`,
`store-filter.ts`, `sample.ts`, `connectors/types.ts`, `connectors/csv.ts`,
`connectors/manual.ts`, `connectors/gsheet.ts`, `connectors/registry.ts`.

Server-only: `store.ts` (+ `.local` / `.firestore`), `apply.ts`, `mutate.ts`,
`resolve.ts`.

Tests: `test-unit/leads-normalize.test.mjs`, `leads-score.test.mjs`,
`leads-aggregate.test.mjs`, `leads-apply.test.mjs`, `leads-connectors.test.mjs`,
and the migration guard in `db-migrations.test.mjs`.
