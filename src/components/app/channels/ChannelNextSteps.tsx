"use client";

/** The Kanály footer's downstream hops. Extracted out of OrganicChannels (which
 *  is long-standing 200-LOC debt and may not grow) so the missing leg could be
 *  added without growing it.
 *
 *  THE MISSING LEG: this strip hopped to the content engine and social only, so
 *  the "places to promote" path pointed at the two modules that PUBLISH and never
 *  at Klíčová slova — the half that decides WHAT to publish for. A channel plan
 *  reads keywords as an input and never offered a way back to them, which is one
 *  half of the "no single visibility plan" finding (UAT L1-STANDA-004; §6 P3).
 *  Keywords now lead, because it is the step that comes first in the real work. */
import NextSteps from "@/components/app/NextSteps";
import { useT } from "@/lib/i18n/client";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { ProjectType } from "@/lib/projects/types";

const T = {
  cs: {
    stepKeywords: "Klíčová slova",
    stepKeywordsHint: "Vyberte dotazy, na které chcete být vidět",
    stepContent: "Obsahový engine",
    stepContentHint: "Napište obsah pro vybraný kanál",
    stepSocial: "Sociální sítě",
    stepSocialHint: "Naplánujte a publikujte příspěvky",
  },
  en: {
    stepKeywords: "Keywords",
    stepKeywordsHint: "Pick the queries you want to be found for",
    stepContent: "Content engine",
    stepContentHint: "Write content for the chosen channel",
    stepSocial: "Social media",
    stepSocialHint: "Plan and publish posts",
  },
} as const;

export default function ChannelNextSteps({ projectType }: { projectType: ProjectType }) {
  const t = useT(T);
  return (
    <NextSteps
      steps={[
        { to: "klicova-slova", label: t("stepKeywords"), hint: t("stepKeywordsHint") },
        { to: "obsahovy-engine", label: t("stepContent"), hint: t("stepContentHint") },
        { to: "socialni", label: t("stepSocial"), hint: t("stepSocialHint") },
      ].filter((s) => isModuleAvailable(projectType, s.to))}
    />
  );
}
