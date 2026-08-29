"use client";

/** The Kanály module — the communication SIGNPOST. A project's ranked plan of
 *  zero-ad-spend channels, each moving through a lifecycle (identified →
 *  planned → live → paused/done). The table traces current state at a glance
 *  (stage + mode + the ONE derived next step per channel) and routes the user
 *  into the right communication module — Twin training, channel settings,
 *  schranka, content — via the setup wizard and deep links. Lifecycle intent is
 *  stored; readiness is derived (next-step.ts) from the twin modules' real
 *  state, so this signpost can never disagree with them. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { Check, Sparkles } from "@/components/icons";
import { useAiTool } from "@/components/ai/useAiTool";
import { LoadingTimer, RefineBar, ResultMeta, TimeoutState, ToolError } from "@/components/ai/primitives";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import { promptSafeName } from "@/lib/projects/name";
import { seedFromChannel } from "@/lib/content-engine/seed";
import { isModuleAvailable } from "@/lib/projects/modules";
import { createFormatters } from "@/lib/format";
import type { ChannelResearchResult } from "@/lib/ai-types";
import type { ProjectType } from "@/lib/projects/types";
import {
  type ChannelStage,
  type ChannelTrack,
  type OrganicChannel,
} from "@/lib/organic-channels/types";
import type { ChannelGrounding } from "@/lib/organic-channels/grounding";
import { deriveChannelNext, type SignpostContext } from "@/lib/organic-channels/next-step";
import { reconcilePlanTracks } from "@/lib/organic-channels/reconcile";
import type { VisibilityPlan } from "@/lib/organic-channels/visibility-plan";
import VisibilityPlanCard from "@/components/app/visibility/VisibilityPlanCard";
import { measuredGrounding, type ChannelOutcome } from "@/lib/organic-channels/outcomes";
import ChannelNextSteps from "@/components/app/channels/ChannelNextSteps";
import ChannelNotices from "@/components/app/channels/ChannelNotices";
import ChannelPipeline from "@/components/app/channels/ChannelPipeline";
import ChannelQuickWin from "@/components/app/channels/ChannelQuickWin";
import ChannelTable from "@/components/app/channels/ChannelTable";
import ChannelWizard from "@/components/app/channels/ChannelWizard";
import ChannelPlaybook from "@/components/app/channels/ChannelPlaybook";

/** Grounding the page resolves server-side and threads into the AI "tailor" call.
 *  Assembled (catalog spine + applied website-scan profile) by buildKanalyGrounding;
 *  the shape lives next to that pure builder so the lib does not depend on this
 *  client component. Re-exported here because the page imports it alongside the
 *  component. */
export type { ChannelGrounding };

const T = {
  cs: {
    sourceSample: "Ukázkový plán",
    sourceAi: "Plán na míru (AI)",
    intro:
      "Rozcestník vaší komunikace: kde vás zákazníci najdou zdarma a co je na každém kanálu další krok. Kliknutím na řádek otevřete playbook, tlačítkem uděláte další krok.",
    tailorCta: "Sestavit plán na míru (AI)",
    tailoring: "Sestavuji plán…",
    regenerate: "Přegenerovat",
    channels: "{n} kanálů",
    aiReadyTitle: "Plán na míru je připravený",
    aiReadyBody: "Nahraďte ukázkový plán touto verzí přizpůsobenou vaší firmě.",
    applyPlan: "Použít tento plán",
    dismiss: "Zavřít",
    revertSample: "Zpět na ukázkový plán",
    generatedMeta: "Vygenerováno {date} z podkladů projektu",
    groundingDegraded:
      "Konkurenci se teď nepodařilo načíst — nový plán by vznikl bez ní. Zkuste to později.",
    defaultTopic: "{channel}: příspěvek pro {brand}",
  },
  en: {
    sourceSample: "Sample plan",
    sourceAi: "Tailored plan (AI)",
    intro:
      "Your communication signpost: where customers find you for free, and what the next step is on each channel. Click a row for the playbook; the button does the next step.",
    tailorCta: "Build a tailored plan (AI)",
    tailoring: "Building the plan…",
    regenerate: "Regenerate",
    channels: "{n} channels",
    aiReadyTitle: "Your tailored plan is ready",
    aiReadyBody: "Replace the sample plan with this version tailored to your business.",
    applyPlan: "Use this plan",
    dismiss: "Dismiss",
    revertSample: "Back to sample plan",
    generatedMeta: "Generated {date} from your project's data",
    groundingDegraded:
      "Competitors couldn't be loaded right now — a new plan would be built without them. Try again later.",
    defaultTopic: "{channel}: post for {brand}",
  },
} as const;

