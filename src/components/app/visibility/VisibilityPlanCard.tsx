"use client";

/** "Jeden plán viditelnosti" — the compact card that packages the three legs of
 *  getting found for free (target queries · the content that answers them · the
 *  free channel it gets seen on) into ONE ordered this-week list.
 *
 *  It renders on BOTH ends of the path — above the channel table on /kanaly and
 *  above the research panel on /klicova-slova — from the same composed plan, so
 *  the two modules can no longer describe the tenant's situation differently. The
 *  footer is the missing wiring itself: the hops between the three modules, in
 *  both directions, minus the page you are already on.
 *
 *  All composition lives in lib/organic-channels/visibility-plan (pure, tested);
 *  this file only labels it. */
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { useProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { ProjectType } from "@/lib/projects/types";
import {
  VISIBILITY_PLAN_MODULES,
  type VisibilityPlan,
} from "@/lib/organic-channels/visibility-plan";
import VisibilityPlanRow from "./VisibilityPlanRow";

const T = {
  cs: {
    title: "Plán viditelnosti",
    intro: "Jeden plán napříč moduly: dotaz, obsah, který na něj odpoví, a kanál, kde vás najdou. Nejbližší kroky nahoře.",
    showing: "{n} z {total} kanálů",
    noQueries: "Nemáte uložená klíčová slova, takže plán zatím vede jen kanály.",
    noContent: "Nemáte uložený žádný brief ani koncept, takže žádný dotaz zatím nemá obsah.",
    noChannels: "Plán kanálů je prázdný.",
    "klicova-slova": "Klíčová slova",
    "obsahovy-engine": "Obsahový engine",
    kanaly: "Kanály zdarma",
    hop: "Otevřít",
  },
  en: {
    title: "Visibility plan",
    intro: "One plan across the modules: the query, the content that answers it, and the channel it gets seen on. Nearest steps first.",
    showing: "{n} of {total} channels",
    noQueries: "You have no saved keywords, so the plan is channels only for now.",
    noContent: "You have no saved brief or draft, so no query has content behind it yet.",
    noChannels: "The channel plan is empty.",
    "klicova-slova": "Keywords",
    "obsahovy-engine": "Content engine",
    kanaly: "Free channels",
    hop: "Open",
  },
} as const;

export default function VisibilityPlanCard({
  plan,
  projectType,
  current,
}: {
  plan: VisibilityPlan;
  projectType: ProjectType;
  /** module key of the page rendering the card — its own hop + CTAs are dropped */
  current: string;
}) {
  const project = useProject();
  const t = useT(T);

  // Honest empties, in the order a maker would fix them. Never both at once: with
  // no queries at all there is trivially no content either, and saying so twice
  // reads as two problems.
  const gap =
    plan.counts.channels === 0
      ? t("noChannels")
      : plan.counts.queries === 0
        ? t("noQueries")
        : plan.counts.content === 0
          ? t("noContent")
          : null;

  const hops = VISIBILITY_PLAN_MODULES.filter(
    (key) => key !== current && isModuleAvailable(projectType, key)
  );

  return (
    <section className="card space-y-3 p-4" aria-labelledby="visibility-plan-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="visibility-plan-title" className="text-sm font-semibold text-navy-800">
          {t("title")}
        </h2>
        {plan.total > 0 && (
          <span className="pill bg-navy-50 text-muted">
            {t("showing", { n: plan.rows.length, total: plan.total })}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted">{t("intro")}</p>

      {gap && (
        <p role="status" className="rounded-card bg-navy-50 px-3 py-2 text-xs leading-relaxed text-muted">
          {gap}
        </p>
      )}

      {plan.rows.length > 0 && (
        <ul className="space-y-2">
          {plan.rows.map((row) => (
            <VisibilityPlanRow key={row.id} row={row} projectType={projectType} current={current} />
          ))}
        </ul>
      )}

      {hops.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {hops.map((key) => (
            <Link
              key={key}
              href={`/app/${project.id}/${key}?from=plan-viditelnosti`}
              className="group inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              {t(key)}
              <ArrowRight
                width={13}
                height={13}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
