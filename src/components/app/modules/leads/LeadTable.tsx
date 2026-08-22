"use client";

/** Variant C — the whole database: search, stage/source filters, bulk actions and
 *  paging, with the detail pane beside it. Search and stage filtering are pushed to
 *  the API (the store owns the scan window); the source filter is applied over the
 *  loaded page, because attribution has no index and inventing one client-side
 *  would silently filter only the rows that happen to be on screen — so the control
 *  says as much in its own label. */
import { useMemo, useState } from "react";
import { Button, Pill } from "@/components/ui";
import { Search } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { interactiveRowProps } from "@/lib/a11y/rowActivation";
import { sourceLabel } from "@/lib/leads/aggregate";
import { isErased, type Contact } from "@/lib/leads/types";
import { PIPELINE_STAGES } from "@/lib/leads/types";
import { STAGE_T, STAGE_TONE } from "./copy";
import type { LeadsApi } from "./useLeads";
import LeadBulkBar from "./LeadBulkBar";

const T = {
  cs: {
    search: "Hledat jméno, e-mail, telefon…",
    stageAll: "Fáze: vše",
    sourceAll: "Zdroj: vše",
    thName: "Jméno", thStage: "Fáze", thScore: "Skóre", thSource: "Zdroj", thLast: "Poslední aktivita",
    selectAll: "Vybrat vše na straně",
    select: "Vybrat {name}",
    open: "Otevřít {name}",
    unnamed: "Neznámý kontakt",
    erased: "Smazáno na žádost",
    empty: "Žádné kontakty neodpovídají filtru.",
    emptyAll: "Zatím žádné kontakty. Založte první nebo naimportujte CSV v Integracích.",
    range: "{from}–{to} z {total}",
    rangeFiltered: "{from}–{to} z filtrovaných",
    prev: "Předchozí", next: "Další strana",
    loading: "Načítám…",
  },
  en: {
    search: "Search name, email, phone…",
    stageAll: "Stage: all",
    sourceAll: "Source: all",
    thName: "Name", thStage: "Stage", thScore: "Score", thSource: "Source", thLast: "Last activity",
    selectAll: "Select everything on this page",
    select: "Select {name}",
    open: "Open {name}",
    unnamed: "Unnamed contact",
    erased: "Erased on request",
    empty: "No contacts match the filter.",
    emptyAll: "No contacts yet. Add the first one, or import a CSV under Integrations.",
    range: "{from}–{to} of {total}",
    rangeFiltered: "{from}–{to} of the filtered set",
    prev: "Previous", next: "Next page",
    loading: "Loading…",
  },
} as const;

export default function LeadTable({
  api,
  selectedId,
  onOpen,
}: {
  api: LeadsApi;
  selectedId: string | null;
  onOpen: (c: Contact) => void;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const fmt = useFormatters();
  const source = api.query.source;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** Server-side filter (derived source label). The option list is what this page
   *  shows plus the active value, so a source drilled into from an aggregate view
   *  stays selectable even when none of its rows are on the current page. */
  const sources = useMemo(
    () => [...new Set([...api.contacts.map((c) => sourceLabel(c.attribution)), ...(source ? [source] : [])])].sort(),
    [api.contacts, source]
  );
  const rows = api.contacts;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const from = api.query.offset + 1;
  const to = api.query.offset + rows.length;
  /** With a filter on, the project-wide total is not the size of THIS result set,
   *  so the range is shown without one rather than with a misleading denominator. */
  const filtered = Boolean(api.query.q.trim() || api.query.stage || source);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-pill border border-line px-3.5 py-2">
          <Search width={15} height={15} className="shrink-0 text-muted" />
          <input
            type="search"
            value={api.query.q}
            onChange={(e) => api.setQuery({ q: e.target.value })}
            placeholder={t("search")}
            aria-label={t("search")}
            className="w-full min-w-0 bg-transparent text-sm text-navy-800 outline-none placeholder:text-muted"
          />
        </label>
        <select
          value={api.query.stage}
          onChange={(e) => api.setQuery({ stage: e.target.value as typeof api.query.stage })}
          aria-label={t("stageAll")}
          className="rounded-pill border border-line bg-surface px-3.5 py-2 text-sm text-navy-800"
        >
          <option value="">{t("stageAll")}</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {stage(s)}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => api.setQuery({ source: e.target.value })}
          aria-label={t("sourceAll")}
          className="rounded-pill border border-line bg-surface px-3.5 py-2 text-sm text-navy-800"
        >
          <option value="">{t("sourceAll")}</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <LeadBulkBar
          api={api}
          selected={selected}
          rows={rows}
          onDone={() => {
            setSelected(new Set());
            void api.refresh();
          }}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="w-9 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label={t("selectAll")}
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((c) => c.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2.5">{t("thName")}</th>
              <th className="px-3 py-2.5">{t("thStage")}</th>
              <th className="px-3 py-2.5">{t("thScore")}</th>
              <th className="px-3 py-2.5">{t("thSource")}</th>
              <th className="px-3 py-2.5">{t("thLast")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const name = isErased(c) ? t("erased") : (c.name ?? c.email ?? c.phone ?? t("unnamed"));
              return (
                <tr
                  key={c.id}
                  className={`border-b border-line last:border-b-0 ${
                    selectedId === c.id ? "bg-brand-50" : "hover:bg-navy-50"
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={t("select", { name })}
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                  </td>
                  <td
                    {...interactiveRowProps(() => onOpen(c), t("open", { name }))}
                    className="cursor-pointer px-3 py-3 font-medium text-navy-800"
                  >
                    {name}
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone={STAGE_TONE[c.stage]}>{stage(c.stage)}</Pill>
                  </td>
                  <td className="px-3 py-3">{c.score ? <Pill tone="brand">{c.score.grade}</Pill> : "—"}</td>
                  <td className="px-3 py-3 text-muted">{sourceLabel(c.attribution)}</td>
                  <td className="tnum px-3 py-3 text-muted">{fmt.fmtRelative(c.lastActivityAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {api.loading ? t("loading") : api.query.q || api.query.stage || source ? t("empty") : t("emptyAll")}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
        <span className="tnum text-xs text-muted">
          {filtered
            ? t("rangeFiltered", { from: fmt.fmtInt(rows.length ? from : 0), to: fmt.fmtInt(to) })
            : t("range", {
                from: fmt.fmtInt(rows.length ? from : 0),
                to: fmt.fmtInt(to),
                total: fmt.fmtInt(api.total || rows.length),
              })}
        </span>
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={api.query.offset === 0}
            onClick={() => api.setQuery({ offset: Math.max(0, api.query.offset - api.query.limit) })}
          >
            {t("prev")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!api.hasNext}
            onClick={() => api.setQuery({ offset: api.query.offset + api.query.limit })}
          >
            {t("next")}
          </Button>
        </span>
      </div>
    </div>
  );
}