export default function OrganicChannels({
  channels: initialChannels,
  sample = initialChannels,
  tracks: initialTracks,
  source: initialSource,
  degraded = false,
  generatedAt: initialGeneratedAt,
  projectType,
  grounding,
  signpost,
  visibilityPlan,
  outcomes,
}: {
  channels: OrganicChannel[];
  /** the SEEDED plan, which is not the same list as `channels` whenever a pinned AI
   *  plan is what the server rendered — "Zpět na ukázkový plán" needs the seed, and
   *  `channels` is the thing it is reverting away FROM. Defaults to `channels` for
   *  the callers that render the seed anyway (the public demo shell). */
  sample?: OrganicChannel[];
  tracks: Record<string, ChannelTrack>;
  source: "sample" | "ai";
  /** the saved plan couldn't be read — show a read-only banner + block writes */
  degraded?: boolean;
  /** ISO timestamp the pinned AI plan was generated (planProvenance) */
  generatedAt?: string;
  projectType: ProjectType;
  grounding: ChannelGrounding;
  /** twin-module state snapshot the next-step derivation reads */
  signpost: SignpostContext;
  /** the composed query → content → channel plan; null when the project type
   *  lacks one of the three modules (hasVisibilityPlan) */
  visibilityPlan?: VisibilityPlan | null;
  /** MEASURED per-channel clicks from the tenant's own `/go` links (WP W2-A) —
   *  shown beside each row's curated `fit` and handed to the AI as ground truth on
   *  a regenerate. Absent = nothing measured; `fit` is never overwritten. */
  outcomes?: ChannelOutcome[];
}) {
  const project = useProject();
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const [channels, setChannels] = useState<OrganicChannel[]>(initialChannels);
  const [tracks, setTracks] = useState<Record<string, ChannelTrack>>(initialTracks);
  /** Latest tracks, readable outside a render closure — so `saveTracks` can compute
   *  and POST the next state without doing that work inside a state updater. */
  const tracksRef = useRef(tracks);
  useEffect(() => {
    tracksRef.current = tracks;
  });
  const [source, setSource] = useState<"sample" | "ai">(initialSource);
  /** when the AI plan was generated — server-resolved, refreshed on client apply */
  const [generatedAt, setGeneratedAt] = useState<string | undefined>(initialGeneratedAt);
  const [openId, setOpenId] = useState<string | null>(null);
  const [wizardQueue, setWizardQueue] = useState<OrganicChannel[]>([]);
  /** step the wizard should land on (the "set-inbox" CTA promises the inbox step) */
  const [wizardStart, setWizardStart] = useState<"inbox" | undefined>(undefined);
  /** the last persist failed — the local state is ahead of the store and honesty
   *  demands saying so (a demo project 404s every write, silently, otherwise) */
  const [saveFailed, setSaveFailed] = useState(false);
  const [applied, setApplied] = useState(false);
  /** tracks left behind by the last applied plan — surfaced, never silently hidden */
  const [orphans, setOrphans] = useState<Array<{ id: string; name: string }>>([]);

  const ai = useAiTool<ChannelResearchResult>("channel-research");

  /** Is the generation sitting in `ai` the very plan already pinned on screen?
   *
   *  `applied` is in-memory, but `useAiTool` rehydrates its last result from
   *  localStorage on mount — so after a reload the "your tailored plan is ready /
   *  replace the sample plan with it" banner came back on a page whose source pill
   *  already read "Plán na míru (AI)", inviting the tenant to apply what they had
   *  applied (measured in the 2026-08-29 L2 run). Compare identity with what the
   *  SERVER rendered instead of trusting a flag that a reload resets. */
  const pinnedIsThisPlan =
    source === "ai" &&
    !!ai.data &&
    ai.data.result.channels.length === channels.length &&
    ai.data.result.channels.every((c, i) => c.id === channels[i]?.id);

  /** The brand as it may be spoken. A demo/sample project is named "Klinika
   *  (ukázka)"; everything below either reaches the model or reaches the content
   *  engine as a brief, and the marker leaks straight back out in the rationale,
   *  the first actions and the seeded topic. Stripped once, here, at the ONE
   *  boundary this component owns (the wire request re-strips server-side). */
  const brandName = promptSafeName(project.name);

  const open = channels.find((c) => c.id === openId) ?? null;
  // The availability gate keeps every derived CTA honest for THIS project type
  // (e.g. a leadgen plan's LinkedIn row must not deep-link to the absent socialni).
  const nextOf = (c: OrganicChannel) =>
    deriveChannelNext(c, tracks[c.id], signpost, (key) => isModuleAvailable(projectType, key));

  const quickWin = useMemo(
    () => channels.find((c) => c.effort === "low" && c.fit >= 70 && !tracks[c.id]) ?? null,
    [channels, tracks]
  );

  /** Persist the desired state. The UI keeps its optimistic local state either
   *  way, but a failed save (network, or a demo project whose API 404s every
   *  write) flips `saveFailed` — following this module's `degraded` pattern —
   *  instead of lying that the change stuck. A later success clears it. */
  const persist = (next: { tracks: Record<string, ChannelTrack>; plan?: OrganicChannel[] }) => {
    void fetch(`/api/projects/${project.id}/organic-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((r) => setSaveFailed(!r.ok))
      .catch(() => setSaveFailed(true));
  };

  /** Mutate the tracked lifecycle and persist the result.
   *
   *  The POST used to be fired from INSIDE the `setTracks` updater. A state updater
   *  must be pure: React is free to run it more than once for a render it then
   *  discards, so the write could fire twice, or fire for a state the UI never
   *  showed. The latest tracks are read from a ref instead — the same pattern (and
   *  the same reason) as ContentSchedule's `postsRef`. */
  const saveTracks = (mutate: (prev: Record<string, ChannelTrack>) => Record<string, ChannelTrack>) => {
    if (degraded) return; // a whole-state POST now could clobber the unread real plan
    const next = mutate(tracksRef.current);
    setTracks(next);
    persist({ tracks: next, ...(source === "ai" ? { plan: channels } : {}) });
  };

  const setStage = (id: string, stage: ChannelStage) =>
    saveTracks((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), stage } }));

  const saveWizard = (id: string, track: ChannelTrack) => saveTracks((prev) => ({ ...prev, [id]: track }));

  const openWizard = (q: OrganicChannel[], startAt?: "inbox") => {
    setWizardStart(startAt);
    setWizardQueue(q);
  };

  /** The measured rows the AI may be told about — clicked channels only, capped. */
  const measured = useMemo(() => measuredGrounding(outcomes), [outcomes]);

  const runTailor = () => {
    setApplied(false);
    ai.run({
      projectType,
      brand: brandName,
      ...(grounding.offering ? { offering: grounding.offering } : {}),
      ...(grounding.localities?.length ? { localities: grounding.localities } : {}),
      ...(grounding.competitors?.length ? { competitors: grounding.competitors } : {}),
      ...(grounding.keywords?.length ? { keywords: grounding.keywords } : {}),
      ...(grounding.businessSummary ? { businessSummary: grounding.businessSummary } : {}),
      ...(grounding.audience ? { audience: grounding.audience } : {}),
      // What the tenant's own links actually produced. Handed over as GROUND TRUTH
      // (the prompt says so explicitly) so a regenerate can re-rank around real
      // clicks instead of re-deriving the same prediction from the same context.
      ...(measured.length ? { measured } : {}),
    });
  };

  /** Pin the AI plan, then auto-offer the setup wizard for the top-3-fit
   *  channels — the guided "now decide who speaks where" moment. AI ids are
   *  slugified model names, so a renamed-but-same channel would orphan its
   *  configured track: reconcilePlanTracks re-keys existing lifecycle work onto
   *  the new plan (fold-based, conservative), the auto-offer skips channels
   *  whose folded identity is already configured, and anything unmatched is
   *  surfaced in the orphans note instead of silently vanishing. */
  const applyPlan = () => {
    const plan = ai.data?.result.channels;
    if (!plan || plan.length === 0) return;
    const next = reconcilePlanTracks(plan, channels, tracks);
    setChannels(plan);
    setSource("ai");
    setGeneratedAt(new Date().toISOString());
    setApplied(true);
    setTracks(next.tracks);
    setOrphans(next.orphans);
    persist({ tracks: next.tracks, plan });
    openWizard(plan.filter((c) => !next.tracks[c.id]).slice(0, 3));
  };

  /** Drop the surfaced leftover tracks (explicit user action — frees track cap). */
  const removeOrphans = () => {
    const ids = new Set(orphans.map((o) => o.id));
    saveTracks((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))));
    setOrphans([]);
  };

  /** Drop the pinned plan and go back to the seed. It restores `sample`, NOT
   *  `initialChannels`: on a page load that already had a pinned plan those are the
   *  same variable only by accident of the sample path — the server renders the
   *  PINNED plan into `channels`, so reverting used to leave the AI channels on
   *  screen wearing the "Ukázkový plán" pill until the next reload, disagreeing with
   *  the store it had just cleared. */
  const revertSample = () => {
    setChannels(sample);
    setSource("sample");
    setGeneratedAt(undefined);
    setTracks({});
    setApplied(false);
    setOrphans([]);
    void fetch(`/api/projects/${project.id}/organic-channels`, { method: "DELETE" })
      .then((r) => setSaveFailed(!r.ok))
      .catch(() => setSaveFailed(true));
  };

  /** Hand a channel's content angle to the content engine via the BriefSeed
   *  session bridge, then route there — the "playbook → draft" loop.
   *
   *  ONE door: both the drawer's "create content" and the row CTA's derived
   *  create-content step come through here, so the maker lands in the same seeded
   *  workspace whichever they clicked (the CTA used to push an empty engine).
   *  `?from=kanaly` rides along for the shared ReturnHint affordance. */
  const createContent = (channel: OrganicChannel) => {
    const seed = seedFromChannel({
      contentAngle: channel.contentAngle,
      fallbackTopic: t("defaultTopic", { channel: channel.name, brand: brandName }),
      keywords: grounding.keywords,
      projectName: brandName,
    });
    try {
      sessionStorage.setItem(briefSeedKey(project.id), JSON.stringify(seed));
    } catch {
      /* storage unavailable — still navigate; the engine opens unseeded */
    }
    router.push(`/app/${project.id}/obsahovy-engine?from=kanaly`);
  };

  /** The row CTA: deep-link when the step lives in another module, else act here. */
  const doNext = (c: OrganicChannel) => {
    const next = nextOf(c);
    if (next.key === "none") return;
    if (next.to) {
      // The engine is not just a destination — it is a destination that needs to
      // know WHAT to write. The CTA that says "Vytvořit obsah" now hands over the
      // same seed the drawer does instead of opening a blank workspace. (The
      // social planner branch of create-content keeps its plain deep link — it has
      // no brief to seed.)
      if (next.key === "create-content" && next.to === "obsahovy-engine") {
        createContent(c);
        return;
      }
      // `channel` carries a TWIN channel (next.scope) only where the destination
      // can honor it (schranka's picker); other modules get no dead parameter.
      router.push(
        `/app/${project.id}/${next.to}?from=kanaly${next.scope ? `&channel=${next.scope}` : ""}`
      );
      return;
    }
    // "set-inbox" opens the wizard ON the inbox step — the step the CTA names.
    if (next.key === "decide") openWizard([c]);
    else if (next.key === "set-inbox") openWizard([c], "inbox");
    else if (next.key === "go-live" || next.key === "resume") setStage(c.id, "live");
    else if (next.key === "mark-done") setStage(c.id, "done");
    else setOpenId(c.id); // first-action → the playbook
  };

  return (
    <div className="stagger space-y-6">
      {/* Header: source label + intro + primary AI action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`pill ${source === "ai" ? "bg-brand-50 text-brand-700" : "bg-navy-50 text-muted"}`}
            >
              {source === "ai" ? t("sourceAi") : t("sourceSample")}
            </span>
            <span className="pill bg-navy-50 text-muted">{t("channels", { n: channels.length })}</span>
          </div>
          {/* A pinned AI plan says when it was generated — a stale plan must not
              read as fresh analysis (planSource/updatedAt, threaded from resolve). */}
          {source === "ai" && generatedAt && (
            <p className="text-xs text-muted">
              {t("generatedMeta", { date: createFormatters(L).fmtDateTime(generatedAt) })}
            </p>
          )}
          <p className="text-sm leading-relaxed text-muted">{t("intro")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={runTailor}
            disabled={ai.status === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles width={16} height={16} className={ai.status === "loading" ? "animate-pulse" : ""} />
            {ai.status === "loading" ? t("tailoring") : source === "ai" ? t("regenerate") : t("tailorCta")}
          </button>
          {source === "ai" && (
            <button
              type="button"
              onClick={revertSample}
              className="text-center text-xs font-medium text-muted transition-colors hover:text-navy-800"
            >
              {t("revertSample")}
            </button>
          )}
          {/* Degraded grounding ≠ no grounding: the competitors READ failed, so a
              regeneration right now would silently run without them. */}
          {grounding.competitorsUnavailable && (
            <p className="max-w-56 text-center text-xs leading-relaxed text-coral-600 sm:text-right">
              {t("groundingDegraded")}
            </p>
          )}
        </div>
      </div>

      {/* The signpost strip: lifecycle counts at a glance */}
      <ChannelPipeline channels={channels} tracks={tracks} />

      {/* The three honesty banners (read failed / save failed / orphaned setup) */}
      <ChannelNotices
        degraded={degraded}
        saveFailed={saveFailed}
        orphans={orphans}
        onRemoveOrphans={removeOrphans}
        onKeepOrphans={() => setOrphans([])}
      />

      {/* AI generation states */}
      {ai.status === "loading" && <LoadingTimer expectedMs={ai.expectedMs} />}
      {ai.status === "error" &&
        (ai.timedOut ? (
          <TimeoutState onRetry={runTailor} />
        ) : (
          <ToolError message={ai.error ?? ""} onRetry={runTailor} retryIn={ai.retryIn} upgradeUrl={ai.upgradeUrl} />
        ))}
      {ai.status === "done" && ai.data && !applied && !pinnedIsThisPlan && (
        <div className="animate-fade-up space-y-3 rounded-card border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center gap-2">
            <Sparkles width={16} height={16} className="text-brand-accent" />
            <h3 className="text-sm font-semibold text-navy-800">{t("aiReadyTitle")}</h3>
          </div>
          <ResultMeta meta={ai.data.meta} />
          {ai.data.result.summary && (
            <p className="text-sm leading-relaxed text-navy-700">{ai.data.result.summary}</p>
          )}
          <p className="text-xs text-muted">{t("aiReadyBody")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyPlan}
              className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
            >
              <Check width={13} height={13} />
              {t("applyPlan")} ({ai.data.result.channels.length})
            </button>
            <button
              type="button"
              onClick={() => ai.reset()}
              className="rounded-pill border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-navy-800"
            >
              {t("dismiss")}
            </button>
          </div>
          {ai.canRefine && <RefineBar onRefine={ai.refine} />}
        </div>
      )}

      {/* Quick win callout (only while undecided). Disabled — not hidden — on the
          degraded path: the wizard's Save is refused there, so an enabled button
          would open a form that no-ops (ChannelQuickWin). */}
      {quickWin && (
        <ChannelQuickWin
          channel={quickWin}
          degraded={degraded}
          onStart={(c) => openWizard([c])}
        />
      )}

      {/* One plan across the three modules — above the table, because the table
          answers "where", and this answers "for which query, with what content". */}
      {visibilityPlan && (
        <VisibilityPlanCard plan={visibilityPlan} projectType={projectType} current="kanaly" />
      )}

      {/* Signpost table: fit + mode + stage + the ONE next step per channel */}
      <ChannelTable
        channels={channels}
        tracks={tracks}
        nextOf={nextOf}
        degraded={degraded}
        outcomes={outcomes}
        onOpen={setOpenId}
        onNext={doNext}
      />

      <ChannelNextSteps projectType={projectType} />

      <ChannelPlaybook
        channel={open}
        track={open ? tracks[open.id] : undefined}
        next={open ? nextOf(open) : null}
        projectId={project.id}
        degraded={degraded}
        onClose={() => setOpenId(null)}
        onSetStage={setStage}
        onOpenWizard={(c, startAt) => {
          setOpenId(null);
          openWizard([c], startAt);
        }}
        onCreateContent={createContent}
      />

      <ChannelWizard
        key={wizardQueue.map((c) => c.id).join(",")}
        queue={wizardQueue}
        tracks={tracks}
        ctx={signpost}
        open={wizardQueue.length > 0}
        startAt={wizardStart}
        onClose={() => openWizard([])}
        onSave={saveWizard}
      />
    </div>
  );
}
