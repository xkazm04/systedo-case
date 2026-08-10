"use client";

/** The Kanály module — the communication SIGNPOST. A project's ranked plan of
 *  zero-ad-spend channels, each moving through a lifecycle (identified →
 *  planned → live → paused/done). The table traces current state at a glance
 *  (stage + mode + the ONE derived next step per channel) and routes the user
 *  into the right communication module — Twin training, channel settings,
 *  schranka, content — via the setup wizard and deep links. Lifecycle intent is
 *  stored; readiness is derived (next-step.ts) from the twin modules' real
 *  state, so this signpost can never disagree with them. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { ArrowRight, Bolt, Check, Sparkles } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { useAiTool } from "@/components/ai/useAiTool";
import { LoadingTimer, RefineBar, ResultMeta, TimeoutState, ToolError } from "@/components/ai/primitives";
import { briefSeedKey } from "@/lib/projects/brief-seed";
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
import { deriveChannelNext, type SignpostContext } from "@/lib/organic-channels/next-step";
import { reconcilePlanTracks } from "@/lib/organic-channels/reconcile";
import ChannelPipeline from "@/components/app/channels/ChannelPipeline";
import ChannelTable from "@/components/app/channels/ChannelTable";
import ChannelWizard from "@/components/app/channels/ChannelWizard";
import ChannelPlaybook from "@/components/app/channels/ChannelPlaybook";

/** Grounding the page resolves server-side and threads into the AI "tailor" call. */
export interface ChannelGrounding {
  offering?: string;
  localities?: string[];
  competitors?: string[];
  keywords?: string[];
  /** the competitors READ failed (≠ "tenant has none"): regeneration would run
   *  un-grounded, so the regenerate affordance discloses the degradation */
  competitorsUnavailable?: boolean;
}

const T = {
  cs: {
    sourceSample: "Ukázkový plán",
    sourceAi: "Plán na míru (AI)",
    intro:
      "Rozcestník vaší komunikace: kde vás zákazníci najdou zdarma a co je na každém kanálu další krok. Kliknutím na řádek otevřete playbook, tlačítkem uděláte další krok.",
    tailorCta: "Sestavit plán na míru (AI)",
    tailoring: "Sestavuji plán…",
    regenerate: "Přegenerovat",
    quickWin: "Rychlá výhra",
    quickWinHint: "Nízká náročnost, vysoká vhodnost. Začněte tady.",
    channels: "{n} kanálů",
    aiReadyTitle: "Plán na míru je připravený",
    aiReadyBody: "Nahraďte ukázkový plán touto verzí přizpůsobenou vaší firmě.",
    applyPlan: "Použít tento plán",
    dismiss: "Zavřít",
    revertSample: "Zpět na ukázkový plán",
    stepContent: "Obsahový engine",
    stepContentHint: "Napište obsah pro vybraný kanál",
    stepSocial: "Sociální sítě",
    stepSocialHint: "Naplánujte a publikujte příspěvky",
    degradedBanner:
      "Uložený plán se nepodařilo načíst. Zobrazujeme ukázkový plán jen ke čtení. Změny stavu jsou dočasně vypnuté, aby nepřepsaly vaši uloženou práci. Obnovte stránku a zkuste to znovu.",
    saveFailedBanner:
      "Poslední změnu se nepodařilo uložit — zobrazený stav je jen v tomto okně a po obnovení stránky zmizí. Zkuste akci zopakovat.",
    generatedMeta: "Vygenerováno {date} z podkladů projektu",
    groundingDegraded:
      "Konkurenci se teď nepodařilo načíst — nový plán by vznikl bez ní. Zkuste to později.",
    defaultTopic: "{channel}: příspěvek pro {brand}",
    orphanNote: "V novém plánu už nejsou tyto dříve nastavené kanály:",
    orphanRemove: "Odebrat jejich nastavení",
    orphanKeep: "Ponechat",
  },
  en: {
    sourceSample: "Sample plan",
    sourceAi: "Tailored plan (AI)",
    intro:
      "Your communication signpost: where customers find you for free, and what the next step is on each channel. Click a row for the playbook; the button does the next step.",
    tailorCta: "Build a tailored plan (AI)",
    tailoring: "Building the plan…",
    regenerate: "Regenerate",
    quickWin: "Quick win",
    quickWinHint: "Low effort, high fit. Start here.",
    channels: "{n} channels",
    aiReadyTitle: "Your tailored plan is ready",
    aiReadyBody: "Replace the sample plan with this version tailored to your business.",
    applyPlan: "Use this plan",
    dismiss: "Dismiss",
    revertSample: "Back to sample plan",
    stepContent: "Content engine",
    stepContentHint: "Write content for the chosen channel",
    stepSocial: "Social media",
    stepSocialHint: "Plan and publish posts",
    degradedBanner:
      "Couldn't load your saved plan. Showing a read-only sample. Status changes are temporarily disabled so they can't overwrite your saved work. Refresh the page to try again.",
    saveFailedBanner:
      "The last change couldn't be saved — what you see lives only in this window and will disappear on reload. Try the action again.",
    generatedMeta: "Generated {date} from your project's data",
    groundingDegraded:
      "Competitors couldn't be loaded right now — a new plan would be built without them. Try again later.",
    defaultTopic: "{channel}: post for {brand}",
    orphanNote: "These previously configured channels are no longer in the new plan:",
    orphanRemove: "Remove their setup",
    orphanKeep: "Keep",
  },
} as const;

