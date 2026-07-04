/** Public demo of the "Datový report → chat" surface, inside the demo shell. The
 *  "Datový report" action on the demo Výkon dashboard lands here. Same live chat as
 *  the authed app, seeded with the illustrative Mionelo snapshot. */
import type { Metadata } from "next";
import DemoShell from "@/components/demo/DemoShell";
import ReportChat from "@/components/dashboard/ReportChat";
import { reportChips, reportFor } from "@/lib/report-chat";
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
  return (
    <DemoShell activeKey="vykon" project={project} projects={DEMO_PROJECTS}>
      <ReportChat
        report={reportFor(period)}
        period={period}
        chips={reportChips(period, locale)}
        backHref="/dashboard?m=vykon"
        subtitle={analysisPeriodLabel(period, locale)}
      />
    </DemoShell>
  );
}
