/** Nastavení — project settings (name, brand, type, the Google Ads link, delete),
 *  plus the per-user BYOM key management. The keys are ACCOUNT-WIDE (one set shared
 *  by every project), not per-project: an /ucet account module now exists, but the
 *  BYOM panel stays alongside the project's AI/model settings here where users manage
 *  models. ByomKeys states the scope in its own subtitle ("Platí pro celý účet…") so
 *  the placement doesn't mislead — saving/deleting a key in project A affects project
 *  B too.
 *
 *  The Ads-link panel makes the module registry's own blurb true ("napojení Google
 *  Ads"): it drives the existing guarded PATCH route, and the danger zone lands last
 *  because its delete now reports a partial cascade instead of hiding one. */
import { requireProjectModule } from "@/lib/projects/guard";
import { currentUserId } from "@/lib/session";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import { listConnectedAccounts } from "@/lib/campaigns/connection";
import type { LinkableAccount } from "@/lib/projects/ads-link";
import ModulePage from "@/components/app/ModulePage";
import ProjectSettings from "@/components/app/modules/ProjectSettings";
import ProjectAdsLink from "@/components/app/modules/ProjectAdsLink";
import ProjectDangerZone from "@/components/app/modules/ProjectDangerZone";
import ByomKeys from "@/components/app/modules/ByomKeys";
import ByomQualityOverview from "@/components/app/modules/ByomQualityOverview";
import ByomMatrix from "@/components/app/modules/ByomMatrix";
import WebhookEndpoints from "@/components/app/modules/WebhookEndpoints";
import ConversionUploadCard from "@/components/app/modules/ConversionUploadCard";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await requireProjectModule(projectId, "nastaveni");
  // Honest "živá data" signal resolved server-side (synced rows, not just linked).
  const live = await hasSyncedMetrics(project.id);
  // One USER-level read (the same one the projects hub does) so the link panel can
  // name the connected account and pre-flight the one-account-one-project rule.
  // Best-effort: a store hiccup degrades the picker to "no connected accounts"
  // rather than breaking the settings page.
  const userId = await currentUserId();
  const accounts: LinkableAccount[] = userId
    ? await listConnectedAccounts(userId)
        .then((r) => r.accounts.map((a) => ({ customerId: a.customerId, customerName: a.customerName })))
        .catch(() => [])
    : [];
  return (
    <ModulePage moduleKey="nastaveni">
      <ProjectSettings live={live} />
      <ProjectAdsLink accounts={accounts} />
      <ByomKeys />
      <ByomQualityOverview />
      <ByomMatrix />
      <WebhookEndpoints />
      <ConversionUploadCard />
      <ProjectDangerZone />
    </ModulePage>
  );
}
