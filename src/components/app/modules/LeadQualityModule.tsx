/** Kvalita leadů — cost-per-qualified-lead view + lead → close funnel by source
 *  and campaign (stage conversion, drop-off, velocity). Server. */
import { Pill, type PillTone } from "@/components/ui";
import { Bulb, Funnel, Clock, Bell } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { fmtCZK, fmtDecimal, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "@/lib/format";
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

export default function LeadQualityModule({ sources }: { sources: LeadSource[] }) {
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

      {/* Lead → close funnel by source: per-step conversion + absolute drop-off. */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <Funnel width={18} height={18} className="shrink-0 text-brand-accent" />
          <h3 className="text-sm font-semibold text-navy-800">Trychtýř lead → uzavřeno</h3>
          {velocity.total !== null && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
              <Clock width={14} height={14} className="shrink-0" />
              ø {fmtDecimal(velocity.total, 0)} dní do uzavření
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
                    celkem {fmtPct(f.overallConversion)} lead → uzavřeno
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
                            <span className="tnum text-sm font-semibold text-navy-800">{fmtInt(stage.count)}</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <Pill tone={stepTone(stage.conversion, i === 0)}>
                              {i === 0 ? "vstup" : fmtPct(stage.conversion)}
                            </Pill>
                            {i > 0 && stage.dropOff > 0 && (
                              <span className="tnum text-xs text-negative">−{fmtInt(stage.dropOff)}</span>
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
          Konverze = podíl předané dál z předchozí fáze; drop-off = počet ztracený mezi fázemi. Fáze
          „Příležitost” se zobrazí jen tam, kde data existují.
        </div>
      </div>

      {/* Period-over-period drift watch — CPQL / kvalifikace / win rate vs minulé
          období, plus prahová upozornění. Hidden entirely without prior data. */}
      {trends.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
            <Bell width={18} height={18} className="shrink-0 text-brand-accent" />
            <h3 className="text-sm font-semibold text-navy-800">Trend a upozornění</h3>
            <span className="ml-auto text-xs text-muted">vs. minulé období</span>
          </div>

          {alerts.length > 0 && (
            <ul className="divide-y divide-line/70 border-b border-line">
              {alerts.map((a) => (
                <li key={`${a.source}-${a.kind}`} className="flex items-start gap-3 px-5 py-3">
                  <Pill tone={alertTone[a.severity]}>{a.severity === "critical" ? "cíl" : "drift"}</Pill>
                  <p className="text-sm leading-relaxed text-navy-700">{a.message}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Zdroj</th>
                  <th className="px-4 py-3 text-right font-medium">CPQL</th>
                  <th className="px-4 py-3 font-medium">Δ CPQL</th>
                  <th className="px-4 py-3 font-medium">Δ kvalifikace</th>
                  <th className="px-4 py-3 font-medium">Δ win rate</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t) => (
                  <tr key={t.source} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-800">{t.source}</td>
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                      {t.paid ? fmtCZK(t.cpqlNow) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {t.cpqlDelta !== null ? (
                        <Pill tone={deltaTone(t.cpqlDelta, false)}>{fmtSignedPct(t.cpqlDelta)}</Pill>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.qualRateDelta !== null ? (
                        <Pill tone={deltaTone(t.qualRateDelta, true)}>{fmtSignedPct(t.qualRateDelta)}</Pill>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.winRateDelta !== null ? (
                        <Pill tone={deltaTone(t.winRateDelta, true)}>{fmtSignedPct(t.winRateDelta)}</Pill>
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
            Δ = relativní změna oproti minulému období. Upozornění: růst CPQL o více než 25 % nebo
            překročení cíle. Zelená = zlepšení, červená = zhoršení.
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
                  <th className="px-5 py-3 font-medium">Kampaň</th>
                  <th className="px-4 py-3 font-medium">Zdroj</th>
                  <th className="px-4 py-3 text-right font-medium">Leady</th>
                  <th className="px-4 py-3 text-right font-medium">SQL</th>
                  <th className="px-4 py-3 text-right font-medium">Uzavřeno</th>
                  <th className="px-4 py-3 text-right font-medium">Lead → uzavřeno</th>
                  <th className="px-4 py-3 text-right font-medium">ø dní</th>
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
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.leads)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.qualified)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.won)}</td>
                      <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmtPct(conv)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">
                        {days !== null ? fmtDecimal(days, 0) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            Drill-down podle kampaně — rychlost (ø dní) se skryje tam, kde chybí data o době ve fázi.
          </div>
        </div>
      )}

      {diagnosisSeeds.length > 0 && <LeadSourceDiagnosisPanel seeds={diagnosisSeeds} />}

      <NextSteps steps={[{ to: "kampane", label: "Optimalizovat bidding", hint: "Cílit na kvalifikované leady, ne na počet" }]} />
    </div>
  );
}
