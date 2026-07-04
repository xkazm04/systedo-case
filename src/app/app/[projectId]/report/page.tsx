/** Datový report → chat, re-hosted inside the project shell. The "Datový report"
 *  action on the Výkon dashboard lands here. Grounded (like the analysis tool) in
 *  the base performance snapshot; the chat streams follow-ups from the live LLM. */
import { requireProjectModule } from "@/lib/projects/guard";
import ReportChat from "@/components/dashboard/ReportChat";
import { reportChips, reportFor } from "@/lib/report-chat";
import { analysisPeriodLabel } from "@/lib/ai-types";
import { getServerLocale } from "@/lib/i18n/locale";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  // The report belongs to the performance module — gate on it.
  await requireProjectModule(projectId, "vykon");
  const locale = await getServerLocale();
  const period = "90d" as const;
  return (
    <ReportChat
      report={reportFor(period)}
      period={period}
      chips={reportChips(period, locale)}
      backHref={`/app/${projectId}/vykon`}
      subtitle={analysisPeriodLabel(period, locale)}
    />
  );
}
