/** Lokální dominance — service×area coverage gaps + review reputation. Server. */
import Link from "next/link";
import { Pill } from "@/components/ui";
import type { PillTone } from "@/components/ui";
import { Pin } from "@/components/icons";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { gaps, localSummary, matrix } from "@/lib/local/compute";
import { rankTone, star } from "@/lib/local/tones";
import type { LocalTarget, RecentReview, ReviewProfile } from "@/lib/local/sample";
import type { LocalDiagnosisRequest } from "@/lib/ai-types";
import { inputDigest, type StoredDiagnosis } from "@/lib/diagnoses/types";
import LocalReviews from "@/components/app/modules/LocalReviews";
import LocalDiagnosisPanel from "@/components/app/modules/LocalDiagnosisPanel";
import LocalSourcePanel from "@/components/app/modules/LocalSourcePanel";
import ProvenanceChip from "@/components/app/modules/ProvenanceChip";
import CoverageCell from "@/components/app/modules/CoverageCell";
import type { LocalSignalsSource } from "@/lib/local-signals/types";

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
    positionTitle: "Pozice podle služby a oblasti",
    legendTop3: "TOP 3",
    legend4to10: "4–10",
    legend11plus: "11+",
    legendMissing: "chybí",
    hasPageNoRank: "má stránku",
    serviceCol: "Služba",
    positionNote: "Pozice ve výsledcích lokálního vyhledávání. Vyberte buňku a přepněte pokrytí (stránka ano/ne). Cíl: posunout slabé pozice (11+) a chybějící kombinace do TOP 3. Seam: rank tracker.",
    gapsTitle: "Mezery v pokrytí",
    gapCount: "{n} chybí",
    localityCol: "Oblast",
    serviceColGap: "Služba",
    volumeCol: "Objem/měs.",
    statusCol: "Stav",
    missingPage: "Chybí stránka",
    gapActionCol: "Akce",
    exploreGap: "Prozkoumat klíčová slova",
    gapsNote: "Pro každou mezeru nasaďte lokální microsite (/m/…) + Google Business Profile. Seam: rank tracker + reviews API + call tracking.",
    reputationTitle: "Reputace podle oblasti",
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
    hasPageNoRank: "has page",
    serviceCol: "Service",
    positionNote: "Rank in local search results. Select a cell to toggle coverage (page yes/no). Goal: move weak positions (11+) and missing combinations into TOP 3. Seam: rank tracker.",
    gapsTitle: "Coverage gaps",
    gapCount: "{n} missing",
    localityCol: "Area",
    serviceColGap: "Service",
    volumeCol: "Volume/mo.",
    statusCol: "Status",
    missingPage: "No page",
    gapActionCol: "Action",
    exploreGap: "Explore keywords",
    gapsNote: "For each gap, deploy a local microsite (/m/…) + Google Business Profile. Seam: rank tracker + reviews API + call tracking.",
    reputationTitle: "Reputation by area",
    reviewCount: "{n} reviews",
  },
} as const;

/** Map a local SERP rank to a Pill tone + label, matching the module's color language.
 *  The numeric ramp comes from the shared monotone {@link rankTone} (1–3 positive,
 *  4–10 coral, 11+ negative); page-but-no-rank = navy, no page = neutral. */
function rankCell(
  t: LocalTarget | undefined,
  missingLabel: string,
  hasPageNoRankLabel: string
): { tone: PillTone; label: string } {
  if (!t || !t.hasPage) return { tone: "neutral", label: missingLabel };
  if (t.rank === null) return { tone: "navy", label: hasPageNoRankLabel }; // page exists, not ranking yet
  return { tone: rankTone(t.rank), label: `#${t.rank}` };
}

export default async function LocalModule({
  targets,
  reviews,
  recentReviews,
  businessName,
  businessType,
  projectId,
  diagnosisRequest,
  initialDiagnosis = null,
  diagnosisHistory = [],
  reviewsLive = false,
  coverageLive = false,
  coverageSource,
  coverageSyncedAt,
  coverageSourceUrl,
}: {
  targets: LocalTarget[];
  reviews: ReviewProfile[];
  recentReviews: RecentReview[];
  businessName?: string;
  /** the project id, so a coverage gap can link into keyword research for it.
   *  Optional: the marketing demo renders this module without a live project route. */
  projectId?: string;
  /** reputation cards read live per-locality profiles when reviews are imported */
  reviewsLive?: boolean;
  /** coverage-matrix provenance (D1) */
  coverageLive?: boolean;
  coverageSource?: "sample" | LocalSignalsSource;
  coverageSyncedAt?: string;
  coverageSourceUrl?: string;
  /** what this business actually does, derived from the catalog — grounds the AI
   *  review replies instead of a hardcoded industry (BM-L1-07). */
  businessType?: string;
  /** the prebuilt local-diagnosis request (resolved figures) — renders the AI
   *  "Lokální diagnóza" panel. Omitted on the marketing demo (no live project). */
  diagnosisRequest?: LocalDiagnosisRequest;
  /** the latest persisted local diagnosis (renders on load) */
  initialDiagnosis?: StoredDiagnosis | null;
  /** the capped local-diagnosis history */
  diagnosisHistory?: StoredDiagnosis[];
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

      {diagnosisRequest && (
        <LocalDiagnosisPanel
          request={diagnosisRequest}
          projectId={projectId}
          initialDiagnosis={initialDiagnosis}
          history={diagnosisHistory}
          // Direction 2: the digest of the CURRENT request (same builder the click path
          // re-derives) badges an older stored diagnosis stale. Only when persisting.
          currentDigest={projectId ? inputDigest(diagnosisRequest) : undefined}
        />
      )}

      {projectId && (
        <LocalSourcePanel
          projectId={projectId}
          kind="coverage"
          live={coverageLive}
          source={coverageSource}
          syncedAt={coverageSyncedAt}
          sourceUrl={coverageSourceUrl}
        />
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Pin width={18} height={18} className="text-brand-accent" />
            {t("positionTitle")}
            <ProvenanceChip live={coverageLive} />
          </h3>
          <div className="flex items-center gap-2">
            <Pill tone="positive">{t("legendTop3")}</Pill>
            <Pill tone="coral">{t("legend4to10")}</Pill>
            <Pill tone="negative">{t("legend11plus")}</Pill>
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
                    const { tone, label } = rankCell(target, t("rankMissing"), t("hasPageNoRank"));
                    return (
                      <td key={area} className="px-4 py-3 text-center">
                        {target ? (
                          <CoverageCell
                            projectId={projectId}
                            service={service}
                            area={area}
                            hasPage={target.hasPage}
                            tone={tone}
                            label={label}
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
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

      <div id="local-gaps" className="card overflow-hidden scroll-mt-24">
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
                {projectId && <th className="px-4 py-3 font-medium">{t("gapActionCol")}</th>}
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
                  {projectId && (
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/${projectId}/klicova-slova?seed=${encodeURIComponent(`${tgt.service} ${tgt.area}`)}`}
                        className="text-xs font-semibold text-brand-accent hover:underline"
                      >
                        {t("exploreGap")} →
                      </Link>
                    </td>
                  )}
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
        <div className="flex items-center gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("reputationTitle")}</p>
          <ProvenanceChip live={reviewsLive} />
        </div>
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
        businessType={businessType || "místní služby"}
        businessName={businessName}
      />
    </div>
  );
}
