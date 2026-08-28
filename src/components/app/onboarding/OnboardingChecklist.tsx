"use client";

/** The Start module's onboarding checklist card — the type-aware step list whose
 *  "done" is derived live from the real stores (src/lib/onboarding/progress.ts).
 *
 *  Extracted out of OnboardingModule, which is long-standing 200-LOC debt and may
 *  not grow: ADR-0009 needed one more label here (a self-serve step's CTA says
 *  "open", not "connect"), and the ceiling is enforced, so the card moved instead.
 *  It owns its own `T` table per the colocated-i18n contract (ADR-0006).
 *
 *  Two things it renders that are decisions, not chrome:
 *   • the OPTIONAL badge reads `step.optional` as RESOLVED BY `stepsForType` — a
 *     per-type value, not the shared definition's default — so `channels` shows no
 *     badge for app / content / leadgen and does show one for eshop / local;
 *   • the row CTA branches on `step.selfServe`, because the first step in every
 *     type's list now connects nothing at all. */
import Link from "next/link";
import { ArrowRight, Check } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import type { OnboardingProgress } from "@/lib/onboarding/progress";

const T = {
  cs: {
    title: "Vaše první kroky",
    body: "Začněte kanály zdarma — na ty nepotřebujete žádný účet ani rozpočet. Zbytek jsou připojení: čím víc připojíte, tím přesnější budou čísla i doporučení. Kroky se odškrtnou samy.",
    done: "Hotovo",
    optionalStep: "Volitelné: funguje s ukázkovými daty",
    connect: "Připojit",
    openStep: "Otevřít",
    stepsDone: "{done} / {total} hotovo",
  },
  en: {
    title: "Your first steps",
    body: "Start with the free channels — they need no account and no budget. The rest are connections: the more you connect, the sharper the numbers and advice. Steps tick off on their own.",
    done: "Done",
    optionalStep: "Optional: works with sample data",
    connect: "Connect",
    openStep: "Open",
    stepsDone: "{done} / {total} done",
  },
} as const;

export default function OnboardingChecklist({
  progress,
  /** true once the scan has been applied in THIS session — the scan row ticks off
   *  optimistically, before the next server read confirms it. */
  scanApplied,
}: {
  progress: OnboardingProgress;
  scanApplied: boolean;
}) {
  const project = useProject();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-navy-800">{t("title")}</h3>
          <p className="mt-1 text-sm text-muted">{t("body")}</p>
        </div>
        <span className="pill shrink-0 bg-navy-50 text-muted">
          {t("stepsDone", { done: progress.done, total: progress.total })}
        </span>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {progress.steps.map((s) => {
          const isScan = s.key === "scan";
          const done = isScan ? scanApplied || s.done : s.done;
          return (
            <li key={s.key} className="flex items-center gap-3 py-3">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  done ? "bg-positive-soft text-positive" : "bg-brand-50 text-brand-accent"
                }`}
              >
                {done ? <Check width={16} height={16} /> : <ModuleIcon icon={s.icon} width={16} height={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-navy-800">
                    {L === "en" ? s.labelEn : s.labelCs}
                  </span>
                  {s.optional && !done && (
                    <span className="rounded-pill bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-muted">
                      {t("optionalStep")}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted">{L === "en" ? s.hintEn : s.hintCs}</span>
              </span>
              {done ? (
                <span className="shrink-0 text-xs font-semibold text-positive">{t("done")}</span>
              ) : isScan ? null : (
                <Link
                  href={`/app/${project.id}/${s.to}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                >
                  {t(s.selfServe ? "openStep" : "connect")}
                  <ArrowRight width={13} height={13} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
