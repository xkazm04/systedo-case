/** Publikum & výnos — audience funnel, segments and revenue. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import AudienceModule from "@/components/app/modules/AudienceModule";
import { SAMPLE_FUNNEL, SAMPLE_REVENUE, SAMPLE_SEGMENTS, SAMPLE_SUBSCRIBER_SOURCES } from "@/lib/audience/sample";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectModule(projectId, "publikum");
  return (
    <ModulePage moduleKey="publikum">
      <AudienceModule
        funnel={SAMPLE_FUNNEL}
        segments={SAMPLE_SEGMENTS}
        revenue={SAMPLE_REVENUE}
        subscriberSources={SAMPLE_SUBSCRIBER_SOURCES}
      />
    </ModulePage>
  );
}