export default function OrganicChannels({
  channels: initialChannels,
  tracks: initialTracks,
  source: initialSource,
  degraded = false,
  generatedAt: initialGeneratedAt,
  projectType,
  grounding,
  signpost,
}: {
  channels: OrganicChannel[];
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
}) {
  const project = useProject();
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const [channels, setChannels] = useState<OrganicChannel[]>(initialChannels);
  const [tracks, setTracks] = useState<Record<string, ChannelTrack>>(initialTracks);
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

  const saveTracks = (mutate: (prev: Record<string, ChannelTrack>) => Record<string, ChannelTrack>) => {
    if (degraded) return; // a whole-state POST now could clobber the unread real plan
    setTracks((prev) => {
      const next = mutate(prev);
      persist({ tracks: next, ...(source === "ai" ? { plan: channels } : {}) });
      return next;
    });
  };

  const setStage = (id: string, stage: ChannelStage) =>
    saveTracks((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), stage } }));

  const saveWizard = (id: string, track: ChannelTrack) => saveTracks((prev) => ({ ...prev, [id]: track }));

  const openWizard = (q: OrganicChannel[], startAt?: "inbox") => {
    setWizardStart(startAt);
    setWizardQueue(q);
  };

  const runTailor = () => {
    setApplied(false);
    ai.run({
      projectType,
      brand: project.name,
      ...(grounding.offering ? { offering: grounding.offering } : {}),
      ...(grounding.localities?.length ? { localities: grounding.localities } : {}),
      ...(grounding.competitors?.length ? { competitors: grounding.competitors } : {}),
      ...(grounding.keywords?.length ? { keywords: grounding.keywords } : {}),
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

  const revertSample = () => {
    setChannels(initialChannels);
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
      fallbackTopic: t("defaultTopic", { channel: channel.name, brand: project.name }),
      keywords: grounding.keywords,
      projectName: project.name,
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

      {degraded && (
        <div
          role="status"
          className="rounded-card border border-coral-400 bg-coral-soft px-4 py-3 text-sm leading-relaxed text-coral-600"
        >
          {t("degradedBanner")}
        </div>
      )}

      {/* A failed persist must not masquerade as a saved change (the degraded
          pattern's sibling: state is local-only until a save lands). */}
      {saveFailed && !degraded && (
        <div
          role="status"
          className="rounded-card border border-coral-400 bg-coral-soft px-4 py-3 text-sm leading-relaxed text-coral-600"
        >
          {t("saveFailedBanner")}
        </div>
      )}

      {/* Honest leftovers: configured channels the regenerated plan no longer names */}
      {orphans.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas px-4 py-3 text-sm"
        >
          <p className="min-w-0 leading-relaxed text-muted">
            {t("orphanNote")}{" "}
            <span className="font-medium text-navy-800">{orphans.map((o) => o.name).join(", ")}</span>
          </p>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={removeOrphans}
              className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-coral-400 hover:text-coral-600"
            >
              {t("orphanRemove")}
            </button>
            <button
              type="button"
              onClick={() => setOrphans([])}
              className="text-xs font-medium text-muted transition-colors hover:text-navy-800"
            >
              {t("orphanKeep")}
            </button>
          </span>
        </div>
      )}

      {/* AI generation states */}
      {ai.status === "loading" && <LoadingTimer expectedMs={ai.expectedMs} />}
      {ai.status === "error" &&
        (ai.timedOut ? (
          <TimeoutState onRetry={runTailor} />
        ) : (
          <ToolError message={ai.error ?? ""} onRetry={runTailor} retryIn={ai.retryIn} upgradeUrl={ai.upgradeUrl} />
        ))}
      {ai.status === "done" && ai.data && !applied && (
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

      {/* Quick win callout (only while undecided) */}
      {quickWin && (
        <button
          type="button"
          onClick={() => openWizard([quickWin])}
          className="group flex w-full items-center gap-3 rounded-card border border-positive/40 bg-positive-soft px-4 py-3 text-left transition-colors hover:border-positive"
        >
          <Bolt width={18} height={18} className="shrink-0 text-positive" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-navy-800">
              {t("quickWin")}: {quickWin.name}
            </span>
            <span className="block truncate text-xs text-muted">{t("quickWinHint")}</span>
          </span>
          <ArrowRight width={16} height={16} className="shrink-0 text-positive transition-transform group-hover:translate-x-1" />
        </button>
      )}

      {/* Signpost table: fit + mode + stage + the ONE next step per channel */}
      <ChannelTable
        channels={channels}
        tracks={tracks}
        nextOf={nextOf}
        degraded={degraded}
        onOpen={setOpenId}
        onNext={doNext}
      />

      <NextSteps
        steps={[
          { to: "obsahovy-engine", label: t("stepContent"), hint: t("stepContentHint") },
          { to: "socialni", label: t("stepSocial"), hint: t("stepSocialHint") },
        ].filter((s) => isModuleAvailable(projectType, s.to))}
      />

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
