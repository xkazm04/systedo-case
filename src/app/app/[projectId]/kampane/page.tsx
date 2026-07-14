/** Kampaně — the Google Ads campaign console, re-hosted inside the project shell.
 *  The header note adapts to the project type's channel focus. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CampaignsClient from "@/components/campaigns/CampaignsClient";
import { PROJECT_TYPE_META } from "@/lib/projects/types";
import { getT } from "@/lib/i18n/server";
import { getCostModel } from "@/lib/cost-model/store";
import { deriveBreakEven } from "@/lib/cost-model/compute";


const T = {
  cs: {
    desc: "Google Ads kampaně, triáž, AI vyhodnocení a přesuny rozpočtu. Zaměření pro tento typ projektu: {focus}.",
  },
  en: {
    desc: "Google Ads campaigns, triage, AI evaluation and budget shifts. Focus for this project type: {focus}.",
  },
} as const;

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "kampane");
  const focus = PROJECT_TYPE_META[project.type].channelFocus;
  const t = await getT(T);
  // Direction 2: when the tenant has entered a cost model, derive its margin-based
  // break-even ROAS (period-independent 1/margin) so the triage view can judge
  // campaigns against the margin they actually earn, not the blind portfolio
  // target. e-shop only (the model is an e-shop concept); null → note hidden.
  const costModel = project.type === "eshop" ? await getCostModel(project.id) : null;
  const breakEven = costModel ? deriveBreakEven(costModel) : null;
  return (
    <ModulePage
      moduleKey="kampane"
      description={focus ? t("desc", { focus }) : undefined}
    >
      <CampaignsClient breakEven={breakEven} />
    </ModulePage>
  );
}
