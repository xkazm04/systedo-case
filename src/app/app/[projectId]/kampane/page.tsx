/** Kampaně — the Google Ads campaign console, re-hosted inside the project shell.
 *  The header note adapts to the project type's channel focus. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CampaignsClient from "@/components/campaigns/CampaignsClient";
import { projectTypeMeta } from "@/lib/projects/types";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { getCostModel } from "@/lib/cost-model/store";
import { deriveBreakEven } from "@/lib/cost-model/compute";
import { getClientProfile } from "@/lib/campaigns/report-config";
import { resolveTenant } from "@/lib/campaigns/connector";
import { triageGoals } from "@/lib/campaigns/triage";
import { currentUserId } from "@/lib/session";


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
  // Use the locale-aware accessor so an en user reads channelFocusEn, not the raw
  // Czech channelFocus interpolated into the otherwise-translated description.
  const focus = projectTypeMeta(project.type, await getServerLocale()).channelFocus;
  const t = await getT(T);
  // Direction 2: when the tenant has entered a cost model, derive its margin-based
  // break-even ROAS (period-independent 1/margin) so the triage view can judge
  // campaigns against the margin they actually earn, not the blind portfolio
  // target. e-shop only (the model is an e-shop concept); null → note hidden.
  const costModel = project.type === "eshop" ? await getCostModel(project.id) : null;
  const breakEven = costModel ? deriveBreakEven(costModel) : null;
  // Direction 1: thread the persisted blended margin to the client so the BudgetMoves
  // preview scores donors by profit destruction (not revenue waste) and shows the
  // projected profit with the margin stated. Null → the margin-blind revenue scoring.
  const marginPct = costModel?.grossMarginPct ?? null;
  // Triage learns the tenant's goals: resolve the agreed pnoGoal (→ target ROAS/PNO)
  // once here and thread it, together with the margin-based break-even ROAS, so the
  // table badges, cell tones and the banner all judge against the SAME per-tenant
  // goal instead of the module constants. Default/unseeded profile (pnoGoal = the
  // paid-portfolio target) → byte-identical to the module target.
  const userId = await currentUserId();
  const tenant = await resolveTenant(userId, project.id);
  const { pnoGoal } = await getClientProfile(tenant);
  const goals = triageGoals(pnoGoal, breakEven?.grossRoas);
  return (
    <ModulePage
      moduleKey="kampane"
      description={focus ? t("desc", { focus }) : undefined}
    >
      <CampaignsClient breakEven={breakEven} marginPct={marginPct} goals={goals} />
    </ModulePage>
  );
}
