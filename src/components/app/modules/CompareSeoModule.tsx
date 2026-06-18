/** Srovnání & SEO — high-intent comparison-query opportunities. Server component:
 *  scores the queries and renders the summary cards; the scored table (with its
 *  per-row brief-seed handoff into Obsah) lives in the CompareSeoTable client child. */
import { fmtInt } from "@/lib/format";
import { scoreQueries } from "@/lib/seo-compare/compute";
import type { CompareQuery } from "@/lib/seo-compare/sample";
import CompareSeoTable from "./CompareSeoTable";

export default function CompareSeoModule({ queries }: { queries: CompareQuery[] }) {
  const rows = scoreQueries(queries);
  const high = rows.filter((r) => r.opportunity === "high");
  const totalVolume = rows.reduce((a, r) => a + r.volume, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Vysoká příležitost</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{high.length}</p>
          <p className="mt-1 text-xs text-muted">z {rows.length} dotazů</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Měsíční objem</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtInt(totalVolume)}</p>
        </div>
        <div className="card flex flex-col justify-center p-5">
          <p className="text-sm font-semibold text-navy-800">Vytvořit srovnávací obsah</p>
          <p className="mt-1 text-xs text-muted">
            Vyberte dotaz v tabulce a předejte ho s objemem a záměrem do AI briefu.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <CompareSeoTable rows={rows} />
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Skóre = objem × váha záměru × prostor v SERP ÷ obtížnost. Bílá místa (kde zatím nerankujete)
          mají přednost.
        </div>
      </div>
    </div>
  );
}
