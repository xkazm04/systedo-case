/** Obsahový engine — the unified content module (Tvorba): topic clusters +
 *  decaying content as view-first tables, with the AI brief → article-draft
 *  workspace and cross-module hand-offs opened in modals.
 *
 *  It also carries the shared visibility plan — the SAME composed artifact /kanaly
 *  and /klicova-slova render. This is the content leg of that path, and it was the
 *  only one of the three that showed neither the plan nor a way back to the other
 *  two (UAT 2026-08-28 kanaly-l1, finding K02). resolveVisibilityPlan resolves its
 *  own channel leg through the same grounding builder, so all three pages describe
 *  one plan or none. */
import { requireProjectModule } from "@/lib/projects/guard";
import { hasSyncedMetrics } from "@/lib/report-metrics/store";
import ModulePage from "@/components/app/ModulePage";
import ContentEngine from "@/components/app/modules/ContentEngine";
import VisibilityPlanCard from "@/components/app/visibility/VisibilityPlanCard";
import { resolveContentDataset } from "@/lib/content-engine/resolve";
import { resolveVisibilityPlan } from "@/lib/organic-channels/visibility-plan-resolve";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, userId } = await requireProjectModule(projectId, "obsahovy-engine");
  // The Ads sync signal is read honestly — but it is NOT the label. The resolver
  // decides what the module renders and therefore what it may claim: clusters and
  // decay are fixture-derived today, so a synced project is still labelled sample
  // (and told why, via the caveat chip). See lib/content-engine/resolve.ts.
  const data = resolveContentDataset(project, { adsSynced: await hasSyncedMetrics(project.id) });
  // Null when the project type does not have all three legs of the path.
  const visibilityPlan = await resolveVisibilityPlan(project, userId);
  return (
    // Page-level honesty signal via the shared ModulePage `sample` slot, matching every
    // sibling module (distribuce, obsah-plan, experimenty-lp, …). The in-module
    // Živá/Ukázková pill stays for per-widget granularity; this is the single page marker.
    <ModulePage moduleKey="obsahovy-engine" sample={!data.live}>
      <div className="space-y-6">
        {visibilityPlan && (
          <VisibilityPlanCard
            plan={visibilityPlan}
            projectType={project.type}
            current="obsahovy-engine"
          />
        )}
        <ContentEngine
          clusters={data.clusters}
          decay={data.decay}
          derivedFrom={data.derivedFrom}
          adsSynced={data.adsSynced}
        />
      </div>
    </ModulePage>
  );
}
