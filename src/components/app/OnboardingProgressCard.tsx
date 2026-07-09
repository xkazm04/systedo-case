/** The onboarding progress card shown atop a project's overview until every setup
 *  step is done (or the user dismisses it). Server component — it resolves the live
 *  step status (scan applied, catalog saved, Ads linked, ranks imported, channels
 *  started) and renders a compact prompt back into the Start module. Authed surfaces
 *  only (the demo overview is the multi-project portfolio, which doesn't mount it). */
import Link from "next/link";
import { ArrowRight, Sparkles } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { resolveOnboardingProgress } from "@/lib/onboarding/progress";
import type { Project } from "@/lib/projects/types";
import DismissOnboarding from "./DismissOnboarding";

const T = {
  cs: {
    title: "Dokončete nastavení projektu",
    body: "Naplňte aplikaci vaší firmou a připojte data — {done} z {total} kroků hotovo.",
    next: "Další krok: {label}",
    continue: "Pokračovat",
    dismiss: "Skrýt",
  },
  en: {
    title: "Finish setting up your project",
    body: "Seed the app with your business and connect your data — {done} of {total} steps done.",
    next: "Next: {label}",
    continue: "Continue",
    dismiss: "Hide",
  },
} as const;

export default async function OnboardingProgressCard({
  project,
  userId,
}: {
  project: Project;
  userId: string | null;
}) {
  const progress = await resolveOnboardingProgress(project, userId);
  if (progress.complete || progress.dismissed) return null;

  const t = await getT(T);
  const locale = await getServerLocale();
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const nextStep = progress.steps.find((s) => !s.done);
  const nextLabel = nextStep ? (locale === "en" ? nextStep.labelEn : nextStep.labelCs) : "";

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <div className="flex flex-col gap-4 rounded-card border border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
            <Sparkles width={20} height={20} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-navy-800">{t("title")}</h3>
            <p className="mt-0.5 text-sm text-muted">
              {t("body", { done: progress.done, total: progress.total })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 w-40 overflow-hidden rounded-full bg-brand-100" aria-hidden>
                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
              </span>
              {nextLabel && <span className="text-xs text-muted">{t("next", { label: nextLabel })}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/app/${project.id}/start`}
            className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            {t("continue")}
            <ArrowRight width={15} height={15} />
          </Link>
          <DismissOnboarding projectId={project.id} label={t("dismiss")} />
        </div>
      </div>
    </div>
  );
}
