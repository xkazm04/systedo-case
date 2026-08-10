"use client";

/** Activity — a project-wide timeline of what every module (and the AI) did:
 *  filter by module / severity / window, export to CSV. The account-level view
 *  generalizing the campaigns activity feed (consolidation phase 6 / account
 *  epic). Event titles are localized from a template key + params. */
import { useMemo, useState } from "react";
import { Download } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { interpolate } from "@/lib/i18n/interpolate";
import { MODULES, moduleLabel } from "@/lib/projects/modules";
import type { ActivityEvent, ActivitySeverity } from "@/lib/activity/sample";
import { activeModules, activityCsvRows, filterActivity, severityCounts, type ActivityFilter } from "@/lib/activity/compute";
import { ACTIVITY_TEMPLATES } from "@/lib/activity/templates";
import { toCsv, downloadText } from "@/lib/export";

const T = {
  cs: {
    info: "Info", success: "Úspěch", warning: "Varování", critical: "Kritické",
    all: "Vše", export: "Exportovat CSV", empty: "Žádná aktivita neodpovídá filtru.",
    window7: "7 dní", window30: "30 dní", windowAll: "Vše",
    today: "dnes", daysAgo: "před {n} dny",
    actorAi: "AI", actorSystem: "Systém", actorYou: "Vy",
    colWhen: "Kdy", colModule: "Modul", colSeverity: "Závažnost", colEvent: "Událost",
    colSimulated: "Simulováno",
    simulated: "Simulované publikování",
    simulatedTitle: "Obsah opustil aplikaci, ale nedorazil na živou platformu (demo napojení).",
    filterModule: "Filtrovat podle modulu",
    filterSeverity: "Filtrovat podle závažnosti",
    filterWindow: "Filtrovat podle období",
    summary: "Zobrazeno {n} událostí: {success} úspěch, {info} info, {warning} varování, {critical} kritické.",
    footer: "Ilustrativní aktivita napříč moduly. Živá verze čte feed tenantu (recordActivity z každé změny, synchronizace a upozornění).",
    footerLive: "Živá aktivita tohoto projektu (recordActivity z každé změny, synchronizace a upozornění).",
  },
  en: {
    info: "Info", success: "Success", warning: "Warning", critical: "Critical",
    all: "All", export: "Export CSV", empty: "No activity matches the filter.",
    window7: "7 days", window30: "30 days", windowAll: "All",
    today: "today", daysAgo: "{n} days ago",
    actorAi: "AI", actorSystem: "System", actorYou: "You",
    colWhen: "When", colModule: "Module", colSeverity: "Severity", colEvent: "Event",
    colSimulated: "Simulated",
    simulated: "Simulated publishing",
    simulatedTitle: "The content left the app but never reached a live platform (demo connection).",
    filterModule: "Filter by module",
    filterSeverity: "Filter by severity",
    filterWindow: "Filter by period",
    summary: "Showing {n} events: {success} success, {info} info, {warning} warning, {critical} critical.",
    footer: "Illustrative activity across modules. The live version reads the tenant feed (recordActivity from every change, sync and alert).",
    footerLive: "Live activity for this project (recordActivity from every change, sync and alert).",
  },
} as const;

const DOT: Record<ActivitySeverity, string> = {
  info: "bg-navy-400",
  success: "bg-positive",
  warning: "bg-coral-500",
  critical: "bg-negative",
};

