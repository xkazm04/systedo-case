/** Public demo of the "Datový report → chat" surface, inside the demo shell. The
 *  "Datový report" action on the demo Výkon dashboard lands here. Same live chat as
 *  the authed app, seeded with the illustrative Mionelo snapshot. */
import type { Metadata } from "next";
import DemoShell from "@/components/demo/DemoShell";
import ReportChat from "@/components/dashboard/ReportChat";
import { validateReportPeriod } from "@/components/dashboard/report-chat-store";
import { reportChips, reportFor } from "@/lib/report-chat";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { analysisPeriodLabel } from "@/lib/ai-types";
import { DEMO_PROJECTS, demoProjectFor } from "@/lib/demo/projects";
import { getServerLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "Datový report — asistent",
  robots: { index: false, follow: false },
};

export default async function DemoReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const locale = await getServerLocale();
  // The period follows the demo dashboard link; validated against the known keys (default 90d).
  const period = validateReportPeriod((await searchParams).period);
  const project = demoProjectFor("eshop");
  // Phase-D: ground the demo report + chat on the demo e-shop's own dataset (the
  // route resolves the same public demo id server-side for the live chat turns). The
  // demo never has synced Ads data, so the source note is always illustrative.
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
        storageBucket="demo"
        live={false}
      />
    </DemoShell>
  );
}
