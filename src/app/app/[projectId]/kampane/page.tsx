/** Kampaně — the Google Ads campaign console, re-hosted inside the project shell.
 *  The header note adapts to the project type's channel focus. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CampaignsClient from "@/components/campaigns/CampaignsClient";
import { PROJECT_TYPE_META } from "@/lib/projects/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "kampane");
  const focus = PROJECT_TYPE_META[project.type].channelFocus;
  return (
    <ModulePage
      moduleKey="kampane"
      description={
        focus
          ? `Google Ads kampaně, triáž, AI vyhodnocení a přesuny rozpočtu. Zaměření pro tento typ projektu: ${focus}.`
          : undefined
      }
    >
      <CampaignsClient />
    </ModulePage>
  );
}
