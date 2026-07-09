"use client";

/** Správa kanálů — where the twin may speak, how much rope it gets on each channel,
 *  and which connector delivers an approved draft.
 *
 *  Its own module rather than a tab of Twin: autonomy is the setting with the most
 *  consequence in this whole feature (it is the difference between a draft and a
 *  message that leaves without a human), and burying it behind a tab switcher next
 *  to a training form understated it. Shares the twin blob via `useTwinState`. */
import { useMemo } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import NextSteps from "@/components/app/NextSteps";
import TwinChannels from "@/components/app/twin/TwinChannels";
import ReadinessRibbon from "@/components/app/twin/ReadinessRibbon";
import { useTwinState, type TwinSource } from "@/components/app/twin/useTwinState";
import { deriveReadiness } from "@/lib/twin/readiness";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { ConnectorInfo } from "@/lib/twin/connectors";
import type { TwinState } from "@/lib/twin/types";
import type { ProjectType } from "@/lib/projects/types";

const T = {
  cs: {
    stepTwin: "Twin",
    stepTwinHint: "Natrénujte hlas, kterým se bude psát",
    stepInbox: "Schránka zpráv",
    stepInboxHint: "Nechte twin napsat odpověď",
  },
  en: {
    stepTwin: "Twin",
    stepTwinHint: "Train the voice it writes in",
    stepInbox: "Message box",
    stepInboxHint: "Let the twin draft a reply",
  },
} as const;

export default function TwinChannelsModule({
  state: initialState,
  source: initialSource,
  projectType,
  offerings,
  connectors,
}: {
  state: TwinState;
  source: TwinSource;
  projectType: ProjectType;
  offerings: number;
  connectors: ConnectorInfo[];
}) {
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const { state, commit } = useTwinState(initialState, initialSource);
  const readiness = useMemo(() => deriveReadiness(state, { offerings }), [state, offerings]);

  return (
    <div className="stagger space-y-6">
      <ReadinessRibbon readiness={readiness} locale={L} />
      <TwinChannels state={state} connectors={connectors} onCommit={commit} />
      <NextSteps
        steps={[
          { to: "twin", label: t("stepTwin"), hint: t("stepTwinHint") },
          { to: "schranka", label: t("stepInbox"), hint: t("stepInboxHint") },
        ].filter((s) => isModuleAvailable(projectType, s.to))}
      />
    </div>
  );
}
