"use client";

/** The canvas without the canvas — the keyboard (and screen-reader) route to
 *  everything the pointer can do on it.
 *
 *  Every cluster is a real focusable button that expands it; every dot of the
 *  expanded cluster is a row carrying the SAME two actions the hover card offers.
 *  The lasso has no keyboard twin (a marquee is inherently a pointer gesture), so
 *  its RESULT is reachable here instead: the whole cluster opens in the table. */
import { Button } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { ClusterAgg, LandscapePoint } from "@/lib/leads/landscape";
import { STAGE_T } from "../copy";
import { SLA_COLOR, SLA_T } from "./labels";

const T = {
  cs: {
    heading: "Shluky",
    people: "Jednotlivci ve shluku",
    expand: "Rozbalit shluk {label}",
    contacts: "{n} kontaktů",
    open: "Otevřít",
    reply: "Odpovědět",
    unnamed: "Bez jména",
    more: "+{n} dalších nad limitem shluku",
    loading: "Načítám…",
    listCap: "Seznam ukazuje prvních {n}; zbytek otevřete v tabulce.",
  },
  en: {
    heading: "Clusters",
    people: "Individuals in the cluster",
    expand: "Expand cluster {label}",
    contacts: "{n} contacts",
    open: "Open",
    reply: "Reply",
    unnamed: "Unnamed",
    more: "+{n} more beyond the cluster cap",
    loading: "Loading…",
    listCap: "The list shows the first {n}; open the table for the rest.",
  },
} as const;

/** How many dots the keyboard list renders. A 400-row list is not a keyboard
 *  affordance, it is a second table — the rest is one button away in the real one. */
const LIST_CAP = 40;

export default function ClusterList({
  clusters,
  labelOf,
  focusKey,
  points,
  truncated,
  loading,
  onExpand,
  onOpen,
  onReply,
}: {
  clusters: readonly ClusterAgg[];
  labelOf: (key: string) => string;
  focusKey: string | null;
  points: readonly LandscapePoint[];
  truncated: number;
  loading: boolean;
  onExpand: (key: string) => void;
  onOpen: (p: LandscapePoint) => void;
  onReply: (p: LandscapePoint) => void;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const sla = useT(SLA_T);
  const { fmtInt } = useFormatters();
  const shown = points.slice(0, LIST_CAP);

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h3 className="text-xs font-semibold text-ink">{t("heading")}</h3>
        <ul className="mt-2 space-y-1">
          {clusters.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                aria-pressed={c.key === focusKey}
                aria-label={t("expand", { label: labelOf(c.key) })}
                onClick={() => onExpand(c.key)}
                className={`flex w-full items-center justify-between gap-2 rounded-pill px-3 py-1.5 text-left text-xs ${
                  c.key === focusKey ? "bg-brand-50 text-brand-800" : "text-muted hover:text-ink"
                }`}
              >
                <span className="truncate">{labelOf(c.key)}</span>
                <span className="tnum shrink-0">{fmtInt(c.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-ink">{t("people")}</h3>
        {loading ? (
          <p className="mt-2 text-xs text-muted">{t("loading")}</p>
        ) : (
          <>
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
              {shown.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 shrink-0 rounded-pill"
                      style={{ background: SLA_COLOR[p.slaPhase] }}
                    />
                    <span className="truncate text-ink">{p.name || t("unnamed")}</span>
                    <span className="shrink-0 text-muted">
                      {stage(p.stage)} · {sla(p.slaPhase)}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onOpen(p)}>
                      {t("open")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onReply(p)}>
                      {t("reply")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            {points.length > LIST_CAP && (
              <p className="mt-2 text-xs text-muted">{t("listCap", { n: fmtInt(LIST_CAP) })}</p>
            )}
            {truncated > 0 && (
              <p className="tnum mt-1 text-xs text-muted">{t("more", { n: fmtInt(truncated) })}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
