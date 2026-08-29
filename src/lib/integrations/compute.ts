/** Integration readiness — derive each connector's status from HEALTH signals, not
 *  from the mere existence of an env var. Pure & framework-free so it carries a
 *  test-unit; the server-only reader in status.ts feeds it real process.env plus the
 *  live per-user/per-project probes.
 *
 *  The rule this file now enforces: a row may only say "Připojeno" when something
 *  was actually observed to work FOR THIS USER. Credentials existing in the
 *  environment prove the platform is provisioned, never that the tenant is
 *  connected — the two used to be conflated (social read `META_APP_ID ||
 *  LINKEDIN_CLIENT_ID`, exactly the OR that lib/social/connection.ts warns against;
 *  BYOM accepted any validation stamp of unbounded age; Sklik read a deployment-wide
 *  env token while the connect card on the SAME screen showed a per-user record). */

export type IntStatus =
  | "connected" // observed working for this user/project
  | "action" // configured but needs one more step (e.g. link an account)
  | "missing" // credentials/config not set
  | "manual" // no live integration — a manual process today
  | "optional"; // off by choice / not required
// NOTE: "planned" was removed. No row produced it, yet it cost a status label, a
// tone, a hint and a summary tally in every locale. Vocabulary the board cannot
// emit is vocabulary that can only mislead a reader of this file.

export type IntCategory = "ads" | "ai" | "content" | "leads" | "reviews" | "reports" | "infra";

/** Every connector the board can render. A closed union (not `string`) so a new
 *  connector fails `typecheck` in the module's label table instead of rendering its
 *  raw slug to a user — the project-data/source.ts posture. */
export type IntItemId =
  | "google-ads"
  | "sklik"
  | "ai-llm"
  | "gbp"
  | "social"
  | "creative-images"
  | "microsite"
  | "email-reports"
  | "lighttrack"
  | "persistence"
  | "warehouse"
  | "webhooks"
  | "auth"
  | "cron"
  // WP W3-D: the project's PUBLIC intake addresses — where real inbound messages
  // (a Meta page webhook, a mail forwarder, a Google Business bridge) become pending
  // drafts in the Schránka. Opt-in, so none registered is "optional", not "missing".
  | "twin-inbound"
  // Lead connectors (src/lib/leads/connectors/registry.ts). Only CSV/manual ingest
  // exists today; the other four are registered-but-unbuilt and say so — a board
  // that quietly omitted them would read as "we have no lead ingestion", and one
  // that listed them as connectable would be a lie.
  | "leads-csv"
  | "leads-gsheet"
  | "leads-gmail"
  | "leads-whatsapp"
  | "leads-linkedin";

/** A connector-specific explanation the coarse status word cannot give — e.g.
 *  "connected, but only a DEMO account" or "validated, but 30+ days ago". Closed
 *  union for the same reason as IntItemId: the copy table must cover every one. */
export type IntDetail =
  | "ads-unlinked"
  | "social-demo-linkable"
  | "social-demo-only"
  | "social-no-accounts"
  | "byom-incident"
  | "byom-stale"
  | "byom-unvalidated"
  | "sklik-user-token"
  | "sklik-env-token"
  | "sklik-none"
  | "gbp-none"
  | "microsite-sample"
  | "microsite-off"
  | "leads-csv-active"
  | "leads-csv-idle"
  | "leads-planned"
  | "webhooks-none"
  | "webhooks-failing"
  | "inbound-none"
  | "inbound-live";

/** Where the row's action lives. A hint that names a step must be able to TAKE the
 *  reader there; module slugs are resolved against the current project by the UI. */
export type IntLink =
  | "home"
  | "socialni"
  | "mapa"
  | "branding"
  | "nastaveni"
  | "leads-connect"
  // WP W3-D: the Schránka is where an intake endpoint is minted and where the messages
  // it accepts arrive, so it is the one control that changes the twin-inbound row.
  | "schranka";

export interface IntegrationRow {
  id: IntItemId;
  category: IntCategory;
  status: IntStatus;
  /** connector-specific nuance; falls back to the generic per-status hint */
  detail?: IntDetail;
  /** the control that changes this row's status, when one exists in-app */
  link?: IntLink;
}

