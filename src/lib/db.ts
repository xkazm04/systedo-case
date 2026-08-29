/** Local SQLite store (server-only). Backs two things only:
 *   - the anonymous AI rate-limiter (`rate_limits`), always on; and
 *   - in LOCAL_DB mode, the authed product's `users`/`projects` (normally in
 *     Firestore) so `/app` works fully offline.
 *  Synced Google Ads campaigns and AI evaluation reports do NOT live here — they
 *  persist per-tenant in Firestore (see `campaigns/store.ts`, commit 9e66ed9).
 *  Stored at `.data/systedo.db` (gitignored).
 *
 *  Uses Node's built-in `node:sqlite` (Node 22.5+/24), so there is no native
 *  build step and no extra dependency — the same zero-dependency spirit as the
 *  rest of the project. Import only from server code (route handlers / stores).
 */
import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Survive Next.js dev hot-reload: keep a single connection on globalThis instead
// of opening a new handle every time this module is re-evaluated. We also remember
// which schema definition was last applied to that handle, so a handle that
// outlived an HMR across a schema change still picks up new tables/columns.
const g = globalThis as unknown as { __systedoDb?: DatabaseSync; __systedoSchema?: string };

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
    (c) => c.name === column
  );
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) != null
  );
}

function indexExists(db: DatabaseSync, index: string): boolean {
  return (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get(index) != null
  );
}

