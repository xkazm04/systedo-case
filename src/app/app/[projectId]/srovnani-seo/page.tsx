/** Srovnání & SEO — high-intent comparison-query opportunities, each tied to the
 *  project's real organic conversion economics (so ranking reflects expected
 *  results, not just search volume). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CompareSeoModule from "@/components/app/modules/CompareSeoModule";
import { SAMPLE_QUERIES } from "@/lib/seo-compare/sample";
import { seoChannelFrom } from "@/lib/seo-compare/compute";
import { comparisonQueriesFromCatalog } from "@/lib/seo-compare/catalog";
import { loadPlansFor } from "@/lib/catalog/load";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { channelRows, totalsOf } from "@/lib/metrics";


export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireProjectModule(projectId, "srovnani-seo");
  // Real per-channel economics over the last 90 days → the organic/SEO channel's
  // conversion rate + AOV, which grounds each query's acquisition estimate.
  const data = getProjectDataset(project);
  const rows = channelRows(data.channels, totalsOf(data.daily.slice(-90)));
  const seoChannel = seoChannelFrom(rows);
  // Comparison queries generated from the project's plan offerings + their named
  // competitors; fall back to the sample set if the catalog has no plans.
  const generated = comparisonQueriesFromCatalog(project.name, await loadPlansFor(project));
  const queries = generated.length > 0 ? generated : SAMPLE_QUERIES;
  return (
    <ModulePage moduleKey="srovnani-seo" sample>
      <CompareSeoModule queries={queries} seoChannel={seoChannel} />
    </ModulePage>
  );
}
