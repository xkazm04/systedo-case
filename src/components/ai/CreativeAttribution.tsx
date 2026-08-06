"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useOptionalProject } from "@/lib/projects/context";
import { Sparkles, Close, Bulb } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { IMAGE_STYLES, imageStyleLabel, type ImageStyle } from "@/lib/images/types";
import { optimisticDelete } from "@/lib/optimistic-delete";
import type { CreativeLink, CreativeMetrics, StyleStat, StylePrior } from "@/lib/images/attribution-types";

const T = {
  cs: {
    sectionHeading: "Výkon kreativ podle stylu",
    priorPrefix: "Aktivní styl prior:",
    priorSuffix: " Příští generování tuto preferenci automaticky zohlední.",
    thStyle: "Styl",
    thCreatives: "Kreativ",
    thAvgScore: "Ø skóre",
    thCost: "Náklady",
    thRoas: "ROAS",
    bestBadge: "nejlepší",
    recordSummary: "Zaznamenat výkon kreativy",
    fieldStyle: "Styl",
    fieldCampaign: "Kampaň (volitelné)",
    campaignPlaceholder: "Brand · Search",
    metricImpressions: "Imprese",
    metricClicks: "Prokliky",
    metricConversions: "Konverze",
    metricCost: "Náklady (Kč)",
    metricConvValue: "Hodnota (Kč)",
    savePerf: "Uložit výkon",
    saving: "Ukládám…",
    recordFailed: "Zaznamenání výkonu se nezdařilo. Zadané hodnoty zůstaly ve formuláři. Zkuste to prosím znovu.",
    deleteRecordAriaLabel: "Smazat záznam",
    impressionsSuffix: " impresí",
    roasLabel: "ROAS",
    sessionExpired: "Vaše přihlášení vypršelo. Přihlaste se znovu pro zobrazení atribuce kreativ.",
  },
  en: {
    sectionHeading: "Creative performance by style",
    priorPrefix: "Active style prior:",
    priorSuffix: " The next generation will automatically apply this preference.",
    thStyle: "Style",
    thCreatives: "Creatives",
    thAvgScore: "Avg score",
    thCost: "Cost",
    thRoas: "ROAS",
    bestBadge: "best",
    recordSummary: "Record creative performance",
    fieldStyle: "Style",
    fieldCampaign: "Campaign (optional)",
    campaignPlaceholder: "Brand · Search",
    metricImpressions: "Impressions",
    metricClicks: "Clicks",
    metricConversions: "Conversions",
    metricCost: "Cost (CZK)",
    metricConvValue: "Value (CZK)",
    savePerf: "Save performance",
    saving: "Saving…",
    recordFailed: "Recording performance failed. Your values are still in the form. Please try again.",
    deleteRecordAriaLabel: "Delete record",
    impressionsSuffix: " impressions",
    roasLabel: "ROAS",
    sessionExpired: "Your session has expired. Sign in again to see creative attribution.",
  },
} as const;

const EMPTY_METRICS: CreativeMetrics = { impressions: 0, clicks: 0, conversions: 0, cost: 0, convValue: 0 };

/** Creative→revenue attribution: which visual styles actually earn, distilled into
 *  a style prior that biases the next generation. Anonymous → hidden. */
