/** Integrace / Integration status — connector-readiness board for the project
 *  (the "on-demand deployment" view). Reads real environment + project config
 *  server-side; account-level, so available for every project type.
 *
 *  PLATFORM rows are admin-only. Most of this board describes the signed-in user's
 *  own connections (Ads, AI, GBP, social, the project's warehouse feed) and belongs
 *  to whoever opens it. Three rows don't: `auth`, `cron` and `persistence` describe
 *  how the DEPLOYMENT is provisioned, and each one answers a question a tenant
 *  should never get for free — "auth: needs action" says this instance runs the
 *  DEV_AUTH bypass with no OAuth, and "cron: not configured" says CRON_SECRET is
 *  unset, i.e. the /api/cron/* endpoints (guarded by lib/cron-auth) are open. They
 *  are gated on the same ADMIN_EMAILS allowlist as the eval telemetry route, which
 *  fails closed: with no allowlist configured nobody sees them. */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import ModulePage from "@/components/app/ModulePage";
import IntegrationStatusModule from "@/components/app/modules/IntegrationStatusModule";
import { integrationStatus } from "@/lib/integrations/status";

/** Rows describing the platform's own provisioning rather than this project's
 *  connections. Deliberately an id list, not `category === "infra"`: `warehouse`
 *  shares that category but is a per-project probe (does THIS project have an ERP
 *  feed), so it stays visible to everyone. */
const PLATFORM_ONLY_ROWS = new Set(["auth", "cron", "persistence"]);

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "integrace");
  const [rows, session] = await Promise.all([
    integrationStatus(project, userId),
    currentSession(),
  ]);
  const admin = isAdminEmail(session?.user?.email);
  // Filtered before render, not hidden in CSS — the readiness summary counts the
  // rows it is given, so a non-admin's totals must not include rows they can't see.
  const visible = admin ? rows : rows.filter((r) => !PLATFORM_ONLY_ROWS.has(r.id));
  return (
    <ModulePage moduleKey="integrace">
      <IntegrationStatusModule rows={visible} projectId={projectId} />
    </ModulePage>
  );
}