/** Health of the caller's BYOM key, judged by the SAME rules the BYOM settings UI
 *  applies (isByomValidationStale + incidents) so the two screens cannot disagree. */
export type ByomKeyHealth =
  | "none" // no key stored
  | "unvalidated" // stored, never successfully tested
  | "stale" // validated, but too long ago to still be evidence
  | "incident" // last test failed, or real generations have been failing
  | "ok"; // validated recently, no failures on record

/** Provisioning + health signals — what the environment, the user and the project
 *  actually have. Env-only flags are named `*Configured`/token-ish; everything that
 *  claims a user is connected comes from a live probe. */
export interface ProvisionInput {
  googleAdsToken: boolean;
  googleAdsCustomer: boolean;
  googleOAuth: boolean;
  gemini: boolean;
  resend: boolean;
  cron: boolean;
  firestore: boolean;
  localDb: boolean;
  devAuth: boolean;
  lighttrack: boolean;
  leonardo: boolean;
  /** the active project has a Google Ads customer linked (live: project field or a
   *  connected Ads account for the user) */
  adsLinked: boolean;
  /** live probe + the settings UI's own staleness/incident rules */
  byomKey: ByomKeyHealth;
  /** live probe: this project has a saved warehouse/ERP feed connection */
  warehouse: boolean;
  /** live probe: this project has an imported Google Business Profile section in
   *  its local-signals store (the live GBP import already ships) */
  gbpImported: boolean;
  /** live probe: the user has at least one linked social account whose OAuth token
   *  is stored (a REAL connection, per connection.ts's demo flag) */
  socialReal: boolean;
  /** live probe: the user has linked at least one DEMO social account — the compose
   *  → schedule → publish flow works, but nothing reaches a real network */
  socialDemo: boolean;
  /** env probe: at least one platform's OAuth app credentials exist, so a real
   *  connection is POSSIBLE. Never on its own evidence of a connection. */
  socialCredentials: boolean;
  /** live probe: this user has stored a per-user Sklik API token (the record the
   *  SklikConnectCard on the same screen reads) */
  sklikUserToken: boolean;
  /** env probe: the deployment-wide SKLIK_API_TOKEN fallback (connector.ts uses it
   *  when the user has no token of their own) */
  sklikEnvToken: boolean;
  /** live probe: this project's tenant has a published microsite */
  micrositeEnabled: boolean;
  /** the published microsite is still on the disclosed sample series (illustrative),
   *  i.e. it is live but not yet showing the client's own synced numbers */
  micrositeIllustrative: boolean;
  /** live probe: this project holds at least one real contact in the lead store,
   *  i.e. the CSV/manual ingest path has actually been used */
  leadContacts: boolean;
  /** live probe: how many ENABLED outbound webhook endpoints this project has
   *  registered. Optional so a caller that predates the row (and every existing
   *  test fixture) still compiles; absent degrades to 0 = "not set up". */
  webhooks?: number;
  /** live probe: at least one registered endpoint's LAST delivery failed. An
   *  endpoint that exists but is not receiving is worse than none — it reads as
   *  "alerts are wired up" while the alerts go nowhere — so it gets "action". */
  webhooksFailing?: boolean;
  /** live probe (WP W3-D): how many TWIN INTAKE endpoints this project has minted —
   *  the addresses a platform POSTs real inbound messages to. Optional so a caller
   *  that predates the row (and every existing test fixture) still compiles; absent
   *  degrades to 0 = "not set up", which is the honest reading of "we cannot see one". */
  inboundEndpoints?: number;
}

const CATEGORY_ORDER: IntCategory[] = ["ads", "ai", "content", "leads", "reviews", "reports", "infra"];

/** Lead ingestion. CSV/manual is a REAL path that ships today — it just has no
 *  credentials to hold, so an unused one reads "manual", not "missing". The other
 *  four are registered-but-unbuilt: `optional`, with their honest caveat one click
 *  away on the Napojení tab rather than hidden behind a "coming soon" word. */
