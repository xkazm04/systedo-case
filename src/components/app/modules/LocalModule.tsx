/** Lokální dominance — service×area coverage gaps + review reputation. Server. */
import { Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { Pin } from "@/components/icons";
import { fmtInt, fmtPct } from "@/lib/format";
import { gaps, localSummary, matrix } from "@/lib/local/compute";
import type { LocalTarget, RecentReview, ReviewProfile } from "@/lib/local/sample";
import LocalReviews from "@/components/app/modules/LocalReviews";

const star = (r: number) => `${r.toFixed(1).replace(".", ",")} ★`;

/** Map a local SERP rank to a Pill tone + label, matching the module's color language.
 *  1–3 = positive, 4–10 = warning (negative-soft), 11+ = coral, no page = neutral. */
function rankCell(t: LocalTarget | undefined): { tone: PillTone; label: string } {
  if (!t || !t.hasPage || t.rank === null) return { tone: "neutral", label: "chybí" };
  if (t.rank <= 3) return { tone: "positive", label: `#${t.rank}` };
  if (t.rank <= 10) return { tone: "negative", label: `#${t.rank}` };
  return { tone: "coral", label: `#${t.rank}` };
}

export default function LocalModule({
  targets,
  reviews,
  recentReviews,
}: {
  targets: LocalTarget[];
  reviews: ReviewProfile[];
  recentReviews: RecentReview[];
}) {
  const s = localSummary(targets, reviews);
  const gapRows = gaps(targets);
  const m = matrix(targets);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Pokrytí</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtPct(s.coverage)}</p>
          <p className="mt-1 text-xs text-muted">{s.withPage} z {s.total} kombinací</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Slabé pozice</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-coral-600">{fmtInt(s.coveredButWeak)}</p>
          <p className="mt-1 text-xs text-muted">stránka mimo TOP 10</p>
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Pin width={18} height={18} className="text-brand-accent" />
            Pozice podle služby a lokality
          </h3>
          <div className="flex items-center gap-2">
            <Pill tone="positive">TOP 3</Pill>
            <Pill tone="negative">4–10</Pill>
            <Pill tone="coral">11+</Pill>
            <Pill tone="neutral">chybí</Pill>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Služba</th>
                {m.areas.map((area) => (
                  <th key={area} className="px-4 py-3 text-center font-medium">{area}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.services.map((service) => (
                <tr key={service} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{service}</td>
                  {m.areas.map((area) => {
                    const target = m.cell.get(`${service}|${area}`);
                    const { tone, label } = rankCell(target);
                    return (
                      <td key={area} className="px-4 py-3 text-center">
                        {target ? <Pill tone={tone}>{label}</Pill> : <span className="text-muted">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Pozice ve výsledcích lokálního vyhledávání. Cíl: posunout slabé pozice (11+) a chybějící
          kombinace do TOP 3. Seam: rank tracker.
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

      <LocalReviews reviews={recentReviews} businessType="montáž a servis klimatizací a elektroinstalací" />
    </div>
  );
}
