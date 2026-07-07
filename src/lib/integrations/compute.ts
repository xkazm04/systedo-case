/** Integration readiness — derive each connector's status from provisioning
 *  flags (env presence + per-project links). Pure & framework-free so it carries
 *  a test-unit; the server-only reader in status.ts feeds it real process.env. */

export type IntStatus =
  | "connected" // configured and usable
  | "action" // configured but needs one more step (e.g. link an account)
  | "missing" // credentials/config not set
  | "manual" // no live integration — a manual process today
  | "planned" // on the roadmap, not wired yet
  | "optional"; // off by choice / not required

export type IntCategory = "ads" | "ai" | "content" | "reviews" | "reports" | "infra";

export interface IntegrationRow {
  id: string;
  category: IntCategory;
  status: IntStatus;
}

/** Provisioning signals — what the environment + project actually have. */
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
  social: boolean;
  leonardo: boolean;
  /** the active project has a Google Ads customer linked */
  adsLinked: boolean;
}

const CATEGORY_ORDER: IntCategory[] = ["ads", "ai", "content", "reviews", "reports", "infra"];

/** Derive the readiness rows for the current environment + project. Pure. */
export function computeIntegrationRows(p: ProvisionInput): IntegrationRow[] {
  const adsPlatform = p.googleAdsToken && p.googleAdsCustomer && p.googleOAuth;
  const rows: IntegrationRow[] = [
    {
      id: "google-ads",
      category: "ads",
      status: adsPlatform ? (p.adsLinked ? "connected" : "action") : "missing",
    },
    { id: "sklik", category: "ads", status: "manual" },
    { id: "ai-llm", category: "ai", status: p.gemini ? "connected" : "action" },
    { id: "gbp", category: "reviews", status: "planned" },
    { id: "social", category: "content", status: p.social ? "connected" : "missing" },
    { id: "creative-images", category: "content", status: p.leonardo ? "connected" : "missing" },
    { id: "email-reports", category: "reports", status: p.resend ? "connected" : "missing" },
    { id: "lighttrack", category: "reports", status: p.lighttrack ? "connected" : "optional" },
    {
      id: "persistence",
      category: "infra",
      status: p.firestore || p.localDb ? "connected" : "missing",
    },
    {
      id: "auth",
      category: "infra",
      status: p.googleOAuth ? "connected" : p.devAuth ? "action" : "missing",
    },
    { id: "cron", category: "infra", status: p.cron ? "connected" : "missing" },
  ];
  return rows.sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  );
}

/** Count rows by status — drives the readiness summary. Pure. */
export function statusSummary(rows: IntegrationRow[]): Record<IntStatus, number> {
  const out: Record<IntStatus, number> = {
    connected: 0, action: 0, missing: 0, manual: 0, planned: 0, optional: 0,
  };
  for (const r of rows) out[r.status]++;
  return out;
}
