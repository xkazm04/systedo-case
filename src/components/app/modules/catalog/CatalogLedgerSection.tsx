"use client";

/** Katalog — the CHANGE LEDGER timeline (WP W1-A). Reads the project's durable,
 *  SKU-level catalog events (`GET /catalog/events`) so "what changed in the catalog
 *  on that day" is answerable — the missing half of every "why did ROAS move?".
 *
 *  Reads the LIVE store only; there is no sample fallback, because a fabricated
 *  history would be indistinguishable from a real one. A project that has not been
 *  imported/synced/saved yet gets an honest empty state naming what fills it. */
import { useEffect, useMemo, useState } from "react";
import { Clock, Refresh } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { CatalogEvent, CatalogEventKind } from "@/lib/catalog/events";

const T = {
  cs: {
    title: "Deník změn katalogu",
    lead: "Co se v katalogu opravdu změnilo — po SKU, s časem a zdrojem. Sem se sáhne, když výkon skočí bez zásahu do kampaní.",
    all: "Vše",
    added: "Přidáno", removed: "Vyřazeno", price: "Cena", stock: "Sklad",
    active: "Stav", margin: "Marže", renamed: "Název",
    actorFeed: "Import feedu", actorSync: "Sklad", actorManual: "Ruční úprava",
    empty: "Zatím žádné změny. Objeví se po nejbližším importu feedu, synchronizaci skladu nebo uložení katalogu.",
    emptyFiltered: "Tomuto filtru neodpovídá žádná změna.",
    loading: "Načítám deník změn…",
    failed: "Deník změn se nepodařilo načíst.",
    retry: "Zkusit znovu",
    activeOn: "aktivní", activeOff: "pozastaveno",
    count: "{n} změn v deníku (nejnovější první).",
    filterKind: "Filtrovat podle typu změny",
  },
  en: {
    title: "Catalog change log",
    lead: "What actually changed in the catalog — per SKU, with a timestamp and a source. This is what you read when performance moves and nobody touched the campaigns.",
    all: "All",
    added: "Added", removed: "Removed", price: "Price", stock: "Stock",
    active: "State", margin: "Margin", renamed: "Name",
    actorFeed: "Feed import", actorSync: "Warehouse", actorManual: "Manual edit",
    empty: "No changes yet. They appear after the next feed import, warehouse sync or catalog save.",
    emptyFiltered: "No change matches this filter.",
    loading: "Loading the change log…",
    failed: "The change log could not be loaded.",
    retry: "Try again",
    activeOn: "active", activeOff: "paused",
    count: "{n} changes in the log (newest first).",
    filterKind: "Filter by change type",
  },
} as const;

const KINDS: CatalogEventKind[] = ["added", "removed", "price", "stock", "active", "margin", "renamed"];

const TONE: Record<CatalogEventKind, PillTone> = {
  added: "positive",
  removed: "negative",
  price: "brand",
  stock: "coral",
  active: "navy",
  margin: "brand",
  renamed: "neutral",
};

export default function CatalogLedgerSection({ projectId }: { projectId: string }) {
  const t = useT(T);
  const { fmtDateTime, fmtCZK } = useFormatters();
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<CatalogEventKind | "all">("all");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setFailed(false);
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/catalog/events`);
        const json = (await res.json()) as { ok?: boolean; events?: CatalogEvent[] };
        if (cancelled) return;
        if (!json.ok) {
          setFailed(true);
          setEvents([]);
          return;
        }
        setEvents(json.events ?? []);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reload]);

  // Only the kinds this project actually produced get a filter chip — an empty
  // "Margin" tab teaches nothing about a catalog whose margins never moved.
  const present = useMemo(() => KINDS.filter((k) => (events ?? []).some((e) => e.kind === k)), [events]);
  const visible = useMemo(
    () => (kind === "all" ? (events ?? []) : (events ?? []).filter((e) => e.kind === kind)),
    [events, kind]
  );

  const actorLabel = (e: CatalogEvent) =>
    e.actor === "feed-import"
      ? t("actorFeed")
      : e.actor === "warehouse-sync"
        ? `${t("actorSync")}${e.provider ? ` · ${e.provider}` : ""}`
        : t("actorManual");

  /** In the field's own units — a bare pair makes 0.32 → 0.41 (a margin) read as CZK. */
  const value = (e: CatalogEvent, v: CatalogEvent["before"]): string => {
    if (v == null) return "—";
    if (typeof v === "boolean") return v ? t("activeOn") : t("activeOff");
    if (typeof v === "string") return v;
    if (e.kind === "margin") return `${Math.round(v * 1000) / 10} %`;
    if (e.kind === "price" || e.kind === "added" || e.kind === "removed") return fmtCZK(v);
    return String(v);
  };

  const delta = (e: CatalogEvent) =>
    e.kind === "added" || e.kind === "removed"
      ? value(e, e.kind === "added" ? e.after : e.before)
      : `${value(e, e.before)} → ${value(e, e.after)}`;

  return (
    <section className="stagger space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Clock width={18} height={18} aria-hidden />
          {t("title")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("lead")}</p>
      </div>

      {present.length > 0 && (
        <div role="group" aria-label={t("filterKind")} className="inline-flex flex-wrap overflow-hidden rounded-pill border border-line">
          {(["all", ...present] as (CatalogEventKind | "all")[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={
                "px-3 py-1.5 text-xs font-semibold transition-colors " +
                (kind === k ? "bg-brand-500/15 text-brand-accent" : "text-muted hover:bg-brand-50")
              }
            >
              {t(k)}
            </button>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        {events === null ? (
          <p className="px-5 py-10 text-center text-sm text-muted">{t("loading")}</p>
        ) : failed ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted">{t("failed")}</p>
            <button
              type="button"
              onClick={() => setReload((r) => r + 1)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors hover:border-brand-300"
            >
              <Refresh width={14} height={14} aria-hidden />
              {t("retry")}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {events.length === 0 ? t("empty") : t("emptyFiltered")}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {visible.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5">
                  <Pill tone={TONE[e.kind]}>{t(e.kind)}</Pill>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={e.name}>
                    {e.name}
                  </span>
                  <span className="tnum text-sm text-ink">{delta(e)}</span>
                  <span className="w-full text-xs text-muted sm:w-auto">
                    {e.key} · {actorLabel(e)} · {fmtDateTime(e.at)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-5 py-3 text-xs text-muted" role="status" aria-live="polite">
              {t("count", { n: visible.length })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
