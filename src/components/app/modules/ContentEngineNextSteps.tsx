"use client";

/** The Obsahový engine footer's hops. Extracted out of ContentEngine (long-standing
 *  200-LOC debt that may not grow) so the two missing legs could be added without
 *  growing it, mirroring channels/ChannelNextSteps.
 *
 *  THE MISSING LEGS. The visibility path is three modules — Klíčová slova decides
 *  WHICH queries are worth targeting, this module writes the piece that answers one,
 *  and Kanály zdarma ranks the free places it gets seen. Kanály now links to both of
 *  the others and Klíčová slova renders the shared plan, but the content engine
 *  hopped only DOWNSTREAM (library, distribution, social, creative): it was the one
 *  leg of its own path that never pointed back at the other two, so a maker who
 *  arrived here from a channel playbook had no way onward except the browser's back
 *  button (UAT 2026-08-28 kanaly-l1, finding K02).
 *
 *  The two path legs lead, in the order of the real work — decide the query, then
 *  pick where it gets seen — ahead of the downstream publishing hops. */
import NextSteps from "@/components/app/NextSteps";
import { useT } from "@/lib/i18n/client";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { ProjectType } from "@/lib/projects/types";

const T = {
  cs: {
    stepKeywords: "Klíčová slova",
    stepKeywordsHint: "Vyberte dotazy, na které chcete být vidět",
    stepChannels: "Kanály zdarma",
    stepChannelsHint: "Vyberte, kde se tento obsah zdarma ukáže",
    stepLibrary: "Uložený obsah",
    stepLibraryHint: "Otevřít knihovnu hotových briefů a článků",
    stepDistribute: "Distribuovat",
    stepDistributeHint: "Rozšířit hotový článek na sítě a do newsletteru",
    stepSocial: "Sociální sítě",
    stepSocialHint: "Naplánovat příspěvky z tohoto obsahu",
    stepCreative: "Kreativa",
    stepCreativeHint: "Vygenerovat vizuály k článku",
  },
  en: {
    stepKeywords: "Keywords",
    stepKeywordsHint: "Pick the queries you want to be found for",
    stepChannels: "Free channels",
    stepChannelsHint: "Pick where this content gets seen for free",
    stepLibrary: "Saved content",
    stepLibraryHint: "Open the library of finished briefs and articles",
    stepDistribute: "Distribute",
    stepDistributeHint: "Push the finished article to social and newsletter",
    stepSocial: "Social media",
    stepSocialHint: "Schedule posts from this content",
    stepCreative: "Creative",
    stepCreativeHint: "Generate visuals for the article",
  },
} as const;

export default function ContentEngineNextSteps({ projectType }: { projectType: ProjectType }) {
  const t = useT(T);
  const steps = [
    { to: "klicova-slova", label: t("stepKeywords"), hint: t("stepKeywordsHint") },
    { to: "kanaly", label: t("stepChannels"), hint: t("stepChannelsHint") },
    { to: "ulozeny-obsah", label: t("stepLibrary"), hint: t("stepLibraryHint") },
    { to: "distribuce", label: t("stepDistribute"), hint: t("stepDistributeHint") },
    { to: "socialni", label: t("stepSocial"), hint: t("stepSocialHint") },
    { to: "kreativa", label: t("stepCreative"), hint: t("stepCreativeHint") },
  ].filter((s) => isModuleAvailable(projectType, s.to));
  if (steps.length === 0) return null;
  return <NextSteps steps={steps} />;
}
