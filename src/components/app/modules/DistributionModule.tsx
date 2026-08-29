/** Distribution — one article repurposed across channels + per-channel attribution.
 *
 *  This file is the SHELL: it resolves which article is being distributed, loads
 *  the persisted variants, derives each panel's provenance, and composes the four
 *  panels (source, variants, attribution, insights). Everything with its own copy
 *  and its own state lives in ./distribution/ — see AGENTS.md's 200-LOC rule; the
 *  single 970-line file this replaces put the Sparkline, the newsletter exporter
 *  and the insights rollup into the module's first bundle. */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { repurpose } from "@/lib/distribution/generate";
import type { ChannelPerf, SourceArticle } from "@/lib/distribution/sample";
import { attributionIsLive, panelProvenance } from "@/lib/distribution/provenance";
import { measuredAttribution } from "@/lib/distribution/measured";
import type { ChannelOutcome } from "@/lib/organic-channels/outcomes";
import {
  applyStoredVariants,
  selectSource,
  sourceChoices,
  storedSources,
  variantsForArticle,
  type VariantState,
} from "@/lib/distribution/variants";
import { loadVariantsAction } from "./distribution-actions";
import { useProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import SourceCard from "./distribution/SourceCard";
import VariantCard from "./distribution/VariantCard";
import AttributionTable from "./distribution/AttributionTable";

/** The module's below-fold tail, and the only thing pulling the Sparkline chart
 *  primitive + the learnings rollup in — code-split so that JS lands after the
 *  cards the user came here to edit. Nothing gates it, so it always renders; the
 *  skeleton is what the user sees while its chunk arrives. */
const LearningsPanel = dynamic(() => import("./distribution/LearningsPanel"), {
  loading: () => <SectionSkeleton height="h-64" lines={2} />,
});

const T = {
  cs: {
    savedHint: "Uložené varianty tohoto článku se načetly. Pokračujete tam, kde jste skončili.",
    nextStepLabel: "Naplánovat publikaci",
    nextStepHint: "Vydat varianty v centru sociálních sítí",
  },
  en: {
    savedHint: "Loaded this article's saved variants. You're picking up where you left off.",
    nextStepLabel: "Schedule publication",
    nextStepHint: "Publish the variants in the social center",
  },
} as const;

export default function DistributionModule({
  source,
  attribution,
  outcomes,
}: {
  source: SourceArticle;
  attribution: ChannelPerf[];
  /** MEASURED per-channel outcomes from the tenant's own `/go` links (WP W2-A).
   *  With at least one counted click these REPLACE the illustrative attribution
   *  rows and both bottom panels stop disclosing themselves — they read one signal,
   *  so they flip together (lib/distribution/provenance). */
  outcomes?: ChannelOutcome[];
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const project = useProject();

  // --- the stored record (handed-over articles + their variants) -----------
  // Loaded ONCE per project, after first paint. The deterministic fixture is
  // always what renders first (it is pure and needs no I/O); everything stored is
  // layered on top when it arrives, so a project with nothing stored renders
  // exactly what it rendered before this store existed.
  const [state, setState] = useState<VariantState | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadVariantsAction(project.id)
      .then((loaded) => {
        if (alive) setState(loaded);
      })
      .catch(() => {
        /* a hydration failure must never break the module — the deterministic
           draft is already on screen and stays usable. */
      });
    return () => {
      alive = false;
    };
  }, [project.id]);

  // --- which article are we distributing? ----------------------------------
  // With nothing handed over this ALWAYS resolves to the fixture: the fixture is
  // the empty state, not a fallback competing with real articles.
  const sources = useMemo(() => storedSources(state), [state]);
  const active = useMemo(() => selectSource(source, sources, selectedKey), [source, sources, selectedKey]);
  const activeSource = active.source;
  const key = active.key;
  const choices = useMemo(() => sourceChoices(source, sources), [source, sources]);

  // The deterministic drafts are copy the user ships, so they are written in the
  // active locale — an en project's cards were Czech until a regenerate.
  const variants = useMemo(() => repurpose(activeSource, locale), [activeSource, locale]);
  const stored = useMemo(() => variantsForArticle(state, key), [state, key]);
  const hasStored = Object.keys(stored).length > 0;
  /** Remount key for the editors: it changes when the chosen article changes, and
   *  when saved text first arrives for it. For a fresh project both halves are
   *  constant, so nothing ever remounts — that path stays byte-identical. */
  const editorEpoch = `${key}:${hasStored ? (state?.updatedAt ?? "") : ""}`;

  /** The action returns the whole persisted blob — adopt it wholesale so the
   *  badges and any later remount agree with what the server now holds. */
  const onPersisted = useCallback((next: VariantState) => setState(next), []);

  // Stored text wins per channel; link, budget and order always come from the
  // fresh repurpose, so a saved variant can never resurrect a stale UTM link.
  const shown = useMemo(() => applyStoredVariants(variants, stored), [variants, stored]);

  // Provenance PER PANEL, not per project: the source/variants follow the chosen
  // article, the attribution table and the insights rolled up from it follow the
  // analytics seam — which is now real (the `/go` outcome ledger) and still fails
  // closed. See lib/distribution/provenance.
  const attributionLive = attributionIsLive(outcomes);
  const provenance = panelProvenance({ sourceOrigin: active.origin, attributionLive });
  /** The rows both bottom panels read: measured when there is measurement, the
   *  illustrative fixture otherwise. One expression, so the table and the insights
   *  rolled up FROM it can never disagree about which world they are in. */
  const rows = useMemo(
    () => (attributionLive && outcomes ? measuredAttribution(outcomes) : attribution),
    [attributionLive, outcomes, attribution]
  );

  return (
    <div className="stagger space-y-6">
      <SourceCard
        source={activeSource}
        origin={active.origin}
        choices={choices}
        selectedKey={key}
        onSelect={setSelectedKey}
        hasOwnSources={sources.length > 0}
      />

      {hasStored && (
        <p className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <Check width={14} height={14} className="shrink-0" />
          {t("savedHint")}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((v) => (
          <VariantCard
            // Remounts the editor when the chosen article changes or its saved
            // text first arrives; constant for a project with nothing stored.
            key={`${v.channel}:${editorEpoch}`}
            channel={v.channel}
            initialText={v.text}
            max={v.max}
            link={v.link}
            source={activeSource}
            articleKey={key}
            projectId={project.id}
            storedStatus={stored[v.channel]?.status ?? null}
            onPersisted={onPersisted}
          />
        ))}
      </div>

      <AttributionTable attribution={rows} sample={provenance.attribution} live={attributionLive} />

      <LearningsPanel attribution={rows} variants={shown} sample={provenance.learnings} />

      <NextSteps steps={[{ to: "socialni", label: t("nextStepLabel"), hint: t("nextStepHint") }]} />
    </div>
  );
}
