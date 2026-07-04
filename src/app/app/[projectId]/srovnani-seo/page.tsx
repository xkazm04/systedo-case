/** Srovnání & SEO — high-intent comparison-query opportunities, each tied to the
 *  project's real organic conversion economics (so ranking reflects expected
 *  results, not just search volume). */
import { requireProjectModule } from "@/lib/projects/guard";
import ModulePage from "@/components/app/ModulePage";
import CompareSeoModule from "@/components/app/modules/CompareSeoModule";
import SampleDataNote from "@/components/app/SampleDataNote";
import { SAMPLE_QUERIES } from "@/lib/seo-compare/sample";
import { seoChannelFrom } from "@/lib/seo-compare/compute";
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
  return (
    <ModulePage moduleKey="srovnani-seo">
      <div className="mb-5">
        <SampleDataNote />
      </div>
      <CompareSeoModule queries={SAMPLE_QUERIES} seoChannel={seoChannel} />
    </ModulePage>
  );
}
