"use client";

/** One row of the visibility plan: the chain query → obsah → kanál, the ONE step
 *  that moves it this week, and where that step is done. Empty legs render as an
 *  explicit "zatím nic" rather than being hidden — the whole point of the artifact
 *  is that a maker can see which half of their plan does not exist yet. */
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { useProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { ProjectType } from "@/lib/projects/types";
import type {
  PlanLegProvenance,
  VisibilityRow,
  VisibilityStep,
} from "@/lib/organic-channels/visibility-plan";

const T = {
  cs: {
    publish: "Publikovat",
    finishDraft: "Dopsat",
    writeBrief: "Napsat",
    firstAction: "Zapsat se",
    done: "Hotovo",
    ctaPublish: "Na kanál",
    ctaDraft: "Do enginu",
    ctaBrief: "Napsat brief",
    ctaChannel: "Na kanál",
    noQuery: "zatím bez dotazu",
    noContent: "zatím bez obsahu",
    provSeeded: "Ukázka",
    provAi: "AI",
    provUser: "Vaše data",
    measured: "{n} kliknutí",
    measuredTitle: "Změřeno na vašich odkazech /go za 30 dní.",
  },
  en: {
    publish: "Publish",
    finishDraft: "Finish",
    writeBrief: "Write",
    firstAction: "Get listed",
    done: "Done",
    ctaPublish: "To the channel",
    ctaDraft: "To the engine",
    ctaBrief: "Write the brief",
    ctaChannel: "To the channel",
    noQuery: "no query yet",
    noContent: "no content yet",
    provSeeded: "Sample",
    provAi: "AI",
    provUser: "Your data",
    measured: "{n} clicks",
    measuredTitle: "Measured on your own /go links over 30 days.",
  },
} as const;

type Key = keyof (typeof T)["cs"];

/** Per step: its badge label + tone, the module the step is actually done in, and
 *  the CTA that goes there. `done` has no destination — the work is finished. */
const STEP_META: Record<
  VisibilityStep,
  { label: Key; cta: Key; tone: string; to: string | null }
> = {
  publish: { label: "publish", cta: "ctaPublish", tone: "bg-positive-soft text-positive", to: "kanaly" },
  "finish-draft": { label: "finishDraft", cta: "ctaDraft", tone: "bg-brand-50 text-brand-700", to: "obsahovy-engine" },
  "write-brief": { label: "writeBrief", cta: "ctaBrief", tone: "bg-brand-50 text-brand-700", to: "obsahovy-engine" },
  "first-action": { label: "firstAction", cta: "ctaChannel", tone: "bg-coral-soft text-coral-600", to: "kanaly" },
  done: { label: "done", cta: "done", tone: "bg-navy-50 text-muted", to: null },
};

const PROVENANCE_META: Record<PlanLegProvenance, { label: Key; tone: string }> = {
  seeded: { label: "provSeeded", tone: "bg-navy-50 text-muted" },
  ai: { label: "provAi", tone: "bg-brand-50 text-brand-700" },
  user: { label: "provUser", tone: "bg-positive-soft text-positive" },
};

export default function VisibilityPlanRow({
  row,
  projectType,
  current,
}: {
  row: VisibilityRow;
  projectType: ProjectType;
  /** the module key of the page rendering the card — its own link is dropped */
  current: string;
}) {
  const project = useProject();
  const t = useT(T);
  const step = STEP_META[row.step];
  const prov = PROVENANCE_META[row.provenance];
  const to = step.to && step.to !== current && isModuleAvailable(projectType, step.to) ? step.to : null;

  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-canvas px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <span className={`pill shrink-0 ${step.tone}`}>{t(step.label)}</span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-relaxed">
          <span className={row.query ? "font-medium text-navy-800" : "text-muted"}>
            {row.query ? row.query.query : t("noQuery")}
          </span>
          <ArrowRight aria-hidden width={12} height={12} className="shrink-0 text-line" />
          <span className={row.content ? "text-navy-700" : "text-muted"}>
            {row.content ? row.content.title : t("noContent")}
          </span>
          <ArrowRight aria-hidden width={12} height={12} className="shrink-0 text-line" />
          <span className="font-medium text-navy-800">{row.channel.name}</span>
        </span>
        {row.channel.firstAction && (
          <span className="mt-0.5 block truncate text-xs text-muted">{row.channel.firstAction}</span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {/* Measured clicks, when there are any — beside the provenance chip, because
            it IS a provenance statement: this row's channel has real numbers. */}
        {row.measuredClicks ? (
          <span className="pill bg-brand-50 text-brand-700" title={t("measuredTitle")}>
            {t("measured", { n: row.measuredClicks })}
          </span>
        ) : null}
        <span className={`pill ${prov.tone}`}>{t(prov.label)}</span>
        {to && (
          <Link
            href={`/app/${project.id}/${to}?from=plan-viditelnosti`}
            className="group inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            {t(step.cta)}
            <ArrowRight
              width={13}
              height={13}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        )}
      </span>
    </li>
  );
}
