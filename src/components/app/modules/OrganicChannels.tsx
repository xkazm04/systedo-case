"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { ArrowRight, Bolt, Broadcast, Check, Link as LinkIcon, Sparkles } from "@/components/icons";
import Modal from "@/components/app/Modal";
import NextSteps from "@/components/app/NextSteps";
import { useAiTool } from "@/components/ai/useAiTool";
import { LoadingTimer, RefineBar, ResultMeta, TimeoutState, ToolError } from "@/components/ai/primitives";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import { isModuleAvailable } from "@/lib/projects/modules";
import type { ChannelResearchResult } from "@/lib/ai-types";
import type { ProjectType } from "@/lib/projects/types";
import {
  type ChannelCategory,
  type ChannelEffort,
  type ChannelStatus,
  type OrganicChannel,
} from "@/lib/organic-channels/types";

/** Grounding the page resolves server-side and threads into the AI "tailor" call. */
export interface ChannelGrounding {
  offering?: string;
  localities?: string[];
  competitors?: string[];
  keywords?: string[];
}

const T = {
  cs: {
    sourceSample: "Ukázkový plán",
    sourceAi: "Plán na míru (AI)",
    intro:
      "Kde vás zákazníci najdou zdarma — bez rozpočtu na reklamu. Každý kanál má vhodnost, náročnost a konkrétní první kroky. Kliknutím na řádek otevřete playbook.",
    tailorCta: "Sestavit plán na míru (AI)",
    tailoring: "Sestavuji plán…",
    regenerate: "Přegenerovat",
    quickWin: "Rychlá výhra",
    quickWinHint: "Nízká náročnost, vysoká vhodnost — začněte tady.",
    colChannel: "Kanál",
    colFit: "Vhodnost",
    colEffort: "Náročnost",
    colStatus: "Stav",
    fitLabel: "Vhodnost",
    effortLabel: "Náročnost",
    channels: "{n} kanálů",
    aiReadyTitle: "Plán na míru je připravený",
    aiReadyBody: "Nahraďte ukázkový plán touto verzí přizpůsobenou vaší firmě.",
    applyPlan: "Použít tento plán",
    dismiss: "Zavřít",
    revertSample: "Zpět na ukázkový plán",
    reverting: "Vracím…",
    stepContent: "Obsahový engine",
    stepContentHint: "Napište obsah pro vybraný kanál",
    stepSocial: "Sociální sítě",
    stepSocialHint: "Naplánujte a publikujte příspěvky",
    // modal / playbook
    why: "Proč právě tento kanál",
    payoff: "Co přinese",
    firstSteps: "První kroky",
    visit: "Otevřít kanál",
    createContent: "Vytvořit obsah pro tento kanál",
    statusSet: "Stav:",
    markNotStarted: "Nezačato",
    markActive: "Probíhá",
    markDone: "Hotovo",
  },
  en: {
    sourceSample: "Sample plan",
    sourceAi: "Tailored plan (AI)",
    intro:
      "Where customers find you for free — no ad budget. Each channel has a fit, an effort level and concrete first steps. Click a row to open the playbook.",
    tailorCta: "Build a tailored plan (AI)",
    tailoring: "Building the plan…",
    regenerate: "Regenerate",
    quickWin: "Quick win",
    quickWinHint: "Low effort, high fit — start here.",
    colChannel: "Channel",
    colFit: "Fit",
    colEffort: "Effort",
    colStatus: "Status",
    fitLabel: "Fit",
    effortLabel: "Effort",
    channels: "{n} channels",
    aiReadyTitle: "Your tailored plan is ready",
    aiReadyBody: "Replace the sample plan with this version tailored to your business.",
    applyPlan: "Use this plan",
    dismiss: "Dismiss",
    revertSample: "Back to sample plan",
    reverting: "Reverting…",
    stepContent: "Content engine",
    stepContentHint: "Write content for the chosen channel",
    stepSocial: "Social",
    stepSocialHint: "Plan and publish posts",
    why: "Why this channel",
    payoff: "What it delivers",
    firstSteps: "First steps",
    visit: "Open channel",
    createContent: "Create content for this channel",
    statusSet: "Status:",
    markNotStarted: "Not started",
    markActive: "In progress",
    markDone: "Done",
  },
} as const;

