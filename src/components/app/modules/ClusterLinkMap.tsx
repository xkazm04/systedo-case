/** Compact hub-and-spoke view of a cluster's internal links: the pillar at the
 *  centre, each supporting article a spoke. A missing or not-yet-publishable link
 *  is coloured coral so silent internal-link debt is visible at a glance.
 *  Presentational + pure — safe in the server component. */
import type { ClusterLinkGraph } from "@/lib/content-engine/compute";

export default function ClusterLinkMap({ graph }: { graph: ClusterLinkGraph }) {
  const { pillar, links, missingLinks } = graph;
  const pillarPublished = pillar?.status === "published";

  return (
    <div className="mt-3 rounded-lg border border-line bg-canvas/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Prolinkování</span>
        {missingLinks > 0 ? (
          <span className="pill bg-coral-soft text-coral-600 tnum">
            {missingLinks} chybí
          </span>
        ) : (
          <span className="pill bg-positive-soft text-positive">propojeno</span>
        )}
      </div>

      <div className="mt-2.5 flex flex-col items-center gap-1.5">
        <span
          className={`rounded-pill px-3 py-1 text-xs font-semibold ${
            pillar ? "bg-brand-600 text-white" : "border border-dashed border-coral-400/50 text-coral-600"
          }`}
        >
          {pillar ? pillar.title : "Chybí pilíř"}
        </span>

        {links.length > 0 && (
          <ul className="mt-1 grid w-full gap-1">
            {links.map((l) => {
              // coral = link debt: either the live link is missing, or it can't
              // exist yet because the pillar isn't published.
              const ok = l.linked;
              return (
                <li
                  key={l.from}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                    ok ? "bg-brand-50 text-brand-800" : "bg-coral-soft text-coral-600"
                  }`}
                >
                  <span aria-hidden className="font-mono">
                    {ok ? "──" : "╌╌"}
                  </span>
                  <span className="min-w-0 truncate">{l.from}</span>
                  {!ok && (
                    <span className="ml-auto shrink-0 font-medium">
                      {!l.published ? "nepubl." : !pillarPublished ? "chybí pilíř" : "bez odkazu"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