function leadRows(p: ProvisionInput): IntegrationRow[] {
  const planned = (id: IntItemId): IntegrationRow => ({
    id,
    category: "leads",
    status: "optional",
    detail: "leads-planned",
    link: "leads-connect",
  });
  return [
    {
      id: "leads-csv",
      category: "leads",
      status: p.leadContacts ? "connected" : "manual",
      detail: p.leadContacts ? "leads-csv-active" : "leads-csv-idle",
      link: "leads-connect",
    },
    planned("leads-gsheet"),
    planned("leads-gmail"),
    planned("leads-whatsapp"),
    planned("leads-linkedin"),
  ];
}

/** The AI row: a server key OR a HEALTHY own key. A stale/erroring BYOM key is not
 *  a working integration — the settings page already says so; this must agree. */
function aiRow(p: ProvisionInput): IntegrationRow {
  if (p.gemini || p.byomKey === "ok") return { id: "ai-llm", category: "ai", status: "connected" };
  const detail =
    p.byomKey === "incident"
      ? "byom-incident"
      : p.byomKey === "stale"
        ? "byom-stale"
        : p.byomKey === "unvalidated"
          ? "byom-unvalidated"
          : undefined;
  return { id: "ai-llm", category: "ai", status: "action", link: "nastaveni", ...(detail ? { detail } : {}) };
}

/** Social: derived from LINKED ACCOUNTS, never from the app-credential OR. A demo
 *  connection and a real one are different facts and get different words. */
function socialRow(p: ProvisionInput): IntegrationRow {
  const base = { id: "social", category: "content" } as const;
  if (p.socialReal) return { ...base, status: "connected" };
  if (p.socialDemo) {
    return p.socialCredentials
      ? { ...base, status: "action", detail: "social-demo-linkable", link: "socialni" }
      : { ...base, status: "manual", detail: "social-demo-only", link: "socialni" };
  }
  return p.socialCredentials
    ? { ...base, status: "action", detail: "social-no-accounts", link: "socialni" }
    : { ...base, status: "missing", link: "socialni" };
}

/** Sklik: the SAME per-user record the connect card shows, with the deployment-wide
 *  env token as a documented fallback (connector.ts resolves it in that order).
 *  Honest limit: the stored connection carries `connectedAt` but NO last-sync
 *  timestamp, and ReportMetrics only has a "google-ads" source — so nothing in the
 *  system knows when a Sklik sync last succeeded. The row therefore claims a stored
 *  token and scheduled sync, and the hint says exactly that, rather than inventing
 *  a freshness verdict out of a connect timestamp. */
function sklikRow(p: ProvisionInput): IntegrationRow {
  const base = { id: "sklik", category: "ads" } as const;
  if (p.sklikUserToken) return { ...base, status: "connected", detail: "sklik-user-token" };
  if (p.sklikEnvToken) return { ...base, status: "connected", detail: "sklik-env-token" };
  return { ...base, status: "manual", detail: "sklik-none" };
}

/** Microsite: a shipped public surface that had no row at all. Opt-in, so absence
 *  is "optional"; published-but-illustrative is "action" (it is live, but on the
 *  disclosed sample series and deliberately not indexed). */
function micrositeRow(p: ProvisionInput): IntegrationRow {
  const base = { id: "microsite", category: "reports" } as const;
  if (!p.micrositeEnabled) return { ...base, status: "optional", detail: "microsite-off", link: "branding" };
  if (p.micrositeIllustrative)
    return { ...base, status: "action", detail: "microsite-sample", link: "branding" };
  return { ...base, status: "connected" };
}

/** Per-project outbound webhooks. Opt-in, so none registered is "optional", not
 *  "missing" — but a registered endpoint whose last delivery FAILED is "action":
 *  the owner believes their alerts are wired up while nothing is arriving, which is
 *  the one state this board exists to refuse to paper over. */
function webhooksRow(p: ProvisionInput): IntegrationRow {
  const base = { id: "webhooks", category: "reports", link: "nastaveni" } as const;
  if (!p.webhooks) return { ...base, status: "optional", detail: "webhooks-none" };
  if (p.webhooksFailing) return { ...base, status: "action", detail: "webhooks-failing" };
  return { id: "webhooks", category: "reports", status: "connected" };
}

