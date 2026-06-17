/** Lokální dominance — service×area coverage gaps + review reputation. Server. */
import { Pill } from "@/components/ui";
import { Pin } from "@/components/icons";
import { fmtInt, fmtPct } from "@/lib/format";
import { gaps, localSummary } from "@/lib/local/compute";
import type { LocalTarget, ReviewProfile } from "@/lib/local/sample";

const star = (r: number) => `${r.toFixed(1).replace(".", ",")} ★`;

export default function LocalModule({
  targets,
  reviews,
}: {
  targets: LocalTarget[];
  reviews: ReviewProfile[];
}) {
  const s = localSummary(targets, reviews);
  const gapRows = gaps(targets);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Pokrytí</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtPct(s.coverage)}</p>
          <p className="mt-1 text-xs text-muted">{s.withPage} z {s.total} kombinací</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Objem v mezerách</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-coral-600">{fmtInt(s.gapVolume)}</p>
          <p className="mt-1 text-xs text-muted">měsíčně bez stránky</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Recenze</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtInt(s.reviews)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Hodnocení</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-positive">{star(s.avgRating)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Pin width={18} height={18} className="text-brand-accent" />
            Mezery v pokrytí
          </h3>
          <Pill tone="coral">{gapRows.length} chybí</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Lokalita</th>
                <th className="px-4 py-3 font-medium">Služba</th>
                <th className="px-4 py-3 text-right font-medium">Objem/měs.</th>
                <th className="px-4 py-3 font-medium">Stav</th>
              </tr>
            </thead>
            <tbody>
              {gapRows.map((t) => (
                <tr key={`${t.area}-${t.service}`} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{t.area}</td>
                  <td className="px-4 py-3 text-navy-700">{t.service}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(t.monthlyVolume)}</td>
                  <td className="px-4 py-3">
                    <Pill tone="coral">Chybí stránka</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Pro každou mezeru nasaďte lokální microsite (/m/…) + Google Business profil. Seam: rank
          tracker + reviews API + call tracking.
        </div>
      </div>

      <div>
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Reputace podle lokality</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {reviews.map((r) => (
            <div key={r.area} className="card flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-navy-800">{r.area}</p>
                <p className="text-xs text-muted">{fmtInt(r.reviews)} recenzí</p>
              </div>
              <span className="tnum text-sm font-semibold text-positive">{star(r.rating)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
