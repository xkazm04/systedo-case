"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Layers, Close, Check, Bolt } from "@/components/icons";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import {
  hasPerformanceBasis,
  variantCtr,
  variantCr,
  variantCpa,
  variantRoas,
  type AdVariantMetrics,
  type Experiment,
} from "@/lib/ai/experiment-types";

type MetricsDraft = Record<string, AdVariantMetrics>;

const EMPTY_METRICS: AdVariantMetrics = { impressions: 0, clicks: 0, conversions: 0, cost: 0, convValue: 0 };

/** A/B experiment comparison: variants scored by predicted ad strength, upgraded
 *  to real ROAS once performance is entered, with the winner highlighted. Turns a
 *  one-shot generator into a measurable optimization loop. Anonymous → hidden.
 *  Reloads when `refreshKey` changes. */
export default function AdExperiments({ refreshKey }: { refreshKey: number }) {
  const { status } = useSession();
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [draft, setDraft] = useState<MetricsDraft>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/experiments");
      if (!res.ok) return;
      const json = (await res.json()) as { experiments?: Experiment[] };
      setExperiments(json.experiments ?? []);
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load, refreshKey]);

  const saveMetrics = async (experimentId: string, variantId: string) => {
    const metrics = draft[variantId] ?? EMPTY_METRICS;
    try {
      await fetch("/api/experiments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId, variantId, metrics }),
      });
      await load();
    } catch {
      /* keep draft */
    }
  };

  const removeExperiment = async (experimentId: string) => {
    setExperiments((prev) => prev.filter((e) => e.id !== experimentId));
    try {
      await fetch("/api/experiments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const setField = (variantId: string, field: keyof AdVariantMetrics, value: string, current: AdVariantMetrics) => {
    const base = draft[variantId] ?? current;
    setDraft((d) => ({ ...d, [variantId]: { ...base, [field]: Math.max(0, Number(value) || 0) } }));
  };

  if (status !== "authenticated" || (!experiments.length && loaded)) return null;
  if (!loaded) return null;

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <Layers width={16} height={16} className="text-brand-accent" />
        <h3 className="text-base font-semibold text-navy-800">A/B testy inzerátů</h3>
        <span className="pill bg-navy-50 text-muted">{experiments.length}</span>
      </div>

      {experiments.map((exp) => {
        const byPerformance = hasPerformanceBasis(exp);
        return (
          <div key={exp.id} className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-navy-800">{exp.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {exp.variants.length} variant ·{" "}
                  {byPerformance ? "vítěz dle výkonu (ROAS)" : "vítěz dle síly inzerátu"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeExperiment(exp.id)}
                aria-label={`Smazat A/B test ${exp.name}`}
                className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-negative-soft hover:text-negative"
              >
                <Close width={15} height={15} />
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {exp.variants.map((v) => {
                const m = draft[v.id] ?? v.metrics ?? EMPTY_METRICS;
                const isWinner = v.id === exp.winnerVariantId && exp.variants.length > 1;
                return (
                  <div
                    key={v.id}
                    className={`rounded-card border p-3 ${
                      isWinner ? "border-positive/50 bg-positive-soft/40" : "border-line"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-navy-800">{v.label}</span>
                      {isWinner && (
                        <span className="pill inline-flex items-center gap-1 bg-positive-soft text-positive">
                          <Check width={12} height={12} /> Vítěz
                        </span>
                      )}
                    </div>

                    <p className="mt-1 truncate text-xs text-muted" title={v.ad.headlines.join(" · ")}>
                      {v.ad.headlines.slice(0, 3).join(" · ")}
                    </p>

                    {/* predicted ad strength */}
                    <div className="mt-2 flex items-center gap-2">
                      <Bolt width={12} height={12} className="text-brand-accent" />
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50" aria-hidden>
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${v.strength}%` }} />
                      </span>
                      <span className="tnum text-xs font-semibold text-navy-800">{v.strength}</span>
                    </div>

                    {/* measured performance */}
                    {v.metrics && (
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[13px] text-muted">
                        <span>CTR <span className="tnum text-navy-700">{fmtPct(variantCtr(v.metrics))}</span></span>
                        <span>CR <span className="tnum text-navy-700">{fmtPct(variantCr(v.metrics))}</span></span>
                        <span>CPA <span className="tnum text-navy-700">{fmtCZK(variantCpa(v.metrics))}</span></span>
                        <span>ROAS <span className="tnum text-navy-700">{fmtMultiple(variantRoas(v.metrics))}</span></span>
                      </div>
                    )}

                    {/* metrics entry */}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[13px] font-medium text-brand-accent">
                        {v.metrics ? "Upravit výkon" : "Zadat výkon"}
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {METRIC_FIELDS.map((f) => (
                          <label key={f.key} className="text-[13px] text-muted">
                            {f.label}
                            <input
                              type="number"
                              min={0}
                              value={m[f.key] || ""}
                              onChange={(e) => setField(v.id, f.key, e.target.value, v.metrics ?? EMPTY_METRICS)}
                              className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-navy-800"
                            />
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => saveMetrics(exp.id, v.id)}
                        className="mt-2 inline-flex items-center gap-1 rounded-pill bg-brand-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-700"
                      >
                        Uložit výkon
                      </button>
                    </details>

                    <p className="mt-2 text-[13px] tabular-nums text-muted">
                      <span className="tnum">{fmtInt(m.impressions)}</span> imprese
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const METRIC_FIELDS: { key: keyof AdVariantMetrics; label: string }[] = [
  { key: "impressions", label: "Imprese" },
  { key: "clicks", label: "Prokliky" },
  { key: "conversions", label: "Konverze" },
  { key: "cost", label: "Náklady (Kč)" },
  { key: "convValue", label: "Hodnota (Kč)" },
];