const CATEGORY_LABELS: Record<ChannelCategory, { cs: string; en: string }> = {
  directory: { cs: "Katalog", en: "Directory" },
  marketplace: { cs: "Porovnávač", en: "Marketplace" },
  community: { cs: "Komunita", en: "Community" },
  content: { cs: "Obsah", en: "Content" },
  social: { cs: "Sociální síť", en: "Social" },
  pr: { cs: "PR", en: "PR" },
  partnership: { cs: "Partnerství", en: "Partnership" },
};

const EFFORT_LABELS: Record<ChannelEffort, { cs: string; en: string; tone: string }> = {
  low: { cs: "Nízká", en: "Low", tone: "bg-positive-soft text-positive" },
  medium: { cs: "Střední", en: "Medium", tone: "bg-coral-soft text-coral-600" },
  high: { cs: "Vysoká", en: "High", tone: "bg-navy-50 text-navy-700" },
};

const STATUS_LABELS: Record<ChannelStatus, { cs: string; en: string; tone: string }> = {
  "not-started": { cs: "Nezačato", en: "Not started", tone: "bg-navy-50 text-muted" },
  active: { cs: "Probíhá", en: "In progress", tone: "bg-brand-50 text-brand-700" },
  done: { cs: "Hotovo", en: "Done", tone: "bg-positive-soft text-positive" },
};

/** The Kanály module: a project's ranked plan of zero-ad-spend visibility channels,
 *  each a table row that opens a playbook modal. A user can track each channel's
 *  status (persisted), regenerate a plan tailored to the business with AI, and hand
 *  a channel's content angle to the content engine. */
