/** Srovnání & SEO — high-intent comparison-query opportunities. Server component. */
import Link from "next/link";
import { Pill, type PillTone } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { fmtInt } from "@/lib/format";
import { INTENT_LABELS, scoreQueries, type Opportunity } from "@/lib/seo-compare/compute";
import type { CompareQuery } from "@/lib/seo-compare/sample";

const OPP_META: Record<Opportunity, { tone: PillTone; label: string }> = {
  high: { tone: "positive", label: "Vysoká" },
  medium: { tone: "coral", label: "Střední" },
  low: { tone: "neutral", label: "Nízká" },
};

export default function CompareSeoModule({
  queries,
  projectId,
}: {
  queries: CompareQuery[];
  projectId: string;
}) {
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
        <Link
          href={`/app/${projectId}/obsah`}
          className="card group flex items-center justify-between gap-3 p-5 transition-colors hover:border-brand-300"
        >
          <span>
            <span className="block text-sm font-semibold text-navy-800">Vytvořit srovnávací obsah</span>
            <span className="block text-xs text-muted">Předat dotaz do AI briefu</span>
          </span>
          <ArrowRight width={18} height={18} className="text-brand-accent transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Dotaz</th>
                <th className="px-4 py-3 font-medium">Záměr</th>
                <th className="px-4 py-3 text-right font-medium">Objem</th>
                <th className="px-4 py-3 text-right font-medium">Obtížnost</th>
                <th className="px-4 py-3 text-right font-medium">Pozice</th>
                <th className="px-4 py-3 font-medium">Příležitost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = OPP_META[r.opportunity];
                return (
                  <tr key={r.query} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-800">{r.query}</td>
                    <td className="px-4 py-3">
                      <Pill tone="brand">{INTENT_LABELS[r.intent]}</Pill>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(r.volume)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{r.difficulty}</td>
                    <td className="tnum px-4 py-3 text-right text-muted">{r.rank ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Skóre = objem × váha záměru × prostor v SERP ÷ obtížnost. Bílá místa (kde zatím nerankujete)
          mají přednost.
        </div>
      </div>
    </div>
  );
}
