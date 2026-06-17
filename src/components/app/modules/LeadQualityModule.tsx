/** Kvalita leadů — cost-per-qualified-lead view for a lead-gen project. Server. */
import { Pill, type PillTone } from "@/components/ui";
import { Bulb } from "@/components/icons";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import { summarize, withMetrics } from "@/lib/lead-quality/compute";
import type { LeadSource } from "@/lib/lead-quality/sample";

function scoreTone(score: number): PillTone {
  if (score >= 60) return "positive";
  if (score >= 40) return "coral";
  return "negative";
}

export default function LeadQualityModule({ sources }: { sources: LeadSource[] }) {
  const rows = sources.map(withMetrics).sort((a, b) => b.qualityScore - a.qualityScore);
  const s = summarize(sources);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Leady</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtInt(s.leads)}</p>
          <p className="mt-1 text-xs text-muted">z toho {fmtInt(s.qualified)} kvalifikovaných</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">CPL</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtCZK(s.blendedCpl)}</p>
          <p className="mt-1 text-xs text-muted">cena za lead</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">CPQL</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-brand-accent">{fmtCZK(s.blendedCpql)}</p>
          <p className="mt-1 text-xs text-muted">cena za kvalifikovaný lead</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Junk zdroje</p>
          <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${s.junkCount > 0 ? "text-negative" : "text-positive"}`}>
            {s.junkCount}
          </p>
          <p className="mt-1 text-xs text-muted">levné, ale nekvalitní</p>
        </div>
      </div>

      {s.junkCount > 0 && (
        <div className="flex items-start gap-3 rounded-card border border-coral-400/30 bg-coral-soft px-4 py-3.5">
          <Bulb width={18} height={18} className="mt-0.5 shrink-0 text-coral-600" />
          <p className="text-sm leading-relaxed text-navy-700">
            Některé zdroje mají nízké CPL, ale po kvalifikaci jsou drahé (vysoké CPQL). Optimalizujte
            bidding na <strong>kvalifikované leady a tržby</strong>, ne na počet formulářů.
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Zdroj</th>
                <th className="px-4 py-3 text-right font-medium">Leady</th>
                <th className="px-4 py-3 text-right font-medium">CPL</th>
                <th className="px-4 py-3 text-right font-medium">Kvalifik.</th>
                <th className="px-4 py-3 text-right font-medium">CPQL</th>
                <th className="px-4 py-3 text-right font-medium">Win rate</th>
                <th className="px-4 py-3 text-right font-medium">ROI</th>
                <th className="px-4 py-3 font-medium">Kvalita</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className={`border-b border-line/70 last:border-0 ${r.junk ? "bg-coral-soft/40" : ""}`}>
                  <td className="px-5 py-3 font-medium text-navy-800">{r.source}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(r.leads)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{r.spend > 0 ? fmtCZK(r.cpl) : "—"}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(r.qualRate)}</td>
                  <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{r.spend > 0 ? fmtCZK(r.cpql) : "—"}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(r.winRate)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">
                    {Number.isFinite(r.roi) ? fmtMultiple(r.roi) : "∞"}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={scoreTone(r.qualityScore)}>{r.qualityScore}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Skóre kvality = 60 % míra kvalifikace + 40 % win rate. Seam: napojit CRM (lead → kvalifikovaný
          → uzavřený + hodnota).
        </div>
      </div>
    </div>
  );
}
