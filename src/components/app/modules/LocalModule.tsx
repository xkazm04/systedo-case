/** Lokální dominance — service×area coverage gaps + review reputation. Server. */
import { Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { Pin } from "@/components/icons";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { gaps, localSummary, matrix } from "@/lib/local/compute";
import type { LocalTarget, RecentReview, ReviewProfile } from "@/lib/local/sample";
import LocalReviews from "@/components/app/modules/LocalReviews";

const T = {
  cs: {
    coverage: "Pokrytí",
    coverageOf: "{with} z {total} kombinací",
    weakPositions: "Slabé pozice",
    weakPositionsNote: "stránka mimo TOP 10",
    gapVolume: "Objem v mezerách",
    gapVolumeNote: "měsíčně bez stránky",
    reviews: "Recenze",
    rating: "Hodnocení",
    rankMissing: "chybí",
    positionTitle: "Pozice podle služby a lokality",
    legendTop3: "TOP 3",
    legend4to10: "4–10",
    legend11plus: "11+",
    legendMissing: "chybí",
    serviceCol: "Služba",
    positionNote: "Pozice ve výsledcích lokálního vyhledávání. Cíl: posunout slabé pozice (11+) a chybějící kombinace do TOP 3. Seam: rank tracker.",
    gapsTitle: "Mezery v pokrytí",
    gapCount: "{n} chybí",
    localityCol: "Lokalita",
    serviceColGap: "Služba",
    volumeCol: "Objem/měs.",
    statusCol: "Stav",
    missingPage: "Chybí stránka",
    gapsNote: "Pro každou mezeru nasaďte lokální microsite (/m/…) + Google Business profil. Seam: rank tracker + reviews API + call tracking.",
    reputationTitle: "Reputace podle lokality",
    reviewCount: "{n} recenzí",
  },
  en: {
    coverage: "Coverage",
    coverageOf: "{with} of {total} combinations",
    weakPositions: "Weak positions",
    weakPositionsNote: "page outside TOP 10",
    gapVolume: "Gap volume",
    gapVolumeNote: "monthly without a page",
    reviews: "Reviews",
    rating: "Rating",
    rankMissing: "missing",
    positionTitle: "Rank by service and area",
    legendTop3: "TOP 3",
    legend4to10: "4–10",
    legend11plus: "11+",
    legendMissing: "missing",
    serviceCol: "Service",
    positionNote: "Rank in local search results. Goal: move weak positions (11+) and missing combinations into TOP 3. Seam: rank tracker.",
    gapsTitle: "Coverage gaps",
    gapCount: "{n} missing",
    localityCol: "Location",
    serviceColGap: "Service",
    volumeCol: "Volume/mo.",
    statusCol: "Status",
    missingPage: "No page",
    gapsNote: "For each gap, deploy a local microsite (/m/…) + Google Business Profile. Seam: rank tracker + reviews API + call tracking.",
    reputationTitle: "Reputation by location",
    reviewCount: "{n} reviews",
  },
} as const;

/** Locale-aware "4,6 ★" rating label (comma decimal comes from the formatter,
 *  not a hand-faked replace). Mirrored in LocalReviews. */
const star = (r: number, fmtDecimal: (n: number, digits?: number) => string) =>
  `${fmtDecimal(r, 1)} ★`;

/** Map a local SERP rank to a Pill tone + label, matching the module's color language.
 *  1–3 = positive, 4–10 = warning (negative-soft), 11+ = coral, no page = neutral. */
function rankCell(t: LocalTarget | undefined, missingLabel: string): { tone: PillTone; label: string } {
  if (!t || !t.hasPage || t.rank === null) return { tone: "neutral", label: missingLabel };
  if (t.rank <= 3) return { tone: "positive", label: `#${t.rank}` };
  if (t.rank <= 10) return { tone: "negative", label: `#${t.rank}` };
  return { tone: "coral", label: `#${t.rank}` };
}

export default async function LocalModule({
  targets,
  reviews,
  recentReviews,
  businessName,
}: {
  targets: LocalTarget[];
  reviews: ReviewProfile[];
  recentReviews: RecentReview[];
  businessName?: string;
}) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  const s = localSummary(targets, reviews);
  const gapRows = gaps(targets);
  const m = matrix(targets);

  return (
    <div className="stagger space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("coverage")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtPct(s.coverage)}</p>
          <p className="mt-1 text-xs text-muted">{t("coverageOf", { with: s.withPage, total: s.total })}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("weakPositions")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-coral-600">{fmt.fmtInt(s.coveredButWeak)}</p>
          <p className="mt-1 text-xs text-muted">{t("weakPositionsNote")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("gapVolume")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-coral-600">{fmt.fmtInt(s.gapVolume)}</p>
          <p className="mt-1 text-xs text-muted">{t("gapVolumeNote")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("reviews")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtInt(s.reviews)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("rating")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-positive">{star(s.avgRating, fmt.fmtDecimal)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Pin width={18} height={18} className="text-brand-accent" />
            {t("positionTitle")}
          </h3>
          <div className="flex items-center gap-2">
            <Pill tone="positive">{t("legendTop3")}</Pill>
            <Pill tone="negative">{t("legend4to10")}</Pill>
            <Pill tone="coral">{t("legend11plus")}</Pill>
            <Pill tone="neutral">{t("legendMissing")}</Pill>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("serviceCol")}</th>
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
                    const { tone, label } = rankCell(target, t("rankMissing"));
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
          {t("positionNote")}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Pin width={18} height={18} className="text-brand-accent" />
            {t("gapsTitle")}
          </h3>
          <Pill tone="coral">{t("gapCount", { n: gapRows.length })}</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("localityCol")}</th>
                <th className="px-4 py-3 font-medium">{t("serviceColGap")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("volumeCol")}</th>
                <th className="px-4 py-3 font-medium">{t("statusCol")}</th>
              </tr>
            </thead>
            <tbody>
              {gapRows.map((tgt) => (
                <tr key={`${tgt.area}-${tgt.service}`} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{tgt.area}</td>
                  <td className="px-4 py-3 text-navy-700">{tgt.service}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(tgt.monthlyVolume)}</td>
                  <td className="px-4 py-3">
                    <Pill tone="coral">{t("missingPage")}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          {t("gapsNote")}
        </div>
      </div>

      <div>
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("reputationTitle")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {reviews.map((r) => (
            <div key={r.area} className="card flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-semibold text-navy-800">{r.area}</p>
                <p className="text-xs text-muted">{t("reviewCount", { n: fmt.fmtInt(r.reviews) })}</p>
              </div>
              <span className="tnum text-sm font-semibold text-positive">{star(r.rating, fmt.fmtDecimal)}</span>
            </div>
          ))}
        </div>
      </div>

      <LocalReviews
        reviews={recentReviews}
        businessType="montáž a servis klimatizací a elektroinstalací"
        businessName={businessName}
      />
    </div>
  );
}
