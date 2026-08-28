/** Klíčová slova — keyword research + saved lists.
 *
 *  The module also carries the shared visibility plan: the query leg is where the
 *  path starts, and until now this page had no idea the other two legs existed
 *  (nothing here linked to the content engine or to Kanály zdarma, and nothing
 *  there linked back). The card is the SAME composed artifact /kanaly renders, so
 *  both ends of the path describe one plan. */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import KeywordsModule from "@/components/app/modules/KeywordsModule";
import VisibilityPlanCard from "@/components/app/visibility/VisibilityPlanCard";
import { resolveVisibilityPlan } from "@/lib/organic-channels/visibility-plan-resolve";


export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { projectId } = await params;
  const { seed } = await searchParams;
  const { project, userId } = await requireProjectModule(projectId, "klicova-slova");
  const visibilityPlan = await resolveVisibilityPlan(project, userId);
  return (
    <ModulePage moduleKey="klicova-slova">
      <div className="space-y-6">
        {visibilityPlan && (
          <VisibilityPlanCard
            plan={visibilityPlan}
            projectType={project.type}
            current="klicova-slova"
          />
        )}
        <KeywordsModule initialSeed={seed?.trim() || undefined} />
      </div>
    </ModulePage>
  );
}
