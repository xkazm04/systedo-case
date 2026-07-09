"use client";

/** Twin — where the project's communication double is TRAINED.
 *
 *  One job: distil a per-channel voice from real messages the business has sent,
 *  then answer the questions the model says it still can't infer. The twin's other
 *  two halves are their own modules in the Komunikace section, because a tab
 *  switcher buried them: `sprava-kanalu` decides where the twin may speak and how
 *  much rope it gets, `schranka` is the draft→review→send queue. All three read and
 *  write the same blob through `useTwinState`.
 *
 *  The readiness ribbon lives here because training is what moves it. */
import { useMemo } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { Bolt } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import TwinVoiceStudio from "@/components/app/twin/TwinVoiceStudio";
import ReadinessRibbon from "@/components/app/twin/ReadinessRibbon";
import { useTwinState, type TwinSource } from "@/components/app/twin/useTwinState";
import { deriveReadiness, buildGaps, milestoneHint } from "@/lib/twin/readiness";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { TwinState } from "@/lib/twin/types";
import type { ProjectType } from "@/lib/projects/types";

const T = {
  cs: {
    sourceSample: "Nenatrénovaný twin",
    sourceTrained: "Natrénovaný twin",
    intro:
      "Twin je komunikační dvojče vaší firmy. Naučte ho, jak píšete — vložte reálné zprávy a odpovězte na to, co si z nich nedokáže odvodit. V tomto hlase pak píše všude: ve schránce, v sociálních sítích i v distribuci.",
    nextUp: "Další krok",
    untrain: "Vymazat trénink",
    untraining: "Mažu…",
    stepChannels: "Správa kanálů",
    stepChannelsHint: "Kde smí twin mluvit a jak samostatně",
    stepInbox: "Schránka zpráv",
    stepInboxHint: "Nechte twin napsat první odpověď",
  },
  en: {
    sourceSample: "Untrained twin",
    sourceTrained: "Trained twin",
    intro:
      "The twin is your business's communication double. Teach it how you write — paste real messages and answer what it can't infer from them. It then writes in that voice everywhere: the outbox, social and distribution.",
    nextUp: "Next step",
    untrain: "Reset training",
    untraining: "Resetting…",
    stepChannels: "Channel management",
    stepChannelsHint: "Where the twin may speak, and how autonomously",
    stepInbox: "Message box",
    stepInboxHint: "Let the twin draft its first reply",
  },
} as const;

export default function TwinModule({
  state: initialState,
  source: initialSource,
  projectType,
  offerings,
}: {
  state: TwinState;
  source: TwinSource;
  projectType: ProjectType;
  /** how many catalog offerings ground this brand — the `grounding` readiness gate */
  offerings: number;
}) {
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const { state, source, commit, untrain, resetting } = useTwinState(initialState, initialSource);

  const readiness = useMemo(() => deriveReadiness(state, { offerings }), [state, offerings]);
  const topGap = useMemo(() => buildGaps(readiness)[0] ?? null, [readiness]);

  return (
    <div className="stagger space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <span
            className={`pill ${source === "trained" ? "bg-brand-50 text-brand-700" : "bg-navy-50 text-muted"}`}
          >
            {source === "trained" ? t("sourceTrained") : t("sourceSample")}
          </span>
          <p className="text-sm leading-relaxed text-muted">{t("intro")}</p>
        </div>
        {source === "trained" && (
          <button
            type="button"
            onClick={untrain}
            disabled={resetting}
            className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-navy-800 disabled:opacity-50"
          >
            {resetting ? t("untraining") : t("untrain")}
          </button>
        )}
      </div>

      <ReadinessRibbon readiness={readiness} locale={L} />

      {topGap && (
        <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3">
          <Bolt width={18} height={18} className="mt-0.5 shrink-0 text-brand-accent" />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-navy-700">
            <span className="font-semibold text-navy-800">{t("nextUp")}: </span>
            {milestoneHint(topGap.milestone, L)}
            <span className="ml-1.5 text-xs font-semibold text-positive">+{topGap.delta} %</span>
          </p>
        </div>
      )}

      <TwinVoiceStudio state={state} projectType={projectType} onCommit={commit} />

      <NextSteps
        steps={[
          { to: "sprava-kanalu", label: t("stepChannels"), hint: t("stepChannelsHint") },
          { to: "schranka", label: t("stepInbox"), hint: t("stepInboxHint") },
        ].filter((s) => isModuleAvailable(projectType, s.to))}
      />
    </div>
  );
}
