import { ArrowRight, Clock, TrendDown, TrendUp } from "@/components/icons";
import type { ChangesSummary } from "@/lib/campaigns/types";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    heading: "Co se změnilo od posledního načtení",
    noChanges: "beze změn",
    added: "{n} nových",
    removed: "{n} odebraných",
    changed: "{n} změněných",
    sinceSuffix: "před {rel}",
    kindAdded: "nová kampaň",
    kindRemoved: "odebraná",
    valueDeltaTitle: "Změna hodnoty konverzí vs. minulá synchronizace",
  },
  en: {
    heading: "What changed since the last sync",
    noChanges: "no changes",
    added: "{n} new",
    removed: "{n} removed",
    changed: "{n} changed",
    sinceSuffix: "{rel} ago",
    kindAdded: "new campaign",
    kindRemoved: "removed",
    valueDeltaTitle: "Change in conversion value vs. previous sync",
  },
} as const;

/** "What changed since the last sync" — diff of the two most recent snapshots.
 *  Gives the portfolio a time dimension the destructive sync used to throw away. */
export default async function ChangeStrip({ changes }: { changes: ChangesSummary }) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  const { since, added, removed, changed, items } = changes;
  const parts: string[] = [];
  if (added) parts.push(t("added", { n: added }));
  if (removed) parts.push(t("removed", { n: removed }));
  if (changed) parts.push(t("changed", { n: changed }));

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Clock width={16} height={16} className="text-brand-600" />
          {t("heading")}
        </h2>
        <span className="text-xs text-muted">
          {parts.length ? parts.join(" · ") : t("noChanges")} · {t("sinceSuffix", { rel: fmt.fmtRelative(since) })}
        </span>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((it) => {
          const valueUp = it.valueDelta >= 0;
          return (
            <li
              key={it.campaignId}
              className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-navy-800">{it.name}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  {it.kind === "changed" ? (
                    <>
                      ROAS {fmt.fmtMultiple(it.roasBefore)}
                      <ArrowRight width={11} height={11} aria-hidden />
                      {fmt.fmtMultiple(it.roasAfter)}
                    </>
                  ) : (
                    t(it.kind === "added" ? "kindAdded" : "kindRemoved")
                  )}
                </span>
              </span>
              <span
                className={`tnum inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${
                  valueUp ? "text-positive" : "text-negative"
                }`}
                title={t("valueDeltaTitle")}
              >
                {valueUp ? <TrendUp width={13} height={13} /> : <TrendDown width={13} height={13} />}
                {it.kind === "changed"
                  ? fmt.fmtSignedPct(it.valueDelta)
                  : fmt.fmtCZK(it.kind === "added" ? it.costAfter : it.costBefore)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