export default function ActivityModule({ events, isLive = false }: { events: ActivityEvent[]; isLive?: boolean }) {
  const t = useT(T);
  const { locale } = useLocale();
  const [filter, setFilter] = useState<ActivityFilter>({ module: "all", severity: "all", windowDays: 30 });

  const modules = useMemo(() => activeModules(events), [events]);
  const visible = useMemo(() => filterActivity(events, filter), [events, filter]);
  const counts = useMemo(() => severityCounts(visible), [visible]);

  const tmpl = ACTIVITY_TEMPLATES[locale === "en" ? "en" : "cs"];
  const title = (e: ActivityEvent) =>
    e.text ?? interpolate(tmpl[e.tmpl] ?? e.tmpl, e.params as Record<string, string | number>);
  const rel = (d: number) => (d <= 0 ? t("today") : t("daysAgo", { n: d }));
  const modLabel = (key: string) => {
    const m = MODULES.find((x) => x.key === key);
    return m ? moduleLabel(m, locale) : key;
  };
  const sevLabel = (s: ActivitySeverity) => t(s);
  const actorLabel = (a: ActivityEvent["actor"]) => (a === "ai" ? t("actorAi") : a === "you" ? t("actorYou") : t("actorSystem"));

  function exportCsv() {
    const header = [t("colWhen"), t("colModule"), t("colSeverity"), t("colEvent"), t("colSimulated")];
    const rows = activityCsvRows(visible, {
      when: rel, module: modLabel, severity: sevLabel, title, simulated: t("simulated"),
    });
    downloadText("activity.csv", toCsv(header, rows));
  }

  const windows: { label: string; days: number }[] = [
    { label: t("window7"), days: 7 },
    { label: t("window30"), days: 30 },
    { label: t("windowAll"), days: 0 },
  ];
  const severities: (ActivitySeverity | "all")[] = ["all", "success", "info", "warning", "critical"];

  return (
    <div className="space-y-5">
      {/* summary — the tiles are silent to a screen reader when a filter rewrites
          them (four bare numbers, no relationship announced), so one polite live
          region states the whole rollup after every filter change. */}
      <div className="flex flex-wrap items-center gap-6">
        <Sum label={t("success")} value={counts.success} dot="bg-positive" />
        <Sum label={t("info")} value={counts.info} dot="bg-navy-400" />
        <Sum label={t("warning")} value={counts.warning} dot="bg-coral-500" />
        <Sum label={t("critical")} value={counts.critical} dot="bg-negative" />
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {t("summary", { n: visible.length, ...counts })}
      </p>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={t("filterModule")}
          value={filter.module}
          onChange={(e) => setFilter((f) => ({ ...f, module: e.target.value }))}
          className="rounded-pill border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none"
        >
          <option value="all">{t("all")}</option>
          {modules.map((m) => (
            <option key={m} value={m}>{modLabel(m)}</option>
          ))}
        </select>
        {/* Toggle groups, not free-standing buttons: role="group" + a label names
            what the set filters, aria-pressed states which one is active (the
            ProjectSettings pattern) — without them the active filter was carried by
            colour alone. */}
        <div role="group" aria-label={t("filterSeverity")} className="inline-flex overflow-hidden rounded-pill border border-line">
          {severities.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter.severity === s}
              onClick={() => setFilter((f) => ({ ...f, severity: s }))}
              className={"px-3 py-1.5 text-xs font-semibold transition-colors " + (filter.severity === s ? "bg-brand-500/15 text-brand-accent" : "text-muted hover:bg-brand-50")}
            >
              {s === "all" ? t("all") : sevLabel(s)}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t("filterWindow")} className="inline-flex overflow-hidden rounded-pill border border-line">
          {windows.map((w) => (
            <button
              key={w.days}
              type="button"
              aria-pressed={filter.windowDays === w.days}
              onClick={() => setFilter((f) => ({ ...f, windowDays: w.days }))}
              className={"px-3 py-1.5 text-xs font-semibold transition-colors " + (filter.windowDays === w.days ? "bg-brand-500/15 text-brand-accent" : "text-muted hover:bg-brand-50")}
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

      {/* timeline */}
      <div className="card overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{t("empty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + DOT[e.severity]} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-navy-800">{title(e)}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-pill bg-navy-50 px-1.5 py-0.5 font-medium text-navy-700">{modLabel(e.module)}</span>
                    {/* A simulated publish is NOT a real one: the asset left the panel
                        but never reached a live platform. Same wording as the posts
                        list, so one event reads the same wherever it surfaces. */}
                    {e.simulated && (
                      <span
                        className="rounded-pill bg-coral-50 px-1.5 py-0.5 font-medium text-coral-700"
                        title={t("simulatedTitle")}
                      >
                        {t("simulated")}
                      </span>
                    )}
                    <span>· {actorLabel(e.actor)}</span>
                    <span>· {rel(e.daysAgo)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line px-5 py-3 text-xs text-muted">{isLive ? t("footerLive") : t("footer")}</div>
      </div>
    </div>
  );
}

function Sum({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        <span className={"h-2 w-2 rounded-full " + dot} aria-hidden />{label}
      </p>
      <p className="tnum mt-1 text-2xl font-semibold text-navy-800">{value}</p>
    </div>
  );
}