export default function CreativeAttribution() {
  const t = useT(T);
  const fmt = useFormatters();
  const { locale } = useLocale();
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [links, setLinks] = useState<CreativeLink[]>([]);
  const [leaderboard, setLeaderboard] = useState<StyleStat[]>([]);
  const [prior, setPrior] = useState<StylePrior>({ style: null, hint: "" });
  const [loaded, setLoaded] = useState(false);
  // false only when the server reports the session is gone (mid-session expiry):
  // lets us show a sign-in prompt instead of a false "no creatives yet" empty state.
  const [signedIn, setSignedIn] = useState(true);
  const [style, setStyle] = useState<ImageStyle>("vibrant");
  const [campaignName, setCampaignName] = useState("");
  const [metrics, setMetrics] = useState<CreativeMetrics>(EMPTY_METRICS);
  const [busy, setBusy] = useState(false);
  // A failed POST used to clear the form and reload regardless, so the metrics the
  // user had just typed in vanished with no message and no way to recover them.
  const [recordError, setRecordError] = useState<string | null>(null);

  const metricFields: { key: keyof CreativeMetrics; label: string }[] = [
    { key: "impressions", label: t("metricImpressions") },
    { key: "clicks", label: t("metricClicks") },
    { key: "conversions", label: t("metricConversions") },
    { key: "cost", label: t("metricCost") },
    { key: "convValue", label: t("metricConvValue") },
  ];

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        pid ? `/api/images/attribution?projectId=${encodeURIComponent(pid)}` : "/api/images/attribution"
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        links?: CreativeLink[];
        leaderboard?: StyleStat[];
        prior?: StylePrior;
        signedIn?: boolean;
      };
      setSignedIn(json.signedIn !== false);
      setLinks(json.links ?? []);
      setLeaderboard(json.leaderboard ?? []);
      setPrior(json.prior ?? { style: null, hint: "" });
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, [pid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  const record = async () => {
    setBusy(true);
    setRecordError(null);
    try {
      const res = await fetch("/api/images/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, campaignName, metrics, prompt: "", projectId: pid }),
      });
      // Only clear the form once the server actually took the record — otherwise
      // the user loses hand-entered spend/revenue figures to a 4xx they never saw.
      if (!res.ok) {
        setRecordError(t("recordFailed"));
        return;
      }
      setMetrics(EMPTY_METRICS);
      setCampaignName("");
      await load();
    } catch {
      setRecordError(t("recordFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (linkId: string) => {
    // Optimistic remove, but snapshot first so a failed/offline DELETE rolls the
    // row back instead of leaving a ghost deletion the next reload resurrects.
    const prev = links;
    setLinks((p) => p.filter((l) => l.id !== linkId));
    await optimisticDelete(
      () =>
        fetch("/api/images/attribution", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkId, projectId: pid }),
        }),
      () => setLinks(prev),
      load
    );
  };

  if (status !== "authenticated" || !loaded) return null;

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles width={16} height={16} className="text-brand-accent" />
        <h3 className="text-base font-semibold text-navy-800">{t("sectionHeading")}</h3>
      </div>

      {!signedIn && (
        <div className="rounded-card border border-line bg-surface-muted px-4 py-3 text-sm text-muted">
          {t("sessionExpired")}
        </div>
      )}

      {prior.hint && (
        <div className="flex items-start gap-2 rounded-card border border-brand-200 bg-brand-50 px-4 py-3">
          <Bulb width={16} height={16} className="mt-0.5 shrink-0 text-brand-accent" />
          <p className="text-sm text-navy-800">
            <span className="font-semibold">{t("priorPrefix")}</span> {prior.hint}{t("priorSuffix")}
          </p>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">{t("thStyle")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("thCreatives")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("thAvgScore")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("thCost")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("thRoas")}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((s, i) => (
                <tr key={s.style} className={`border-b border-line/60 ${i === 0 ? "bg-positive-soft/30" : ""}`}>
                  <td className="px-4 py-2.5 font-medium text-navy-800">
                    {/* `s.label` is the cs name the style-prior PROMPT is built
                        from; the table renders the reader's locale instead. */}
                    {imageStyleLabel(s.style, locale)}
                    {i === 0 && s.totalCost > 0 && (
                      <span className="ml-2 pill bg-positive-soft text-positive">{t("bestBadge")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tnum text-muted">{s.count}</td>
                  <td className="px-4 py-2.5 text-right tnum text-muted">
                    {s.avgVisionScore != null ? fmt.fmtDecimal(s.avgVisionScore, 1) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tnum text-muted">{fmt.fmtCZK(s.totalCost)}</td>
                  <td className="px-4 py-2.5 text-right tnum font-semibold text-navy-800">
                    {s.totalCost > 0 ? fmt.fmtMultiple(s.roas) : "—"}
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
          {t("recordSummary")}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted">
            {t("fieldStyle")}
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as ImageStyle)}
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
            >
              {IMAGE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {imageStyleLabel(s, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            {t("fieldCampaign")}
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder={t("campaignPlaceholder")}
              className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
            />
          </label>
          {metricFields.map((f) => (
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
          className="mt-3 rounded-pill bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {busy ? t("saving") : t("savePerf")}
        </button>
        {recordError && (
          <p role="alert" className="mt-2 text-sm text-negative">
            {recordError}
          </p>
        )}
      </details>

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-navy-800">{imageStyleLabel(l.style, locale)}</span>
                {l.campaignName && <span className="ml-2 text-xs text-muted">{l.campaignName}</span>}
                {l.metrics && (
                  <span className="ml-2 text-xs text-muted">
                    {fmt.fmtInt(l.metrics.impressions)}{t("impressionsSuffix")} · {t("roasLabel")}{" "}
                    {l.metrics.cost > 0 ? fmt.fmtMultiple(l.metrics.convValue / l.metrics.cost) : "—"}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(l.id)}
                aria-label={t("deleteRecordAriaLabel")}
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