export default function OrganicChannels({
  channels: initialChannels,
  statuses: initialStatuses,
  source: initialSource,
  projectType,
  grounding,
}: {
  channels: OrganicChannel[];
  statuses: Record<string, ChannelStatus>;
  source: "sample" | "ai";
  projectType: ProjectType;
  grounding: ChannelGrounding;
}) {
  const project = useProject();
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const [channels, setChannels] = useState<OrganicChannel[]>(initialChannels);
  const [statuses, setStatuses] = useState<Record<string, ChannelStatus>>(initialStatuses);
  const [source, setSource] = useState<"sample" | "ai">(initialSource);
  const [openId, setOpenId] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const ai = useAiTool<ChannelResearchResult>("channel-research");

  const open = channels.find((c) => c.id === openId) ?? null;

  const quickWin = useMemo(
    () => channels.find((c) => c.effort === "low" && c.fit >= 70) ?? null,
    [channels]
  );

  const statusOf = (id: string): ChannelStatus => statuses[id] ?? "not-started";

  /** Persist the current desired state (statuses + pinned plan when the source is
   *  AI). Fire-and-forget: a demo project (or a failed save) just keeps the local
   *  state — the same graceful degradation the other demo-capable modules use. */
  const persist = (next: {
    statuses: Record<string, ChannelStatus>;
    plan?: OrganicChannel[];
  }) => {
    void fetch(`/api/projects/${project.id}/organic-channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => {});
  };

  const setStatus = (id: string, status: ChannelStatus) => {
    setStatuses((prev) => {
      const next = { ...prev };
      if (status === "not-started") delete next[id];
      else next[id] = status;
      persist({ statuses: next, ...(source === "ai" ? { plan: channels } : {}) });
      return next;
    });
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

  /** Pin the AI plan as the module's source of truth (replaces the sample). */
  const applyPlan = () => {
    const plan = ai.data?.result.channels;
    if (!plan || plan.length === 0) return;
    setChannels(plan);
    setSource("ai");
    setApplied(true);
    persist({ statuses, plan });
  };

  /** Drop the pinned plan + statuses, back to the seeded sample. */
  const revertSample = () => {
    setChannels(initialChannels);
    setSource("sample");
    setStatuses({});
    setApplied(false);
    void fetch(`/api/projects/${project.id}/organic-channels`, { method: "DELETE" }).catch(() => {});
  };

  /** Hand a channel's content angle to the content engine via the shared BriefSeed
   *  session bridge, then route there — the "research → playbook → draft" loop. */
  const createContent = (channel: OrganicChannel) => {
    const topic =
      channel.contentAngle || `${channel.name}: příspěvek pro ${project.name}`;
    try {
      sessionStorage.setItem(
        briefSeedKey(project.id),
        JSON.stringify({ topic, primaryKeyword: project.name, keywords: [] })
      );
    } catch {
      /* storage unavailable — still navigate; the engine opens unseeded */
    }
    router.push(`/app/${project.id}/obsahovy-engine`);
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
          <p className="text-sm leading-relaxed text-muted">{t("intro")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={runTailor}
            disabled={ai.status === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>
      </div>

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
              className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
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

      {/* Quick win callout */}
      {quickWin && (
        <button
          type="button"
          onClick={() => setOpenId(quickWin.id)}
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

      {/* Channels table */}
      <div className="overflow-hidden rounded-card border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-3">{t("colChannel")}</th>
              <th className="hidden px-4 py-3 sm:table-cell">{t("colFit")}</th>
              <th className="hidden px-4 py-3 sm:table-cell">{t("colEffort")}</th>
              <th className="px-4 py-3">{t("colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="cursor-pointer border-b border-line last:border-0 transition-colors hover:bg-canvas"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-navy-800">{c.name}</span>
                    <span className="pill bg-navy-50 text-muted">{CATEGORY_LABELS[c.category][L]}</span>
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-navy-50" aria-hidden>
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${c.fit}%` }} />
                    </span>
                    <span className="tnum text-xs font-semibold text-navy-800">{c.fit}</span>
                  </span>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <span className={`pill ${EFFORT_LABELS[c.effort].tone}`}>{EFFORT_LABELS[c.effort][L]}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${STATUS_LABELS[statusOf(c.id)].tone}`}>
                    {STATUS_LABELS[statusOf(c.id)][L]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NextSteps
        steps={[
          { to: "obsahovy-engine", label: t("stepContent"), hint: t("stepContentHint") },
          { to: "socialni", label: t("stepSocial"), hint: t("stepSocialHint") },
        ].filter((s) => isModuleAvailable(projectType, s.to))}
      />

      {/* Playbook modal */}
      <Modal
        open={open !== null}
        onClose={() => setOpenId(null)}
        title={
          open ? (
            <span className="flex items-center gap-2">
              <Broadcast width={18} height={18} className="text-brand-accent" />
              {open.name}
            </span>
          ) : undefined
        }
        description={open ? `${CATEGORY_LABELS[open.category][L]} · ${t("fitLabel")} ${open.fit} · ${t("effortLabel")} ${EFFORT_LABELS[open.effort][L]}` : undefined}
        size="md"
      >
        {open && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("why")}</p>
              <p className="mt-1 text-sm leading-relaxed text-navy-700">{open.rationale}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("payoff")}</p>
              <p className="mt-1 text-sm leading-relaxed text-navy-700">{open.payoff}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("firstSteps")}</p>
              <ol className="mt-2 space-y-2">
                {open.firstActions.map((a, i) => (
                  <li key={i} className="flex gap-3 text-sm text-navy-700">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{a}</span>
                  </li>
                ))}
              </ol>
            </div>

            {open.url && (
              <a
                href={open.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent hover:text-brand-800"
              >
                <LinkIcon width={14} height={14} />
                {t("visit")}
              </a>
            )}

            {/* Status setter */}
            <div className="rounded-card border border-line bg-canvas px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("statusSet")}</p>
              <div className="flex flex-wrap gap-2">
                {(["not-started", "active", "done"] as ChannelStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatus(open.id, st)}
                    aria-pressed={statusOf(open.id) === st}
                    className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      statusOf(open.id) === st
                        ? "border-brand-400 bg-brand-50 text-brand-800"
                        : "border-line text-muted hover:border-navy-200"
                    }`}
                  >
                    {STATUS_LABELS[st][L]}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => createContent(open)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99]"
            >
              <Bolt width={16} height={16} />
              {t("createContent")}
              <ArrowRight width={16} height={16} />
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
