"use client";

/** The twin's readiness at a glance: a score and six milestone chips, each showing
 *  complete / partial / empty. Ported from the personas TwinReadinessRibbon —
 *  the one piece of that UI that earns its place here, because an untrained twin
 *  that looks trained is worse than no twin at all. Presentational only. */
import { Check } from "@/components/icons";
import { MILESTONES, milestoneHint, milestoneLabel, type Readiness } from "@/lib/twin/readiness";
import type { SupportedLocale } from "@/lib/format";

const LEVEL_CLASS = {
  complete: "border-positive/40 bg-positive-soft text-positive",
  partial: "border-coral-400/40 bg-coral-soft text-coral-600",
  empty: "border-line bg-canvas text-muted",
} as const;

export default function ReadinessRibbon({
  readiness,
  locale,
}: {
  readiness: Readiness;
  locale: SupportedLocale;
}) {
  const label = locale === "en" ? "Twin readiness" : "Připravenost twinu";
  const byMilestone = new Map(readiness.milestones.map((m) => [m.milestone, m.level]));

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-navy-50" aria-hidden>
            <span
              className="block h-full rounded-full bg-brand-500 transition-[width] duration-500"
              style={{ width: `${readiness.score}%` }}
            />
          </span>
          <span className="tnum text-sm font-semibold text-navy-800">{readiness.score} %</span>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {MILESTONES.map((m) => {
          const level = byMilestone.get(m) ?? "empty";
          return (
            <li key={m}>
              <span
                title={milestoneHint(m, locale)}
                className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold ${LEVEL_CLASS[level]}`}
              >
                {level === "complete" ? (
                  <Check width={12} height={12} />
                ) : (
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${level === "partial" ? "bg-coral-500" : "bg-navy-200"}`}
                  />
                )}
                {milestoneLabel(m, locale)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
