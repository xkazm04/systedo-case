import { ArrowRight, Clock, TrendDown, TrendUp } from "@/components/icons";
import type { ChangesSummary } from "@/lib/campaigns/types";
import { fmtCZK, fmtMultiple, fmtRelative, fmtSignedPct } from "@/lib/format";

const KIND_LABEL = { added: "nová kampaň", removed: "odebraná", changed: "změněná" } as const;

/** "What changed since the last sync" — diff of the two most recent snapshots.
 *  Gives the portfolio a time dimension the destructive sync used to throw away. */
export default function ChangeStrip({ changes }: { changes: ChangesSummary }) {
  const { since, added, removed, changed, items } = changes;
  const parts: string[] = [];
  if (added) parts.push(`${added} nových`);
  if (removed) parts.push(`${removed} odebraných`);
  if (changed) parts.push(`${changed} změněných`);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Clock width={16} height={16} className="text-brand-600" />
          Co se změnilo od posledního načtení
        </h2>
        <span className="text-xs text-muted">
          {parts.length ? parts.join(" · ") : "beze změn"} · před {fmtRelative(since)}
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
                      ROAS {fmtMultiple(it.roasBefore)}
                      <ArrowRight width={11} height={11} aria-hidden />
                      {fmtMultiple(it.roasAfter)}
                    </>
                  ) : (
                    KIND_LABEL[it.kind]
                  )}
                </span>
              </span>
              <span
                className={`tnum inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${
                  valueUp ? "text-positive" : "text-negative"
                }`}
                title="Změna hodnoty konverzí vs. minulá synchronizace"
              >
                {valueUp ? <TrendUp width={13} height={13} /> : <TrendDown width={13} height={13} />}
                {it.kind === "changed"
                  ? fmtSignedPct(it.valueDelta)
                  : fmtCZK(it.kind === "added" ? it.costAfter : it.costBefore)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
