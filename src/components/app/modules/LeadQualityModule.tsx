/** Lead quality — cost-per-qualified-lead view + lead → close funnel by source
 *  and campaign (stage conversion, drop-off, velocity). Server. */
import { Pill, type PillTone } from "@/components/ui";
import { Bulb, Funnel, Clock, Bell } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import {
  avgVelocity,
  funnelBySource,
  periodAlerts,
  summarize,
  trendBySource,
  withMetrics,
  type LeadQualityAlert,
} from "@/lib/lead-quality/compute";
import type { LeadSource } from "@/lib/lead-quality/sample";
import LeadSourceDiagnosisPanel, {
  type LeadSourceSeed,
} from "@/components/app/modules/LeadSourceDiagnosisPanel";

const T = {
  cs: {
    leads: "Leady",
    leadsQualifiedSub: "z toho {qualified} kvalifikovaných",
    cpl: "CPL",
    cplSub: "cena za lead",
    cpql: "CPQL",
    cpqlSub: "cena za kvalifikovaný lead",
    junkSources: "Junk zdroje",
    junkSourcesSub: "levné, ale nekvalitní",
    junkAlertPre: "Některé zdroje mají nízké CPL, ale po kvalifikaci jsou drahé (vysoké CPQL). Optimalizujte bidding na",
    junkAlertBold: "kvalifikované leady a tržby",
    junkAlertPost: ", ne na počet formulářů.",
    colSource: "Zdroj",
    colLeads: "Leady",
    colCpl: "CPL",
    colQualRate: "Kvalifik.",
    colCpql: "CPQL",
    colWinRate: "Win rate",
    colRoi: "ROI",
    colQuality: "Kvalita",
    tableFooter: "Skóre kvality = 60 % míra kvalifikace + 40 % win rate. Seam: napojit CRM (lead → kvalifikovaný → uzavřený + hodnota).",
    funnelTitle: "Trychtýř lead → uzavřeno",
    funnelVelocity: "ø {days} dní do uzavření",
    funnelOverallConversion: "celkem {pct} lead → uzavřeno",
    funnelEntry: "vstup",
    funnelFooter: "Konverze = podíl předané dál z předchozí fáze; drop-off = počet ztracený mezi fázemi. Fáze „Příležitost“ se zobrazí jen tam, kde data existují.",
    trendTitle: "Trend a upozornění",
    trendVsPrev: "vs. minulé období",
    alertSeverityCritical: "cíl",
    alertSeverityWarning: "drift",
    colCpqlDelta: "Δ CPQL",
    colQualRateDelta: "Δ kvalifikace",
    colWinRateDelta: "Δ win rate",
    trendFooter: "Δ = relativní změna oproti minulému období. Upozornění: růst CPQL o více než 25 % nebo překročení cíle. Zelená = zlepšení, červená = zhoršení.",
    colCampaign: "Kampaň",
    colSql: "SQL",
    colClosed: "Uzavřeno",
    colLeadToClosed: "Lead → uzavřeno",
    colAvgDays: "ø dní",
    campaignFooter: "Drill-down podle kampaně — rychlost (ø dní) se skryje tam, kde chybí data o době ve fázi.",
    nextStepLabel: "Optimalizovat bidding",
    nextStepHint: "Cílit na kvalifikované leady, ne na počet",
  },
  en: {
    leads: "Leads",
    leadsQualifiedSub: "of which {qualified} qualified",
    cpl: "CPL",
    cplSub: "cost per lead",
    cpql: "CPQL",
    cpqlSub: "cost per qualified lead",
    junkSources: "Junk sources",
    junkSourcesSub: "cheap but low quality",
    junkAlertPre: "Some sources have low CPL but are expensive after qualification (high CPQL). Optimise bidding for",
    junkAlertBold: "qualified leads and revenue",
    junkAlertPost: ", not form count.",
    colSource: "Source",
    colLeads: "Leads",
    colCpl: "CPL",
    colQualRate: "Qual. rate",
    colCpql: "CPQL",
    colWinRate: "Win rate",
    colRoi: "ROI",
    colQuality: "Quality",
    tableFooter: "Quality score = 60% qualification rate + 40% win rate. Seam: connect CRM (lead → qualified → closed + value).",
    funnelTitle: "Lead → close funnel",
    funnelVelocity: "avg. {days} days to close",
    funnelOverallConversion: "{pct} overall lead → close",
    funnelEntry: "entry",
    funnelFooter: "Conversion = share passed to the next stage from the previous; drop-off = count lost between stages. The \“Opportunity\” stage appears only where data exists.",
    trendTitle: "Trend and alerts",
    trendVsPrev: "vs. previous period",
    alertSeverityCritical: "target",
    alertSeverityWarning: "drift",
    colCpqlDelta: "Δ CPQL",
    colQualRateDelta: "Δ qual. rate",
    colWinRateDelta: "Δ win rate",
    trendFooter: "Δ = relative change vs. previous period. Alerts: CPQL growth above 25% or target breach. Green = improvement, red = deterioration.",
    colCampaign: "Campaign",
    colSql: "SQL",
    colClosed: "Closed",
    colLeadToClosed: "Lead → close",
    colAvgDays: "avg. days",
    campaignFooter: "Campaign drill-down — velocity (avg. days) is hidden where stage-time data is missing.",
    nextStepLabel: "Optimise bidding",
    nextStepHint: "Target qualified leads, not form count",
  },
} as const;