/** The project's inbound intake (WP W3-D). Opt-in, so no endpoint is "optional", not
 *  "missing" — an operator who reviews everything by hand is not misconfigured. There is
 *  deliberately NO third state here: unlike a webhook, an intake endpoint has nothing
 *  that can quietly stop working from our side (no delivery we attempt, no last-status to
 *  go stale), so claiming a health verdict we cannot observe would be the exact
 *  papering-over this board exists to refuse. */
function twinInboundRow(p: ProvisionInput): IntegrationRow {
  const base = { id: "twin-inbound", category: "leads", link: "schranka" } as const;
  return p.inboundEndpoints
    ? { ...base, status: "connected", detail: "inbound-live" }
    : { ...base, status: "optional", detail: "inbound-none" };
}

/** Derive the readiness rows for the current environment + project. Pure. */
export function computeIntegrationRows(p: ProvisionInput): IntegrationRow[] {
  const adsPlatform = p.googleAdsToken && p.googleAdsCustomer && p.googleOAuth;
  const rows: IntegrationRow[] = [
    adsPlatform
      ? p.adsLinked
        ? { id: "google-ads", category: "ads", status: "connected" }
        : { id: "google-ads", category: "ads", status: "action", detail: "ads-unlinked", link: "home" }
      : { id: "google-ads", category: "ads", status: "missing" },
    sklikRow(p),
    aiRow(p),
    // GBP: the import already ships. Connected once this project has an imported GBP
    // section; otherwise "action" (do the import) — "planned" was never honest.
    p.gbpImported
      ? { id: "gbp", category: "reviews", status: "connected" }
      : { id: "gbp", category: "reviews", status: "action", detail: "gbp-none", link: "mapa" },
    socialRow(p),
    { id: "creative-images", category: "content", status: p.leonardo ? "connected" : "missing" },
    micrositeRow(p),
    { id: "email-reports", category: "reports", status: p.resend ? "connected" : "missing" },
    { id: "lighttrack", category: "reports", status: p.lighttrack ? "connected" : "optional" },
    {
      id: "persistence",
      category: "infra",
      status: p.firestore || p.localDb ? "connected" : "missing",
    },
    // Live probe: a saved product-feed / ERP connection for this project. Optional
    // (only commerce projects need it), so absence reads "optional", not "missing".
    { id: "warehouse", category: "infra", status: p.warehouse ? "connected" : "optional" },
    webhooksRow(p),
    {
      id: "auth",
      category: "infra",
      status: p.googleOAuth ? "connected" : p.devAuth ? "action" : "missing",
    },
    { id: "cron", category: "infra", status: p.cron ? "connected" : "missing" },
    twinInboundRow(p),
    ...leadRows(p),
  ];
  return rows.sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );
}

/** Count rows by status — drives the readiness summary. Pure. */
export function statusSummary(rows: IntegrationRow[]): Record<IntStatus, number> {
  const out: Record<IntStatus, number> = {
    connected: 0, action: 0, missing: 0, manual: 0, optional: 0,
  };
  for (const r of rows) out[r.status]++;
  return out;
}

/** Judge a BYOM key exactly as the settings UI does. Pure + shared so "Připojeno"
 *  on the integrations board and "Ověřeno dávno" on the settings page can never be
 *  said about the same key at the same moment. `stale` is supplied by the caller
 *  (it owns the clock via isByomValidationStale). */
export function byomKeyHealth(k: {
  present: boolean;
  lastValidatedAt?: string;
  lastError?: string;
  incidents?: number;
  stale: boolean;
}): ByomKeyHealth {
  if (!k.present) return "none";
  if (k.lastError || (k.incidents ?? 0) > 0) return "incident";
  if (!k.lastValidatedAt) return "unvalidated";
  return k.stale ? "stale" : "ok";
}

/** The best health across the user's keys — the board asks "can AI run?", and one
 *  healthy key is enough. Ordered worst→best so `Math.max` semantics are explicit. */
const HEALTH_RANK: Record<ByomKeyHealth, number> = {
  none: 0, incident: 1, unvalidated: 2, stale: 3, ok: 4,
};

export function bestByomHealth(healths: ByomKeyHealth[]): ByomKeyHealth {
  let best: ByomKeyHealth = "none";
  for (const h of healths) if (HEALTH_RANK[h] > HEALTH_RANK[best]) best = h;
  return best;
}
