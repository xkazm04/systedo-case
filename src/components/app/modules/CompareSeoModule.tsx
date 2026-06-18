/** Srovnání & SEO — high-intent comparison-query opportunities. Server shell:
 *  it hands the RAW queries and the default scoring weights to the client child.
 *  Scoring now runs on the client (CompareSeoTable) so the "Ladění skóre" panel
 *  can re-rank — and recompute the summary cards — live, and the per-row
 *  brief-seed handoff into Obsah still lives there. */
import { DEFAULT_SCORE_WEIGHTS } from "@/lib/seo-compare/compute";
import type { CompareQuery } from "@/lib/seo-compare/sample";
import CompareSeoTable from "./CompareSeoTable";

export default function CompareSeoModule({ queries }: { queries: CompareQuery[] }) {
  return (
    <div className="space-y-6">
      <CompareSeoTable queries={queries} defaultWeights={DEFAULT_SCORE_WEIGHTS} />
    </div>
  );
}
