/** LP experimenty — landing-page A/B results per keyword cluster. Server component. */
import { Pill } from "@/components/ui";
import { Check, ArrowRight } from "@/components/icons";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { evaluate } from "@/lib/lp-exp/compute";
import type { LpExperiment } from "@/lib/lp-exp/sample";
import NextSteps from "@/components/app/NextSteps";
import LpVariantIdeasPanel, {
  type LpVariantSeed,
} from "@/components/app/modules/LpVariantIdeasPanel";

const T = {
  cs: {
    lpExperiment: "Landing page experiment · {n} varianty",
    adjustedFor: "upraveno pro {n} varianty",
    statusDone: "Ukončeno",
    statusRunning: "Běží",
    collecting: "Sbírá data — {pct} %",
    winner: "Vítěz ({conf} jistota)",
    leading: "Vede, zatím neprůkazné",
    noDiff: "Bez rozdílu",
    needVisitors: "Potřeba ~{n} návštěvníků/varianta než vyhlásíme vítěze",
    adjustedThreshold: "(práh upraven pro {n} varianty)",
    shippedOne: "Máte průkazného vítěze",
    shippedMany: "Máte {n} průkazné vítěze",
    shippedHint: "Posuňte je do navazujících modulů.",
    nextUpdateCopy: "Aktualizovat vítěznou kopii",
    nextUpdateCopyHint: "Přenést vítěznou variantu do briefu a článků",
    nextExpandCluster: "Rozšířit vítězný klastr",
    nextExpandClusterHint: "Postavit další high-intent stránky na vítězném klastru",
    nextSendTraffic: "Poslat provoz na novou LP",
    nextSendTrafficHint: "Nasměrovat rozpočet kampaní na vítěznou landing page",
    footerHint: "Varianty lze generovat z klastrů klíčových slov (modul Srovnání & SEO + Obsah) nebo přímo tlačítkem „Navrhnout varianty“ výše. Seam: reálné rozdělení návštěvnosti a analytika.",
  },
  en: {
    lpExperiment: "Landing page experiment · {n} variants",
    adjustedFor: "adjusted for {n} variants",
    statusDone: "Completed",
    statusRunning: "Running",
    collecting: "Collecting data — {pct}%",
    winner: "Winner ({conf} confidence)",
    leading: "Leading, not yet conclusive",
    noDiff: "No difference",
    needVisitors: "~{n} visitors/variant needed before declaring a winner",
    adjustedThreshold: "(threshold adjusted for {n} variants)",
    shippedOne: "You have a statistically significant winner",
    shippedMany: "You have {n} statistically significant winners",
    shippedHint: "Move them to the follow-up modules.",
    nextUpdateCopy: "Update the winning copy",
    nextUpdateCopyHint: "Carry the winning variant into a brief and articles",
    nextExpandCluster: "Expand the winning cluster",
    nextExpandClusterHint: "Build more high-intent pages on the winning cluster",
    nextSendTraffic: "Send traffic to the new LP",
    nextSendTrafficHint: "Direct campaign budget to the winning landing page",
    footerHint: "Variants can be generated from keyword clusters (Compare & SEO + Content module) or directly via “Suggest variants” above. Seam: real traffic split and analytics.",
  },
} as const;

