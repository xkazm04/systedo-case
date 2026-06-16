"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Sparkles, Close, Bulb } from "@/components/icons";
import { fmtCZK, fmtInt, fmtMultiple } from "@/lib/format";
import { IMAGE_STYLES, IMAGE_STYLE_LABELS, type ImageStyle } from "@/lib/images/types";
import type { CreativeLink, CreativeMetrics, StyleStat, StylePrior } from "@/lib/images/attribution-types";

const EMPTY_METRICS: CreativeMetrics = { impressions: 0, clicks: 0, conversions: 0, cost: 0, convValue: 0 };

const METRIC_FIELDS: { key: keyof CreativeMetrics; label: string }[] = [
  { key: "impressions", label: "Imprese" },
  { key: "clicks", label: "Prokliky" },
  { key: "conversions", label: "Konverze" },
  { key: "cost", label: "Náklady (Kč)" },
  { key: "convValue", label: "Hodnota (Kč)" },
];

/** Creative→revenue attribution: which visual styles actually earn, distilled into
 *  a style prior that biases the next generation. Anonymous → hidden. */
export default function CreativeAttribution() {
  const { status } = useSession();
  const [links, setLinks] = useState<CreativeLink[]>([]);
  const [leaderboard, setLeaderboard] = useState<StyleStat[]>([]);
  const [prior, setPrior] = useState<StylePrior>({ style: null, hint: "" });
  const [loaded, setLoaded] = useState(false);
  const [style, setStyle] = useState<ImageStyle>("vibrant");
  const [campaignName, setCampaignName] = useState("");
  const [metrics, setMetrics] = useState<CreativeMetrics>(EMPTY_METRICS);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/images/attribution");
      if (!res.ok) return;
      const json = (await res.json()) as {
        links?: CreativeLink[];
        leaderboard?: StyleStat[];
        prior?: StylePrior;
      };
      setLinks(json.links ?? []);
      setLeaderboard(json.leaderboard ?? []);
      setPrior(json.prior ?? { style: null, hint: "" });
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  const record = async () => {
    setBusy(true);
    try {
      await fetch("/api/images/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, campaignName, metrics, prompt: "" }),
      });
      setMetrics(EMPTY_METRICS);
      setCampaignName("");
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const remove = async (linkId: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    try {
      await fetch("/api/images/attribution", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  if (status !== "authenticated" || !loaded) return null;

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles width={16} height={16} className="text-brand-accent" />
        <h3 className="text-base font-semibold text-navy-800">Výkon kreativ podle stylu</h3>
      </div>

      {prior.hint && (
        <div className="flex items-start gap-2 rounded-card border border-brand-200 bg-brand-50 px-4 py-3">
          <Bulb width={16} height={16} className="mt-0.5 shrink-0 text-brand-accent" />
          <p className="text-sm text-navy-800">
            <span className="font-semibold">Aktivní styl prior:</span> {prior.hint} Příští generování
            tuto preferenci automaticky zohlední.
          </p>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Styl</th>
                <th className="px-4 py-2.5 text-right font-medium">Kreativ</th>
                <th className="px-4 py-2.5 text-right font-medium">Ø skóre</th>
                <th className="px-4 py-2.5 text-right font-medium">Náklady</th>
                <th className="px-4 py-2.5 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((s, i) => (
                <tr key={s.style} className={`border-b border-line/60 ${i === 0 ? "bg-positive-soft/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-navy-800">
                    {s.label}
                    {i === 0 && s.totalCost > 0 && (
                      <span className="ml-2 pill bg-positive-soft text-positive">nejlepší</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tnum text-muted">{s.count}</td>
                  <td className="px-4 py-2.5 text-right tnum text-muted">
                    {s.avgVisionScore != null ? s.avgVisionScore.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tnum text-muted">{fmtCZK(s.totalCost)}</td>
                  <td className="px-4 py-2.5 text-right tnum font-semibold text-navy-800">
                    {s.totalCost > 0 ? fmtMultiple(s.roas) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* record performance for a creative style */}
      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-accent">
          Zaznamenat výkon kreativy
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted">
            Styl
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as ImageStyle)}
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
            >
              {IMAGE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {IMAGE_STYLE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Kampaň (volitelné)
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="Brand · Search"
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
            />
          </label>
          {METRIC_FIELDS.map((f) => (
            <label key={f.key} className="text-xs font-medium text-muted">
              {f.label}
              <input
                type="number"
                min={0}
                value={metrics[f.key] || ""}
                onChange={(e) =>
                  setMetrics((m) => ({ ...m, [f.key]: Math.max(0, Number(e.target.value) || 0) }))
                }
                className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={record}
          disabled={busy}
          className="mt-3 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? "Ukládám…" : "Uložit výkon"}
        </button>
      </details>

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-navy-800">{IMAGE_STYLE_LABELS[l.style]}</span>
                {l.campaignName && <span className="ml-2 text-xs text-muted">{l.campaignName}</span>}
                {l.metrics && (
                  <span className="ml-2 text-xs text-muted">
                    {fmtInt(l.metrics.impressions)} imprese · ROAS{" "}
                    {l.metrics.cost > 0 ? fmtMultiple(l.metrics.convValue / l.metrics.cost) : "—"}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(l.id)}
                aria-label="Smazat záznam"
                className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-negative-soft hover:text-negative"
              >
                <Close width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
