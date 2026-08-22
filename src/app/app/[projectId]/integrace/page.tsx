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
import Link from "next/link";
import { requireProjectModule } from "@/lib/projects/guard";
import { currentSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import ModulePage from "@/components/app/ModulePage";
import IntegrationStatusModule from "@/components/app/modules/IntegrationStatusModule";
import LeadConnectors from "@/components/app/modules/LeadConnectors";
import { integrationStatus } from "@/lib/integrations/status";
import { leadConnectorMetas } from "@/lib/leads/connectors/registry";
import { getServerLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: { board: "Přehled", connect: "Napojení", tabs: "Karty modulu" },
  en: { board: "Overview", connect: "Connections", tabs: "Module tabs" },
} as const;

/** Rows describing the platform's own provisioning rather than this project's
 *  connections. Deliberately an id list, not `category === "infra"`: `warehouse`
 *  shares that category but is a per-project probe (does THIS project have an ERP
 *  feed), so it stays visible to everyone. */
const PLATFORM_ONLY_ROWS = new Set(["auth", "cron", "persistence"]);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "integrace");
  const rawTab = (await searchParams).tab;
  const tab = (Array.isArray(rawTab) ? rawTab[0] : rawTab) === "napojeni" ? "napojeni" : "prehled";

  const [rows, session, locale, t] = await Promise.all([
    integrationStatus(project, userId),
    currentSession(),
    getServerLocale(),
    getT(T),
  ]);
  const admin = isAdminEmail(session?.user?.email);
  // Filtered before render, not hidden in CSS — the readiness summary counts the
  // rows it is given, so a non-admin's totals must not include rows they can't see.
  const visible = admin ? rows : rows.filter((r) => !PLATFORM_ONLY_ROWS.has(r.id));

  const base = `/app/${projectId}/integrace`;
  const tabs: [string, string, string][] = [
    ["prehled", t("board"), base],
    ["napojeni", t("connect"), `${base}?tab=napojeni`],
  ];

  return (
    <ModulePage moduleKey="integrace">
      {/* Server-rendered tab strip: two real URLs, so a deep link from a readiness
          row ("not connected → connect it") lands on the right half directly. */}
      <nav aria-label={t("tabs")} className="mb-6 flex gap-5 border-b border-line">
        {tabs.map(([key, label, href]) => (
          <Link
            key={key}
            href={href}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-brand-500 text-brand-accent"
                : "border-transparent text-muted hover:text-navy-700"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "napojeni" ? (
        <LeadConnectors projectId={projectId} metas={leadConnectorMetas()} locale={locale} />
      ) : (
        <IntegrationStatusModule rows={visible} projectId={projectId} />
      )}
    </ModulePage>
  );
}
