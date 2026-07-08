/** Rychlá reakce — speed-to-lead inbox with AI-drafted replies + SLA. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import SpeedLeadModule from "@/components/app/modules/SpeedLeadModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { SAMPLE_LEADS, LOCAL_SAMPLE_LEADS } from "@/lib/speed-lead/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "rychla-reakce");
  // D2: a `local` provider sees booking-style enquiries, not B2B service leads.
  const leads = project.type === "local" ? LOCAL_SAMPLE_LEADS : SAMPLE_LEADS;
  return (
    <ModulePage moduleKey="rychla-reakce">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <SpeedLeadModule leads={leads} />
    </ModulePage>
  );
}