/** Win rate below which a source that otherwise qualifies still under-performs
 *  (qualified leads that rarely close → a fit / targeting problem). */
const WEAK_WIN_RATE = 0.15;

function scoreTone(score: number): PillTone {
  if (score >= 60) return "positive";
  if (score >= 40) return "coral";
  return "negative";
}

/** Conversion tone for a single funnel step (entry stage is always neutral). */
function stepTone(conversion: number, isEntry: boolean): PillTone {
  if (isEntry) return "neutral";
  if (conversion >= 0.5) return "positive";
  if (conversion >= 0.2) return "coral";
  return "negative";
}

/** Tone for a period-over-period delta. `goodWhenUp` flips the polarity: a rising
 *  qualification / win rate is good (green), a rising CPQL is bad (red). A flat or
 *  missing delta reads neutral. The dead-band keeps tiny wiggles from flashing red. */
function deltaTone(delta: number | null, goodWhenUp: boolean): PillTone {
  if (delta === null || Math.abs(delta) < 0.005) return "neutral";
  const improving = goodWhenUp ? delta > 0 : delta < 0;
  return improving ? "positive" : "negative";
}

const alertTone: Record<LeadQualityAlert["severity"], PillTone> = {
  warning: "coral",
  critical: "negative",
};

export default async function LeadQualityModule({ sources }: { sources: LeadSource[] }) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  const rows = sources.map(withMetrics).sort((a, b) => b.qualityScore - a.qualityScore);
  const s = summarize(sources);
  const funnels = funnelBySource(sources);
  const velocity = avgVelocity(sources);
  const campaigns = sources.filter((src) => src.campaign);
  // Period-over-period drift watch: per-source deltas + threshold alerts. Both
  // empty when no source carries prior-period data → the whole section hides.
  const trends = trendBySource(sources);
  const alerts = periodAlerts(sources);

  // Under-performing sources the AI diagnosis can read: junk (cheap but low
  // quality) or sources that qualify yet rarely close. Projected down to the real
  // numbers the model needs — no compute / sample data ships to the client. If
  // none stand out, offer the weakest source by quality score so the action is
  // always available.
  const underperforming = rows.filter((r) => r.junk || r.winRate < WEAK_WIN_RATE);
  const diagnosisRows = underperforming.length > 0 ? underperforming : rows.slice(-1);
  const diagnosisSeeds: LeadSourceSeed[] = diagnosisRows.map((r) => {
    const seed: LeadSourceSeed = {
      source: r.source,
      leads: r.leads,
      qualified: r.qualified,
      won: r.won,
      qualRate: r.qualRate,
      winRate: r.winRate,
      junk: r.junk,
    };
    if (r.spend > 0) {
      seed.spend = r.spend;
      seed.cpql = r.cpl;
      seed.costPerQualified = r.cpql;
    }
    // Peer sources (best-first by quality score, excluding self) so the diagnosis
    // can name a concrete better destination for budget instead of "move it".
    const peers = rows
      .filter((p) => p.source !== r.source)
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, 3)
      .map((p) => ({
        source: p.source,
        qualRate: p.qualRate,
        winRate: p.winRate,
        ...(p.spend > 0 ? { costPerQualified: p.cpql } : {}),
      }));
    if (peers.length > 0) seed.peers = peers;
    return seed;
  });

  const alertSeverityLabel: Record<LeadQualityAlert["severity"], string> = {
    critical: t("alertSeverityCritical"),
    warning: t("alertSeverityWarning"),
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("leads")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtInt(s.leads)}</p>
          <p className="mt-1 text-xs text-muted">{t("leadsQualifiedSub", { qualified: fmt.fmtInt(s.qualified) })}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("cpl")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtCZK(s.blendedCpl)}</p>
          <p className="mt-1 text-xs text-muted">{t("cplSub")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("cpql")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-brand-accent">{fmt.fmtCZK(s.blendedCpql)}</p>
          <p className="mt-1 text-xs text-muted">{t("cpqlSub")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("junkSources")}</p>
          <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${s.junkCount > 0 ? "text-negative" : "text-positive"}`}>
            {s.junkCount}
          </p>
          <p className="mt-1 text-xs text-muted">{t("junkSourcesSub")}</p>
        </div>
      </div>

      {s.junkCount > 0 && (
        <div className="flex items-start gap-3 rounded-card border border-coral-400/30 bg-coral-soft px-4 py-3.5">
          <Bulb width={18} height={18} className="mt-0.5 shrink-0 text-coral-600" />
          <p className="text-sm leading-relaxed text-navy-700">
            {t("junkAlertPre")} <strong>{t("junkAlertBold")}</strong>{t("junkAlertPost")}
          </p>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colSource")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colLeads")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colCpl")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colQualRate")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colCpql")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colWinRate")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colRoi")}</th>
                <th className="px-4 py-3 font-medium">{t("colQuality")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className={`border-b border-line/70 last:border-0 ${r.junk ? "bg-coral-soft/40" : ""}`}>
                  <td className="px-5 py-3 font-medium text-navy-800">{r.source}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(r.leads)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{r.spend > 0 ? fmt.fmtCZK(r.cpl) : "—"}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(r.qualRate)}</td>
                  <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{r.spend > 0 ? fmt.fmtCZK(r.cpql) : "—"}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(r.winRate)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">
                    {Number.isFinite(r.roi) ? fmt.fmtMultiple(r.roi) : "∞"}
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
          {t("tableFooter")}
        </div>
      </div>

      {/* Lead → close funnel by source: per-step conversion + absolute drop-off. */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Funnel width={18} height={18} className="shrink-0 text-brand-accent" />
          <h3 className="text-sm font-semibold text-navy-800">{t("funnelTitle")}</h3>
          {velocity.total !== null && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
              <Clock width={14} height={14} className="shrink-0" />
              {t("funnelVelocity", { days: fmt.fmtDecimal(velocity.total, 0) })}
            </span>
          )}
        </div>

        <div className="space-y-5 px-5 py-4">
          {funnels.map((f) => {
            const entry = f.stages[0]?.count ?? 0;
            return (
              <div key={f.source}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-navy-800">{f.source}</p>
                  <p className="tnum text-xs text-muted">
                    {t("funnelOverallConversion", { pct: fmt.fmtPct(f.overallConversion) })}
                  </p>
                </div>
                <div className="flex flex-wrap items-stretch gap-2">
                  {f.stages.map((stage, i) => {
                    const width = entry > 0 ? Math.max(8, (stage.count / entry) * 100) : 100;
                    return (
                      <div key={stage.key} className="min-w-[7rem] flex-1" style={{ flexGrow: width }}>
                        <div className="rounded-card border border-line bg-navy-50/40 px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted">{stage.label}</span>
                            <span className="tnum text-sm font-semibold text-navy-800">{fmt.fmtInt(stage.count)}</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <Pill tone={stepTone(stage.conversion, i === 0)}>
                              {i === 0 ? t("funnelEntry") : fmt.fmtPct(stage.conversion)}
                            </Pill>
                            {i > 0 && stage.dropOff > 0 && (
                              <span className="tnum text-xs text-negative">−{fmt.fmtInt(stage.dropOff)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          {t("funnelFooter")}
        </div>
      </div>

      {/* Period-over-period drift watch — CPQL / qualification / win rate vs previous
          period, plus threshold alerts. Hidden entirely without prior data. */}
      {trends.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
            <Bell width={18} height={18} className="shrink-0 text-brand-accent" />
            <h3 className="text-sm font-semibold text-navy-800">{t("trendTitle")}</h3>
            <span className="ml-auto text-xs text-muted">{t("trendVsPrev")}</span>
          </div>

          {alerts.length > 0 && (
            <ul className="divide-y divide-line/70 border-b border-line">
              {alerts.map((a) => (
                <li key={`${a.source}-${a.kind}`} className="flex items-start gap-3 px-5 py-3">
                  <Pill tone={alertTone[a.severity]}>{alertSeverityLabel[a.severity]}</Pill>
                  <p className="text-sm leading-relaxed text-navy-700">{a.message}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">{t("colSource")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("cpql")}</th>
                  <th className="px-4 py-3 font-medium">{t("colCpqlDelta")}</th>
                  <th className="px-4 py-3 font-medium">{t("colQualRateDelta")}</th>
                  <th className="px-4 py-3 font-medium">{t("colWinRateDelta")}</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((tr) => (
                  <tr key={tr.source} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-800">{tr.source}</td>
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                      {tr.paid ? fmt.fmtCZK(tr.cpqlNow) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {tr.cpqlDelta !== null ? (
                        <Pill tone={deltaTone(tr.cpqlDelta, false)}>{fmt.fmtSignedPct(tr.cpqlDelta)}</Pill>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tr.qualRateDelta !== null ? (
                        <Pill tone={deltaTone(tr.qualRateDelta, true)}>{fmt.fmtSignedPct(tr.qualRateDelta)}</Pill>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tr.winRateDelta !== null ? (
                        <Pill tone={deltaTone(tr.winRateDelta, true)}>{fmt.fmtSignedPct(tr.winRateDelta)}</Pill>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            {t("trendFooter")}
          </div>
        </div>
      )}

      {/* Campaign drill-down — only when campaign data exists. */}
      {campaigns.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">{t("colCampaign")}</th>
                  <th className="px-4 py-3 font-medium">{t("colSource")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colLeads")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colSql")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colClosed")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colLeadToClosed")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colAvgDays")}</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const conv = c.leads > 0 ? c.won / c.leads : 0;
                  const days =
                    typeof c.daysToQualify === "number" || typeof c.daysToClose === "number"
                      ? (c.daysToQualify ?? 0) + (c.daysToClose ?? 0)
                      : null;
                  return (
                    <tr key={`${c.source}-${c.campaign}`} className="border-b border-line/70 last:border-0">
                      <td className="px-5 py-3 font-medium text-navy-800">{c.campaign}</td>
                      <td className="px-4 py-3 text-navy-700">{c.source}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.leads)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.qualified)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.won)}</td>
                      <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmt.fmtPct(conv)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">
                        {days !== null ? fmt.fmtDecimal(days, 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            {t("campaignFooter")}
          </div>
        </div>
      )}

      {diagnosisSeeds.length > 0 && <LeadSourceDiagnosisPanel seeds={diagnosisSeeds} />}

      <NextSteps steps={[{ to: "kampane", label: t("nextStepLabel"), hint: t("nextStepHint") }]} />
    </div>
  );
}
