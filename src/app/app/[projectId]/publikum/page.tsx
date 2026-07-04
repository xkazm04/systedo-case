/** Publikum & výnos — audience funnel, segments and revenue. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import AudienceModule from "@/components/app/modules/AudienceModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { audienceForProject } from "@/lib/audience/sample";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "publikum");
  const audience = audienceForProject(project);
  return (
    <ModulePage moduleKey="publikum">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <AudienceModule
        funnel={audience.funnel}
        segments={audience.segments}
        revenue={audience.revenue}
        subscriberSources={audience.subscriberSources}
        subscriberHistory={audience.subscriberHistory}
        rpmHistory={audience.rpmHistory}
        goals={audience.goals}
      />
    </ModulePage>
  );
}