export default async function LpExperimentsModule({ experiments }: { experiments: LpExperiment[] }) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  const results = experiments.map(evaluate);
  // Lightweight projection handed to the AI panel: the topic seed (cluster), status,
  // the control label + CVR, and the angles already tested that LOST to control — so
  // the AI doesn't re-propose a disproven hypothesis (it builds challengers that beat
  // the known control CVR and avoid the losing arms).
  const seeds: LpVariantSeed[] = results.map((r) => {
    const control = r.variants.find((v) => v.isControl) ?? r.variants[0];
    const losers = r.variants.filter((v) => !v.isControl && v.uplift < 0).map((v) => v.label);
    return {
      id: r.id,
      cluster: r.cluster,
      status: r.status,
      controlLabel: control?.label ?? "Kontrola",
      controlCvr: control?.cvr,
      losers: losers.length > 0 ? losers : undefined,
    };
  });
  // A resolved experiment = the gated verdict from the trust-gate wave: a winner
  // that is statistically significant (a `done` test, or a `running` one that has
  // cleared both the confidence threshold and the sample-size gate). Only those
  // earn a ship-the-winner handoff — a leading-but-unproven arm routes nowhere.
  const shipped = results.filter((r) => r.significant && r.winner);

  return (
    <div className="stagger space-y-4">
      {results.map((r) => {
        const maxCvr = Math.max(...r.variants.map((v) => v.cvr), 0.0001);
        // A running test below its target sample size is still collecting data —
        // gate the winner verdict so an under-powered peek can't read like a result.
        const collecting = r.status === "running" && !r.hasEnoughData;
        const progressPct = Math.round(r.progress * 100);
        return (
          <div key={r.id} className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold text-navy-800">{r.cluster}</h3>
                <p className="text-xs text-muted">
                  {t("lpExperiment", { n: r.variants.length })}
                  {r.comparisons > 1 && (
                    <> · {t("adjustedFor", { n: r.variants.length })}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={r.status === "done" ? "neutral" : "brand"}>
                  {r.status === "done" ? t("statusDone") : t("statusRunning")}
                </Pill>
                {collecting ? (
                  <Pill tone="navy">{t("collecting", { pct: progressPct })}</Pill>
                ) : r.winner ? (
                  <Pill tone={r.significant ? "positive" : "coral"}>
                    {r.significant ? t("winner", { conf: fmt.fmtPct(r.confidence) }) : t("leading")}
                  </Pill>
                ) : (
                  <Pill tone="neutral">{t("noDiff")}</Pill>
                )}
              </div>
            </div>

            {collecting && (
              <div className="mt-3">
                <span className="block h-2 overflow-hidden rounded-full bg-canvas">
                  <span
                    className="block h-full rounded-full bg-brand-400"
                    style={{ width: `${progressPct}%` }}
                  />
                </span>
                <p className="mt-1.5 text-xs text-muted">
                  {t("needVisitors", { n: fmt.fmtInt(r.requiredPerArm) })}
                  {r.comparisons > 1 && <> {t("adjustedThreshold", { n: r.variants.length })}</>}.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2.5">
              {r.variants.map((v) => (
                <div key={v.label} className="flex items-center gap-3">
                  <span className="flex w-44 shrink-0 flex-col gap-0.5 text-sm font-medium text-navy-800">
                    <span className="flex items-center gap-1.5">
                      {v.isWinner && !collecting && <Check width={14} height={14} className="text-positive" />}
                      {v.label}
                    </span>
                    {v.isWinner && !collecting && v.url && (
                      <a
                        href={v.url}
                        className="truncate text-xs font-normal text-brand-accent hover:underline"
                      >
                        {v.url}
                      </a>
                    )}
                  </span>
                  <span className="h-6 flex-1 overflow-hidden rounded-md bg-canvas">
                    <span
                      className={`block h-full rounded-md ${v.isWinner && !collecting ? "bg-positive" : v.isControl ? "bg-navy-200" : "bg-brand-400"}`}
                      style={{ width: `${Math.round((v.cvr / maxCvr) * 100)}%` }}
                    />
                  </span>
                  <span className="tnum w-16 shrink-0 text-right text-sm font-semibold text-navy-800">{fmt.fmtPct(v.cvr)}</span>
                  <span className="tnum hidden w-28 shrink-0 text-right text-xs text-muted sm:block">
                    {fmt.fmtInt(v.signups)} / {fmt.fmtInt(v.visitors)}
                  </span>
                  <span
                    className={`tnum w-16 shrink-0 text-right text-xs font-medium ${
                      v.isControl ? "text-muted" : v.uplift >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {v.isControl ? "—" : fmt.fmtSignedPct(v.uplift)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {shipped.length > 0 && (
        <div className="card border-positive/40 bg-positive/5 p-5">
          <div className="mb-4 flex items-start gap-2">
            <ArrowRight width={18} height={18} className="mt-0.5 shrink-0 text-positive" />
            <p className="text-sm text-navy-800">
              {shipped.length === 1 ? t("shippedOne") : t("shippedMany", { n: shipped.length })} (
              {shipped.map((r) => r.cluster).join(", ")}). {t("shippedHint")}
            </p>
          </div>
          <NextSteps
            steps={[
              {
                to: "obsahovy-engine",
                label: t("nextUpdateCopy"),
                hint: t("nextUpdateCopyHint"),
              },
              {
                to: "srovnani-seo",
                label: t("nextExpandCluster"),
                hint: t("nextExpandClusterHint"),
              },
              {
                to: "kampane",
                label: t("nextSendTraffic"),
                hint: t("nextSendTrafficHint"),
              },
            ]}
          />
        </div>
      )}

      {seeds.length > 0 && <LpVariantIdeasPanel seeds={seeds} />}

      <p className="px-1 text-xs text-muted">{t("footerHint")}</p>
    </div>
  );
}
