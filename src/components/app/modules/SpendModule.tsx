"use client";

/** Usage — LLM spend by operation and model over a period: totals, a cost-share
 *  bar breakdown by operation, a per-model table, CSV export. Shaped on the real
 *  telemetry/cost model; the live version aggregates the llmTelemetry collection.
 *  Account epic (consolidation phase 6). */
import { useMemo, useState } from "react";
import { Download } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { useFormatters } from "@/lib/i18n/client";
import type { SpendEntry } from "@/lib/spend/sample";
import { byModel, byOperation, costShare, filterSpend, totals } from "@/lib/spend/compute";
import { toCsv, downloadText } from "@/lib/export";

const T = {
  cs: {
    cost: "Náklady", calls: "Volání", tokens: "Tokeny",
    window7: "7 dní", window30: "30 dní", windowAll: "Vše",
    byOperation: "Podle operace", byModel: "Podle modelu",
    colModel: "Model", colCalls: "Volání", colTokens: "Tokeny", colCost: "Náklady", colShare: "Podíl",
    export: "Export CSV", empty: "V tomto období není žádná spotřeba.",
    note: "Ilustrativní spotřeba LLM. Živá verze agreguje kolekci llmTelemetry (zaznamenáno v recordLlmCall) za období.",
    noteLive: "Živá data z llmTelemetry pro tento projekt za posledních 60 dní.",
  },
  en: {
    cost: "Cost", calls: "Calls", tokens: "Tokens",
    window7: "7 days", window30: "30 days", windowAll: "All",
    byOperation: "By operation", byModel: "By model",
    colModel: "Model", colCalls: "Calls", colTokens: "Tokens", colCost: "Cost", colShare: "Share",
    export: "Export CSV", empty: "No usage in this period.",
    note: "Illustrative LLM usage. The live version aggregates the llmTelemetry collection (recorded at recordLlmCall) over the period.",
    noteLive: "Live data from llmTelemetry for this project over the last 60 days.",
  },
} as const;

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export default function SpendModule({ entries, isLive = false }: { entries: SpendEntry[]; isLive?: boolean }) {
  const t = useT(T);
  const { fmtInt, fmtPct } = useFormatters();
  const [windowDays, setWindowDays] = useState(30);

  const visible = useMemo(() => filterSpend(entries, windowDays), [entries, windowDays]);
  const total = useMemo(() => totals(visible), [visible]);
  const ops = useMemo(() => byOperation(visible), [visible]);
  const models = useMemo(() => byModel(visible), [visible]);
  const maxOpCost = ops.length > 0 ? ops[0].costUsd : 0;

  const windows = [
    { label: t("window7"), days: 7 },
    { label: t("window30"), days: 30 },
    { label: t("windowAll"), days: 0 },
  ];

  function exportCsv() {
    const header = ["operation", t("colCalls"), t("colTokens"), t("colCost")];
    const rows = ops.map((o) => [o.key, String(o.calls), String(o.tokens), o.costUsd.toFixed(4)]);
    downloadText("usage.csv", toCsv(header, rows));
  }

  return (
    <div className="space-y-5">
      {/* window + totals */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="inline-flex overflow-hidden rounded-pill border border-line">
          {windows.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setWindowDays(w.days)}
              className={"px-3 py-1.5 text-xs font-semibold transition-colors " + (windowDays === w.days ? "bg-brand-500/15 text-brand-accent" : "text-muted hover:bg-brand-50")}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={visible.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-2 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300 disabled:opacity-50"
        >
          <Download width={14} height={14} />{t("export")}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label={t("cost")} value={usd(total.costUsd)} />
        <Tile label={t("calls")} value={fmtInt(total.calls)} />
        <Tile label={t("tokens")} value={fmtInt(total.tokens)} />
      </div>

      {visible.length === 0 ? (
        <div className="card px-5 py-10 text-center text-sm text-muted">{t("empty")}</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* by operation — cost-share bars */}
          <div className="card p-5">
            <h3 className="mb-4 text-sm font-semibold text-navy-800">{t("byOperation")}</h3>
            <ul className="space-y-3">
              {ops.map((o) => (
                <li key={o.key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-navy-700">{o.key}</span>
                    <span className="tnum text-navy-800">{usd(o.costUsd)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-pill bg-canvas">
                    <div
                      className="h-full rounded-pill bg-brand-500"
                      style={{ width: `${maxOpCost > 0 ? (o.costUsd / maxOpCost) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* by model — table */}
          <div className="card overflow-hidden">
            <h3 className="border-b border-line px-5 py-3 text-sm font-semibold text-navy-800">{t("byModel")}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2 font-medium">{t("colModel")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("colCalls")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("colCost")}</th>
                  <th className="px-5 py-2 text-right font-medium">{t("colShare")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {models.map((m) => (
                  <tr key={m.key}>
                    <td className="px-5 py-2.5 font-medium text-navy-700">{m.key}</td>
                    <td className="tnum px-3 py-2.5 text-right text-navy-800">{fmtInt(m.calls)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-navy-800">{usd(m.costUsd)}</td>
                    <td className="tnum px-5 py-2.5 text-right text-muted">{fmtPct(costShare(m, total.costUsd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="rounded-lg bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">{isLive ? t("noteLive") : t("note")}</p>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tnum mt-1 text-2xl font-semibold text-navy-800">{value}</p>
    </div>
  );
}
