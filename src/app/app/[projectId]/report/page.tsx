/** Datový report → chat, re-hosted inside the project shell. The "Datový report"
 *  action on the Výkon dashboard lands here. Grounded (like the analysis tool) in
 *  the base performance snapshot; the chat streams follow-ups from the live LLM. */
import { requireProjectModule } from "@/lib/projects/guard";
import ReportChat from "@/components/dashboard/ReportChat";
import { validateReportPeriod } from "@/components/dashboard/report-chat-store";
import { reportChips, reportFor } from "@/lib/report-chat";
import { resolveReportDataset } from "@/lib/report-metrics/resolve";
import { analysisPeriodLabel } from "@/lib/ai-types";
import { getServerLocale } from "@/lib/i18n/locale";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const { projectId } = await params;
  // The report belongs to the performance module — gate on it (returns the project).
  const { project } = await requireProjectModule(projectId, "vykon");
  const locale = await getServerLocale();
  // The period follows the dashboard link; validated against the known keys (default 90d).
  const period = validateReportPeriod((await searchParams).period);
  // A1 seam: the report rail + its opening analysis run on the project's LIVE synced
  // Ads data when it has one, else the illustrative sample — the SAME resolution the
  // live chat uses server-side. `live` drives the honest source note; keeping the rail
  // on the resolved dataset means the note can never claim "živá data" over sample numbers.
  const resolved = await resolveReportDataset(project);
  const data = resolved.data;
  return (
    <ReportChat
      report={reportFor(period, data)}
      period={period}
      chips={reportChips(period, locale, data)}
      backHref={`/app/${projectId}/vykon`}
      subtitle={analysisPeriodLabel(period, locale)}
      projectId={project.id}
      storageBucket={project.id}
      live={resolved.live}
    />
  );
}
