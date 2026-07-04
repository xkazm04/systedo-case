/** Public demo of the "Datový report → chat" surface, inside the demo shell. The
 *  "Datový report" action on the demo Výkon dashboard lands here. Same live chat as
 *  the authed app, seeded with the illustrative Mionelo snapshot. */
import type { Metadata } from "next";
import DemoShell from "@/components/demo/DemoShell";
import ReportChat from "@/components/dashboard/ReportChat";
import { reportChips, reportFor } from "@/lib/report-chat";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { analysisPeriodLabel } from "@/lib/ai-types";
import { DEMO_PROJECTS, demoProjectFor } from "@/lib/demo/projects";
import { getServerLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "Datový report — asistent",
  robots: { index: false, follow: false },
};

export default async function DemoReportPage() {
  const locale = await getServerLocale();
  const period = "90d" as const;
  const project = demoProjectFor("eshop");
  // Phase-D: ground the demo report + chat on the demo e-shop's own dataset (the
  // route resolves the same public demo id server-side for the live chat turns).
  const data = getProjectDataset(project);
  return (
    <DemoShell activeKey="vykon" project={project} projects={DEMO_PROJECTS}>
      <ReportChat
        report={reportFor(period, data)}
        period={period}
        chips={reportChips(period, locale, data)}
        backHref="/dashboard?m=vykon"
        subtitle={analysisPeriodLabel(period, locale)}
        projectId={project.id}
      />
    </DemoShell>
  );
}