// ⚠️ INVARIANT — adding a table OR AN INDEX here is NOT enough. SCHEMA builds FRESH
// databases (via migration v1); every PRE-EXISTING database is already stamped at v1
// and will NEVER re-run it, so anything added only to SCHEMA is invisible to
// production. Any NEW table or index must ALSO get an append-only entry in MIGRATIONS
// below (see v7..v17 for the pattern). test-unit/db-migrations.test.mjs pins this: it
// diffs a fresh-migrated db against a v1-era db carried forward through the migrations
// and fails if the TABLE set, any table's COLUMN set, or the INDEX set differs.
//
// The index half of that sentence is not hypothetical: idx_projects_user lived in
// SCHEMA alone from the ledger's introduction until v22 backfilled it (2026-08-29),
// because the guard compared table names only and could not see it.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS rate_limits (
    bucket       TEXT NOT NULL,
    ip           TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL,
    PRIMARY KEY (bucket, ip)
  );

  -- LOCAL_DB mode only: the authed product's users + projects, normally in
  -- Firestore, persisted locally so /app works fully offline (see local-mode.ts,
  -- projects/store.local.ts, users/local.ts). Untouched when LOCAL_DB is off.
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT,
    image      TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    accent_color    TEXT NOT NULL,
    logo_url        TEXT,
    domain          TEXT,
    tenant          TEXT,
    ads_customer_id TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user
    ON projects (user_id, created_at);

  -- LOCAL_DB mode only: a project's business catalog (offerings), stored as one
  -- JSON blob keyed by (user, project). Mirrors the Firestore projectCatalogs doc.
  -- Read/written by catalog/store.local.ts; the seed is the fallback when absent.
  CREATE TABLE IF NOT EXISTS project_catalog (
    user_id    TEXT NOT NULL,
    project_id TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id)
  );

  -- LOCAL_DB mode only: per-(user, project, key) JSON blob for module state that
  -- used to live only in the browser (the content schedule, review triage). Mirrors
  -- the Firestore users/{uid}/projectState/{projectId}__{key} doc. See
  -- project-state/store.local.ts.
  CREATE TABLE IF NOT EXISTS project_state (
    user_id    TEXT NOT NULL,
    project_id TEXT NOT NULL,
    key        TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id, key)
  );

  -- A1: live report metrics synced from an ad platform (Google Ads). One blob per
  -- project holding {meta, rows[]} — project-scoped (the synced data belongs to the
  -- project, not the user who triggered the sync). Absent → the report falls back
  -- to the scaled sample dataset (illustrative). See src/lib/report-metrics/.
  CREATE TABLE IF NOT EXISTS report_metrics (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- A2: live local signals (imported/synced keyword-rank ladder) per local project.
  -- One blob per project holding {meta, ladder[]}; absent → the map falls back to
  -- the sample ladder (illustrative). See src/lib/local-signals/.
  CREATE TABLE IF NOT EXISTS local_signals (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- A3: a project's real cost model (blended gross margin, monthly overhead,
  -- per-order cost) so the report shows true net profit after COGS. One blob per
  -- project; absent → the report stays on pre-COGS contribution. See src/lib/cost-model/.
  CREATE TABLE IF NOT EXISTS cost_model (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- C3: a project's optional competitor set (user-entered names + notes), fed into
  -- the recap + social grounding so the narrative is comparative, not just self-referential.
  CREATE TABLE IF NOT EXISTS competitors (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Per-project monthly REVENUE goal + its change timeline ({goal, history[]} blob),
  -- so the live report's pacing/attainment judge against the client's real target
  -- rather than the illustrative sample goal. Project-scoped (NOT the account-scoped
  -- report-config goal). Absent → the sample goal, labeled "ukázkový cíl". See src/lib/goals/.
  CREATE TABLE IF NOT EXISTS project_goal (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- The Kanály module's organic (zero ad-spend) visibility plan: per-project tracked
  -- channel status (the checklist) + an optional pinned AI plan, as one {statuses,
  -- plan?} blob. Absent → the module runs on the seeded per-type sample with no
  -- statuses. See src/lib/organic-channels/.
  CREATE TABLE IF NOT EXISTS organic_channels (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Persisted AI diagnoses (LTV cohort + lead-source root-cause): per-project
  -- {items[], updatedAt} blob, each item carrying its kind, result payload,
  -- status lifecycle (new→acknowledged→resolved), created timestamp and the input
  -- digest it was computed from. Newest-first, capped per kind. Absent → no saved
  -- diagnoses yet (the panels render their idle hint). See src/lib/diagnoses/.
  CREATE TABLE IF NOT EXISTS diagnoses (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Persisted monthly recaps: per-project {items[], updatedAt} blob, each item a
  -- generated recap for a period (the result payload, the createdAt timestamp, the
  -- input hash it was computed from — for the stale marker — and the locale). The
  -- most report-like AI artifact used to regenerate on every visit; now it is a
  -- record with capped history (newest-first, capped per period). Absent → nothing
  -- generated yet (the narrative renders its idle hint). See src/lib/recaps/.
  CREATE TABLE IF NOT EXISTS recaps (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Per-project report annotations ("what happened here" client-authored business
  -- events pinned to a date), as one {items, updatedAt} blob. Absent → the report
  -- has no notes yet. Live datasets map these into the chart's event markers + the
  -- recap grounding (a demo dataset carries its own authored event calendar). See
  -- src/lib/annotations/.
  CREATE TABLE IF NOT EXISTS annotations (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Persisted landing-page experiments per project: one {items[], updatedAt} blob,
  -- each item an LpExperiment (cluster + control/challenger variants with visitors +
  -- signups + a status running|done). Absent → the module runs on the seeded
  -- per-project sample experiments (illustrative, never mined as account-proven). A
  -- REAL persisted experiment's significant winner IS mined as a live creative pattern
  -- (see patterns/extract.ts extractExperimentPatterns). See src/lib/lp-exp/.
  CREATE TABLE IF NOT EXISTS lp_experiments (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- The Twin module's communication double: the per-channel trained voice, the
  -- style facts it was trained on, the channel/autonomy config and the draft
  -- outbox, as one blob. Absent → the seeded per-type sample (an untrained twin
  -- with a generic register and an empty outbox). See src/lib/twin/.
  CREATE TABLE IF NOT EXISTS twin (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- The Twin outbox's history store: terminal drafts (sent/rejected) ARCHIVED out
  -- of the hot twin blob so audit records stop silently vanishing when the blob's
  -- draft cap is reached. One row per archived draft; the full record is the JSON
  -- data blob, with channel/status/archived_at columned for the bounded reads
  -- (rejection-pattern learning, history listing) + oldest-first eviction. Capped
  -- ~1000/project on write. See src/lib/twin/archive-store.*.
  CREATE TABLE IF NOT EXISTS twin_archive (
    project_id  TEXT NOT NULL,
    id          TEXT NOT NULL,
    channel     TEXT NOT NULL,
    status      TEXT NOT NULL,
    archived_at TEXT NOT NULL,
    data        TEXT NOT NULL,
    PRIMARY KEY (project_id, id)
  );

  CREATE INDEX IF NOT EXISTS idx_twin_archive_project
    ON twin_archive (project_id, archived_at);

  -- Imported CRM leads per project: one {items[], source, syncedAt, updatedAt} blob,
  -- each item a raw lead (source + stage + date + optional value/closeDate). Absent →
  -- the funnel runs on the seeded per-project sample (illustrative). Present → the
  -- funnel/velocity/alerts + AI grounding compute over the imported rows, honestly
  -- labelled live. See src/lib/lead-quality/ (import.ts aggregates → LeadSource shape).
  CREATE TABLE IF NOT EXISTS lead_imports (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- The CRM lead ENTITY layer (src/lib/leads/). Deliberately ROW-BASED, not the
  -- single-JSON-blob-per-project shape every other module here uses: a lead archive
  -- with an activity timeline is the first genuinely UNBOUNDED, append-heavy domain
  -- in this repo, and a blob would hit Firestore's 1 MiB document cap and lose
  -- updates to read-modify-write races between a connector write and a UI write.
  -- One row per contact, keyed (project_id, id); email_key/phone_key are the
  -- NORMALISED dedup keys (see leads/normalize.ts) columned + indexed so an upsert
  -- is an indexed probe, not a scan. stage/updated_at back the list ordering.
  CREATE TABLE IF NOT EXISTS lead_contacts (
    project_id TEXT NOT NULL,
    id         TEXT NOT NULL,
    stage      TEXT NOT NULL,
    email_key  TEXT,
    phone_key  TEXT,
    updated_at TEXT NOT NULL,
    data       TEXT NOT NULL,
    PRIMARY KEY (project_id, id)
  );

  CREATE INDEX IF NOT EXISTS idx_lead_contacts_project
    ON lead_contacts (project_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_lead_contacts_email
    ON lead_contacts (project_id, email_key);
  CREATE INDEX IF NOT EXISTS idx_lead_contacts_phone
    ON lead_contacts (project_id, phone_key);

  -- Raw inbound connector events, kept for replay/audit AND as the idempotency
  -- ledger: dedup_key is "connectorId:externalId" and is UNIQUE per project,
  -- which is the single mechanism that makes polling safely re-runnable and webhook
  -- retries harmless. Cold archive — never read on the hot list path.
  CREATE TABLE IF NOT EXISTS lead_events (
    project_id  TEXT NOT NULL,
    dedup_key   TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    status      TEXT NOT NULL,
    data        TEXT NOT NULL,
    PRIMARY KEY (project_id, dedup_key)
  );

  CREATE INDEX IF NOT EXISTS idx_lead_events_project
    ON lead_events (project_id, occurred_at);

  -- The per-contact activity timeline, one row per entry (capped per contact on
  -- write, oldest evicted). stage_change rows are what make time-in-stage and real
  -- daysToQualify/daysToClose computable per lead instead of sampled constants.
  CREATE TABLE IF NOT EXISTS lead_activities (
    project_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    id         TEXT NOT NULL,
    at         TEXT NOT NULL,
    kind       TEXT NOT NULL,
    data       TEXT NOT NULL,
    PRIMARY KEY (project_id, id)
  );

  CREATE INDEX IF NOT EXISTS idx_lead_activities_contact
    ON lead_activities (project_id, contact_id, at);

  -- The Start module's onboarding state: the applied website-scan business profile
  -- + a couple of flags (scanApplied, dismissed), as one blob. Absent → a fresh
  -- project (nothing scanned yet); the connector checklist's per-step "done" is
  -- derived live from the real stores, never stored here. See src/lib/onboarding/.
  CREATE TABLE IF NOT EXISTS onboarding (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- LOCAL_DB mode only: a project's persisted warehouse/ERP connection. token_enc is
  -- the AES-GCM-encrypted API token (see token-crypto.ts) — never stored plaintext,
  -- never returned to the client. Mirrors the Firestore projectConnections doc.
  CREATE TABLE IF NOT EXISTS warehouse_connection (
    user_id       TEXT NOT NULL,
    project_id    TEXT NOT NULL,
    provider      TEXT NOT NULL,
    inventory_id  TEXT,
    token_enc     TEXT,
    config_json   TEXT,
    connected_at  TEXT NOT NULL,
    last_sync_at  TEXT,
    last_error    TEXT,
    last_error_at TEXT,
    fail_count    INTEGER,
    PRIMARY KEY (user_id, project_id)
  );

  -- LOCAL_DB mode only: a user's per-user Sklik API connection. token_enc is the
  -- AES-GCM-encrypted Sklik API token (see inventory/token-crypto.ts) — never stored
  -- plaintext, never returned to the client. money_verdict / halere_confirmed carry
  -- the Direction-3 money-unit diagnostic + the owner's confirmed haléře conversion.
  -- Keyed by user (a Seznam login is per-user). Mirrors the Firestore
  -- sklikConnections doc. See src/lib/campaigns/sklik-connection.*.
  CREATE TABLE IF NOT EXISTS sklik_connection (
    user_id             TEXT PRIMARY KEY,
    token_enc           TEXT NOT NULL,
    connected_at        TEXT NOT NULL,
    money_verdict       TEXT,
    money_verdict_at    TEXT,
    halere_confirmed    INTEGER,
    halere_confirmed_at TEXT
  );

  -- Direction 1: a project's owner-entered finance inputs (the /zisk module's margin
  -- scenarios, per-period real-numbers override and last-edited per-channel margins),
  -- as one {realNumbers?, scenarios, channelMargins?, updatedAt} blob. Replaces the
  -- browser-only localStorage the module used to scatter these across. Absent → the
  -- module opens on defaults. The apply-to-report blended margin still flows to
  -- cost_model separately. See src/lib/profit/finance-inputs/.
  CREATE TABLE IF NOT EXISTS finance_inputs (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- A project's persisted inventory action plan + per-SKU stock-alert episodes, as
  -- one {plan, stockAlerts, updatedAt} blob. The plan is the saved budget-move
  -- recommendation with per-move state (proposed|accepted|dismissed) and the inputs
  -- digest; stockAlerts is the planSuppression state that makes stockout alerts
  -- transition-only. Absent → nothing saved yet. Mirrors the Firestore inventoryPlans
  -- doc. See src/lib/inventory/plan-store.*.
  CREATE TABLE IF NOT EXISTS inventory_plan (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- LOCAL_DB mode only: a user's BYOM (bring-your-own-model) config — one JSON
  -- blob holding the active vendor and per-vendor ENCRYPTED provider API keys
  -- (see llm/keys/crypto.ts). Keys are never stored plaintext, never returned to
  -- the client. Mirrors the Firestore byomConfigs doc.
  CREATE TABLE IF NOT EXISTS byom_config (
    user_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Per-(tenant, kind) claim-first double-run guard for scheduled crons. The
  -- period column is the claimed window key (e.g. the digest's Monday-anchored ISO
  -- week); a claim is an UPSERT that only updates when the period CHANGES, so an
  -- already-sent window can't be re-sent by a manual re-fire. Mirrors the Firestore
  -- tenants/{tenant}/config/{kind} doc. See src/lib/cron/sent-guard.*.
  CREATE TABLE IF NOT EXISTS cron_sent_guard (
    tenant     TEXT NOT NULL,
    kind       TEXT NOT NULL,
    period     TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    PRIMARY KEY (tenant, kind)
  );

  -- Durable cron run records: one row per scheduled-cron invocation, so
  -- "did last night's report deliver?" is answerable without Vercel logs. The
  -- full record (counts + truncated results/errors) is the JSON data blob; cron /
  -- finished_at / ok are columned for retention + the health projection. Capped to
  -- ~20 rows per cron on write. Mirrors the Firestore cronRuns collection. See
  -- src/lib/cron/runs-store.* and run-record.ts.
  CREATE TABLE IF NOT EXISTS cron_runs (
    id          TEXT PRIMARY KEY,
    cron        TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    ok          INTEGER NOT NULL,
    data        TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cron_runs_cron
    ON cron_runs (cron, finished_at);

  -- Durable L2 for the /api/ai response cache: one row per cached (mode+locale+
  -- provider+input) result, so an identical request served on ANOTHER instance (or
  -- after a deploy) reuses a recent result instead of re-paying a model call. The
  -- process-local L1 (src/lib/ai/response-cache.ts) is still consulted first; this
  -- backs it durably. cache_key is the sha256 input hash; tool (the mode id) is
  -- columned for the per-tool entry cap; data is the JSON AiResponse; expires +
  -- created_at are epoch ms (TTL check on read, oldest-first eviction on write).
  -- Best-effort by contract — a miss/hiccup never fails a response. Mirrors the
  -- Firestore aiResponseCache collection. See src/lib/ai/response-cache-store.*.
  CREATE TABLE IF NOT EXISTS ai_response_cache (
    cache_key  TEXT PRIMARY KEY,
    tool       TEXT NOT NULL,
    data       TEXT NOT NULL,
    expires    INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ai_response_cache_tool
    ON ai_response_cache (tool, created_at);

  -- LOCAL_DB mode only: the generic per-tenant document twin backing the four
  -- campaign-data stores (campaigns, series, reports, snapshots + the tenant root)
  -- so the whole Vykon surface works fully offline instead of hard-500ing when
  -- Firestore is unreachable. One row per (tenant, collection, doc_id); data is the
  -- doc's JSON, mirroring a Firestore document. collection is the sub-collection name
  -- (campaigns/series/reports/snapshots) or the reserved __root__ for the tenant root
  -- doc. period is an EXTRACTED, INDEXED copy of data.period (null when absent) so the
  -- hot period equality (the per-sync campaign stale-clear and the per-period report
  -- lookups) is a single-field indexed probe rather than a JSON scan; other equalities
  -- (report input_hash) use json_extract over the already-tiny match set. Doc-id range
  -- reads (the period-keyed snapshot window) rely on the PK's binary doc_id ordering,
  -- which matches Firestore's document-id byte order for these ASCII+PUA ids. Mirrors
  -- tenants/{tenant}/... ; see src/lib/campaigns/store/local-docs.ts + backend.ts.
  -- Untouched when LOCAL_DB is off.
  CREATE TABLE IF NOT EXISTS campaign_docs (
    tenant     TEXT NOT NULL,
    collection TEXT NOT NULL,
    doc_id     TEXT NOT NULL,
    data       TEXT NOT NULL,
    period     TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, collection, doc_id)
  );

  CREATE INDEX IF NOT EXISTS idx_campaign_docs_period
    ON campaign_docs (tenant, collection, period);

  -- LOCAL_DB mode only: the generic per-tenant document twin behind the non-campaign
  -- stores that hold real user state — the keyword-research library (collection
  -- keywordLists), the saved winning-patterns library (patterns) and the social
  -- posts + inbox (social_posts / social_messages) — so those surfaces work fully
  -- offline instead of hard-500ing when Firestore is unreachable. One row per
  -- (tenant, collection, doc_id); data is the doc's JSON, mirroring a Firestore
  -- document under tenants/{tenant}/{collection}/{doc_id}. Unlike campaign_docs there
  -- is no columned field mirror: these collections order/query via
  -- json_extract(data, '$.field') over small per-tenant sets. Mirrors
  -- tenants/{tenant}/... ; see src/lib/tenant-docs/local.ts + backend.ts. Untouched
  -- when LOCAL_DB is off.
  CREATE TABLE IF NOT EXISTS tenant_docs (
    tenant     TEXT NOT NULL,
    collection TEXT NOT NULL,
    doc_id     TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (tenant, collection, doc_id)
  );

  -- LOCAL_DB mode only: user feedback submitted through the in-app / demo
  -- feedback dialog. One row per submission; the full record (message, optional
  -- reply email, source surface, path) is the JSON data blob. Mirrors the
  -- Firestore feedback collection. See src/lib/feedback/store.*.
  CREATE TABLE IF NOT EXISTS feedback (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- LOCAL_DB mode only: first-party, privacy-preserving analytics — aggregated
  -- DAILY counters only (metric key + UTC day + count), e.g. "view:/dashboard",
  -- "signup", "activation". Deliberately no IP, no user agent, no session, no
  -- per-user rows. Mirrors the Firestore analyticsDaily collection. See
  -- src/lib/analytics/store.*.
  CREATE TABLE IF NOT EXISTS analytics_daily (
    metric TEXT NOT NULL,
    day    TEXT NOT NULL,
    count  INTEGER NOT NULL,
    PRIMARY KEY (metric, day)
  );

  -- The public microsite registry (/m/{slug}). Deliberately keyed by SLUG, not by
  -- tenant: the slug is the global public address space, and making it the primary
  -- key is what makes "one tenant cannot take over another tenant's URL" a property
  -- of the table rather than of a query (ADR-0002 ownership is then a read-then-write
  -- in enableMicrosite over a single addressable row). The tenant column is the
  -- duplicated, INDEXED owner so the management card's by-tenant lookup is an indexed
  -- probe rather than a scan; data is the whole MicrositeConfig JSON. Mirrors the
  -- Firestore microsites/{slug} doc. See src/lib/microsite/store.*.
  CREATE TABLE IF NOT EXISTS microsites (
    slug       TEXT PRIMARY KEY,
    tenant     TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_microsites_tenant
    ON microsites (tenant);
`;

/** One ordered, versioned schema change. `up` performs it; `applied` reports
 *  whether its effect is ALREADY present on the handle. `applied` is what lets a
 *  database that predates the `schema_version` ledger (or one a concurrent
 *  process just migrated) be stamped without re-running the DDL — the runner
 *  probes the real shape via PRAGMA/sqlite_master instead of trusting a version
 *  it never wrote. Keep this list append-only and contiguous from 1. */
type Migration = {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
  applied: (db: DatabaseSync) => boolean;
};

/** The migration ledger. v1 is the whole base schema (all `CREATE … IF NOT
 *  EXISTS` above, still idempotent); v2..v6 are the additive columns that used to
 *  live in COLUMN_MIGRATIONS, re-expressed as ordered versions. A fresh database
 *  gets v1's CREATEs (which already include every later column), so v2..v6 detect
 *  their column as present and are stamped without a redundant ALTER.
 *
 *  Non-additive changes (a type change, rename, drop, PK change) have NO ALTER in
 *  SQLite — use the table-rebuild recipe in `rebuildTable` below as the `up` of a
 *  new version, with an `applied` probe of the post-rebuild shape. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "base schema (28 tables + projects/cron_runs/twin_archive/campaign_docs indexes)",
    up: (db) => db.exec(SCHEMA),
    // rate_limits is the always-on table; its presence means the base schema ran.
    applied: (db) => tableExists(db, "rate_limits"),
  },
  {
    version: 2,
    name: "warehouse_connection.config_json (generic ERP adapter config)",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN config_json TEXT"),
    applied: (db) => hasColumn(db, "warehouse_connection", "config_json"),
  },
  {
    version: 3,
    name: "warehouse_connection.last_error (sync-health tracking)",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN last_error TEXT"),
    applied: (db) => hasColumn(db, "warehouse_connection", "last_error"),
  },
  {
    version: 4,
    name: "warehouse_connection.last_error_at",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN last_error_at TEXT"),
    applied: (db) => hasColumn(db, "warehouse_connection", "last_error_at"),
  },
  {
    version: 5,
    name: "warehouse_connection.fail_count",
    up: (db) => db.exec("ALTER TABLE warehouse_connection ADD COLUMN fail_count INTEGER"),
    applied: (db) => hasColumn(db, "warehouse_connection", "fail_count"),
  },
  {
    version: 6,
    name: "projects.logo_url (client branding for reports)",
    up: (db) => db.exec("ALTER TABLE projects ADD COLUMN logo_url TEXT"),
    applied: (db) => hasColumn(db, "projects", "logo_url"),
  },
  {
    version: 7,
    name: "lead_imports (imported CRM leads → live funnel)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS lead_imports (
          project_id TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ),
    applied: (db) => tableExists(db, "lead_imports"),
  },
  {
    version: 8,
    name: "cron_sent_guard (claim-first double-run guard for scheduled crons)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS cron_sent_guard (
          tenant     TEXT NOT NULL,
          kind       TEXT NOT NULL,
          period     TEXT NOT NULL,
          claimed_at TEXT NOT NULL,
          PRIMARY KEY (tenant, kind)
        )`
      ),
    applied: (db) => tableExists(db, "cron_sent_guard"),
  },
  {
    version: 9,
    name: "cron_runs (durable per-invocation run records + retention/health)",
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS cron_runs (
          id          TEXT PRIMARY KEY,
          cron        TEXT NOT NULL,
          started_at  TEXT NOT NULL,
          finished_at TEXT NOT NULL,
          ok          INTEGER NOT NULL,
          data        TEXT NOT NULL
        )`
      );
      db.exec("CREATE INDEX IF NOT EXISTS idx_cron_runs_cron ON cron_runs (cron, finished_at)");
    },
    applied: (db) => tableExists(db, "cron_runs"),
  },
  {
    version: 10,
    name: "inventory_plan (persisted action plan + per-SKU stock-alert episodes)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS inventory_plan (
          project_id TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ),
    applied: (db) => tableExists(db, "inventory_plan"),
  },
  {
    version: 11,
    name: "finance_inputs (owner's margin scenarios + real numbers + channel margins)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS finance_inputs (
          project_id TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ),
    applied: (db) => tableExists(db, "finance_inputs"),
  },
  {
    version: 12,
    name: "twin_archive (terminal-draft history so audit records stop vanishing)",
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS twin_archive (
          project_id  TEXT NOT NULL,
          id          TEXT NOT NULL,
          channel     TEXT NOT NULL,
          status      TEXT NOT NULL,
          archived_at TEXT NOT NULL,
          data        TEXT NOT NULL,
          PRIMARY KEY (project_id, id)
        )`
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_twin_archive_project ON twin_archive (project_id, archived_at)"
      );
    },
    applied: (db) => tableExists(db, "twin_archive"),
  },
  {
    version: 13,
    name: "sklik_connection (per-user encrypted Sklik API token → live citizen sync)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS sklik_connection (
          user_id             TEXT PRIMARY KEY,
          token_enc           TEXT NOT NULL,
          connected_at        TEXT NOT NULL,
          money_verdict       TEXT,
          money_verdict_at    TEXT,
          halere_confirmed    INTEGER,
          halere_confirmed_at TEXT
        )`
      ),
    applied: (db) => tableExists(db, "sklik_connection"),
  },
  {
    version: 14,
    name: "project_goal (per-project monthly revenue goal + change history → real live-report target)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS project_goal (
          project_id TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ),
    applied: (db) => tableExists(db, "project_goal"),
  },
  {
    version: 15,
    name: "ai_response_cache (durable L2 for the /api/ai response cache → survives deploys)",
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS ai_response_cache (
          cache_key  TEXT PRIMARY KEY,
          tool       TEXT NOT NULL,
          data       TEXT NOT NULL,
          expires    INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        )`
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_ai_response_cache_tool ON ai_response_cache (tool, created_at)"
      );
    },
    applied: (db) => tableExists(db, "ai_response_cache"),
  },
  {
    version: 16,
    name: "campaign_docs (generic per-tenant doc twin → Výkon works fully offline)",
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS campaign_docs (
          tenant     TEXT NOT NULL,
          collection TEXT NOT NULL,
          doc_id     TEXT NOT NULL,
          data       TEXT NOT NULL,
          period     TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (tenant, collection, doc_id)
        )`
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_campaign_docs_period ON campaign_docs (tenant, collection, period)"
      );
    },
    applied: (db) => tableExists(db, "campaign_docs"),
  },
  {
    version: 17,
    name: "tenant_docs (generic doc twin → keywords/patterns/social work offline)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS tenant_docs (
          tenant     TEXT NOT NULL,
          collection TEXT NOT NULL,
          doc_id     TEXT NOT NULL,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (tenant, collection, doc_id)
        )`
      ),
    applied: (db) => tableExists(db, "tenant_docs"),
  },
  {
    version: 18,
    name: "feedback (in-app + demo feedback intake)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS feedback (
          id         TEXT PRIMARY KEY,
          data       TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`
      ),
    applied: (db) => tableExists(db, "feedback"),
  },
  {
    version: 19,
    name: "analytics_daily (first-party aggregated daily counters — no IP/UA/session)",
    up: (db) =>
      db.exec(
        `CREATE TABLE IF NOT EXISTS analytics_daily (
          metric TEXT NOT NULL,
          day    TEXT NOT NULL,
          count  INTEGER NOT NULL,
          PRIMARY KEY (metric, day)
        )`
      ),
    applied: (db) => tableExists(db, "analytics_daily"),
  },
  {
    version: 20,
    name: "backfill v1-only tables (organic_channels/diagnoses/recaps/annotations/lp_experiments/twin/onboarding) that pre-ledger dbs never received",
    // These seven were added to SCHEMA without a migration entry, so any db whose
    // ledger was already past v1 never created them (the UAT 2026-07-16 finding).
    // All share the per-project blob shape; DDL matches SCHEMA verbatim.
    up: (db) => {
      for (const t of [
        "organic_channels",
        "diagnoses",
        "recaps",
        "annotations",
        "lp_experiments",
        "twin",
        "onboarding",
      ]) {
        db.exec(
          `CREATE TABLE IF NOT EXISTS ${t} (
            project_id TEXT PRIMARY KEY,
            data       TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        );
      }
    },
    applied: (db) =>
      ["organic_channels", "diagnoses", "recaps", "annotations", "lp_experiments", "twin", "onboarding"].every(
        (t) => tableExists(db, t)
      ),
  },
  {
    version: 21,
    name: "lead_contacts/lead_events/lead_activities (the CRM lead entity layer — ROW-based, not a blob)",
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS lead_contacts (
          project_id TEXT NOT NULL,
          id         TEXT NOT NULL,
          stage      TEXT NOT NULL,
          email_key  TEXT,
          phone_key  TEXT,
          updated_at TEXT NOT NULL,
          data       TEXT NOT NULL,
          PRIMARY KEY (project_id, id)
        )`
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_lead_contacts_project ON lead_contacts (project_id, updated_at)"
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_lead_contacts_email ON lead_contacts (project_id, email_key)"
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_lead_contacts_phone ON lead_contacts (project_id, phone_key)"
      );
      db.exec(
        `CREATE TABLE IF NOT EXISTS lead_events (
          project_id  TEXT NOT NULL,
          dedup_key   TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          status      TEXT NOT NULL,
          data        TEXT NOT NULL,
          PRIMARY KEY (project_id, dedup_key)
        )`
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_lead_events_project ON lead_events (project_id, occurred_at)"
      );
      db.exec(
        `CREATE TABLE IF NOT EXISTS lead_activities (
          project_id TEXT NOT NULL,
          contact_id TEXT NOT NULL,
          id         TEXT NOT NULL,
          at         TEXT NOT NULL,
          kind       TEXT NOT NULL,
          data       TEXT NOT NULL,
          PRIMARY KEY (project_id, id)
        )`
      );
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_lead_activities_contact ON lead_activities (project_id, contact_id, at)"
      );
    },
    applied: (db) =>
      ["lead_contacts", "lead_events", "lead_activities"].every((t) => tableExists(db, t)),
  },
  {
    version: 22,
    name: "backfill idx_projects_user (SCHEMA-only index, never reached existing dbs)",
    // idx_projects_user was created in SCHEMA and nowhere else, so only databases
    // built by a fresh v1 ever had it. Every database stamped at v1 before this
    // migration is missing it and cannot gain it — projects/store.local.ts's
    // listProjects (SELECT ... WHERE user_id = ? ORDER BY created_at DESC) is the
    // hub's hot path, so those installs silently table-scan it. Additive and
    // idempotent: CREATE INDEX IF NOT EXISTS is a no-op where v1 already made it.
    up: (db) => {
      db.exec(
        "CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id, created_at)"
      );
    },
    applied: (db) => indexExists(db, "idx_projects_user"),
  },
  {
    version: 23,
    name: "microsites (public /m/{slug} registry — the Firestore-only tail of the microsite seam)",
    up: (db) => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS microsites (
          slug       TEXT PRIMARY KEY,
          tenant     TEXT NOT NULL,
          data       TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      );
      db.exec("CREATE INDEX IF NOT EXISTS idx_microsites_tenant ON microsites (tenant)");
    },
    applied: (db) => tableExists(db, "microsites") && indexExists(db, "idx_microsites_tenant"),
  },
];

const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** The ordered migration version numbers. Exported so a unit test can pin the
 *  MIGRATIONS header's contract — unique + contiguous from 1 — and fail the suite
 *  the moment a version is skipped or duplicated (nothing else asserts it). */
export const MIGRATION_VERSIONS: readonly number[] = MIGRATIONS.map((m) => m.version);

/** The `schema_version` ledger: one row per applied migration. */
const VERSION_TABLE = `CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`;

function currentVersion(db: DatabaseSync): number {
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as
    | { v: number | null }
    | undefined;
  return row?.v ?? 0;
}

/** Errors we tolerate when applying a migration: another process (parallel test
 *  workers, the cron, a concurrent request, an HMR re-apply) won the same race and
 *  already applied it. Anything else is a real schema bug and must surface. */
function isBenignMigrationError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
  return msg.includes("duplicate column name") || msg.includes("already exists");
}

/** Versioned migration runner. Idempotent and concurrency-tolerant:
 *   - the `schema_version` ledger is authoritative for versions it records;
 *   - a version not in the ledger whose effect is already present (a legacy
 *     pre-ledger db, or a racing process) is stamped WITHOUT re-running its DDL;
 *   - otherwise the DDL runs, and a benign "already applied" race is tolerated
 *     while any other failure throws LOUD (surfaced in dev, never swallowed).
 *  Returns the version the db is at afterward. Exported for unit tests. */
export function runMigrations(db: DatabaseSync): number {
  db.exec(VERSION_TABLE);
  const recorded = currentVersion(db);

  for (const m of MIGRATIONS) {
    if (m.version <= recorded) continue; // ledger already covers this version

    if (m.applied(db)) {
      // Effect present but unrecorded → legacy db (created before the ledger) or a
      // concurrent process just applied it. Stamp the ledger to match reality.
      stamp(db, m);
      continue;
    }

    try {
      m.up(db);
    } catch (err) {
      // A racing process may have applied it between our probe and our DDL.
      if (m.applied(db) || isBenignMigrationError(err)) {
        stamp(db, m);
        continue;
      }
      console.error(
        `[db] migration v${m.version} (${m.name}) FAILED — schema is inconsistent:`,
        err
      );
      throw err;
    }
    stamp(db, m);
  }

  return currentVersion(db);
}

function stamp(db: DatabaseSync, m: Migration): void {
  // OR IGNORE: a concurrent process may have stamped this version already.
  db.prepare(
    "INSERT OR IGNORE INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)"
  ).run(m.version, m.name, new Date().toISOString());
}

/** Non-additive schema change recipe. SQLite cannot ALTER a column's type, rename
 *  a PK, or (pre-3.35) drop a column, so the portable path is: create the new
 *  table, copy the data across, drop the old, rename the new into place. This
 *  helper runs that sequence as one transaction, following the safe order in
 *  https://www.sqlite.org/lang_altertable.html#otheralter (FK enforcement off for
 *  the swap, an integrity check before commit). It is the executable form of the
 *  recipe — a future non-additive `Migration.up` calls it, e.g.:
 *
 *    up: (db) => rebuildTable(db, {
 *      table: "projects",
 *      // must create `${table}__new`:
 *      newTableSql: `CREATE TABLE projects__new ( ... accent_color TEXT ... )`,
 *      copySql: `INSERT INTO projects__new (id, user_id, ...)
 *                SELECT id, user_id, ... FROM projects`,
 *      indexes: [`CREATE INDEX IF NOT EXISTS idx_projects_user ON projects (user_id, created_at)`],
 *    })
 */
export function rebuildTable(
  db: DatabaseSync,
  opts: { table: string; newTableSql: string; copySql: string; indexes?: string[] }
): void {
  const { table, newTableSql, copySql, indexes = [] } = opts;
  const tmp = `${table}__new`;
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec("BEGIN;");
    db.exec(newTableSql); // creates `${table}__new`
    db.exec(copySql); // INSERT INTO `${table}__new` ... SELECT ... FROM `${table}`
    db.exec(`DROP TABLE "${table}";`);
    db.exec(`ALTER TABLE "${tmp}" RENAME TO "${table}";`);
    for (const idx of indexes) db.exec(idx);
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(
        `foreign_key_check failed after rebuilding ${table}: ${JSON.stringify(violations)}`
      );
    }
    db.exec("COMMIT;");
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* no active transaction to roll back */
    }
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

/** Marker identifying the current schema definition; when it changes across an
 *  HMR (a schema edit adds a table/column/version), the runner re-runs even on a
 *  cached handle so a long-lived dev server self-heals without a restart. */
const SCHEMA_KEY = `${SCHEMA}\n--v${LATEST_VERSION}--\n${MIGRATIONS.map(
  (m) => `${m.version}:${m.name}`
).join("\n")}`;

export function getDb(): DatabaseSync {
  let db = g.__systedoDb;
  if (!db) {
    // The test runner spawns one process per test file, all sharing this file; it sets
    // SYSTEDO_DB_FILE to a per-process path so parallel suites don't contend on one db.
    const dbFile = process.env.SYSTEDO_DB_FILE || join(process.cwd(), ".data", "systedo.db");
    mkdirSync(dirname(dbFile), { recursive: true });
    db = new DatabaseSync(dbFile);
    db.exec("PRAGMA journal_mode = WAL;");
    // Wait briefly for a contended write instead of throwing SQLITE_BUSY at once.
    // node:sqlite is synchronous, and the cron sync, concurrent requests, the
    // rate-limit writer and the HMR schema re-apply can all touch the file at once;
    // 5s is generous for this low-write workload.
    db.exec("PRAGMA busy_timeout = 5000;");
    // Enforce declared foreign keys (off by default per-connection in SQLite). The
    // current 28-table schema declares none, so this is forward-looking hygiene; it
    // must be set here because rebuildTable toggles it and PRAGMAs are per-connection.
    db.exec("PRAGMA foreign_keys = ON;");
    g.__systedoDb = db;
  }

  // Run the versioned migrations whenever the schema definition changed since we
  // last applied it to this cached handle. runMigrations is itself idempotent, so
  // this is safe on an existing handle — it just brings the ledger and shape up to
  // date (new tables via v1's IF NOT EXISTS, new columns via later versions).
  if (g.__systedoSchema !== SCHEMA_KEY) {
    runMigrations(db);
    g.__systedoSchema = SCHEMA_KEY;
  }

  return db;
}
