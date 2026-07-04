/** Rychlá reakce — speed-to-lead inbox with AI-drafted replies + SLA. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SpeedLeadModule from "@/components/app/modules/SpeedLeadModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { SAMPLE_LEADS } from "@/lib/speed-lead/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "rychla-reakce");
  return (
    <ModulePage moduleKey="rychla-reakce">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <SpeedLeadModule leads={SAMPLE_LEADS} />
    </ModulePage>
  );
}
