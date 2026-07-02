"use client";

/** Client-only "Suggest variants" panel co-located with the server-rendered
 *  LpExperimentsModule. Receives a lightweight projection of the experiments
 *  (cluster, status, control label + control conversion angle), lets the user pick
 *  one and asks the shared /api/ai „lp-variant-ideas“ tool for 2–3 challenger
 *  concepts to test against that experiment's control. The request is built lazily
 *  on click (no work during render) so the parent stays a pure server component.
 *  Renders the concepts as draftable challenger cards with the module's card / Pill
 *  styling, plus loading / error / timeout / demo states. */
import { useState } from "react";
import { Pill } from "@/components/ui";
import { Beaker, Sparkles, Bulb, Target } from "@/components/icons";
import type { LpVariantIdeasRequest, LpVariantIdeasResult } from "@/lib/ai-types";
import { useAiTool } from "@/components/ai/useAiTool";
import {
  LoadingTimer,
  PromptDisclosure,
  RefineBar,
  ResultMeta,
  TimeoutState,
  ToolError,
} from "@/components/ai/primitives";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    panelTitle: "Navrhnout varianty",
    panelHint: "Model navrhne 2–3 konkurenční varianty (challengery) z klastru experimentu, které můžete otestovat proti kontrole. Žádná čísla si nevymýšlí.",
    selectExperiment: "Vyberte experiment",
    suggestBtn: "Navrhnout varianty",
    suggestingBtn: "Navrhuji…",
    idleHint: "Vyberte experiment a klikněte na „Navrhnout varianty“. Model z klastru navrhne nové challengery k otestování proti kontrole. Funguje i bez API klíče v ukázkovém režimu.",
    proposalsFor: "Návrhy pro klastr",
    vsControl: "vs kontrola",
    challenger: "Challenger",
    controlDescription: "Kontrolní varianta „{label}“ landing page pro klastr „{cluster}“.",
  },
  en: {
    panelTitle: "Suggest variants",
    panelHint: "The model will suggest 2–3 challenger concepts from the experiment cluster to test against your control. No numbers are fabricated.",
    selectExperiment: "Select experiment",
    suggestBtn: "Suggest variants",
    suggestingBtn: "Suggesting…",
    idleHint: "Select an experiment and click “Suggest variants”. The model will propose new challengers from the cluster to test against the control. Works without an API key in demo mode.",
    proposalsFor: "Suggestions for cluster",
    vsControl: "vs control",
    challenger: "Challenger",
    controlDescription: "Control variant “{label}” landing page for cluster “{cluster}”.",
  },
} as const;

/** The few fields the panel needs per experiment — a projection built by the
 *  parent server component, so no compute / sample data ships with the client. */
export interface LpVariantSeed {
  id: string;
  /** the keyword cluster the experiment targets — the topic seed */
  cluster: string;
  status: "running" | "done";
  /** the control variant's label (first variant) — pitched against */
  controlLabel: string;
  /** the control's conversion rate (0–1) — the bar challengers must beat */
  controlCvr?: number;
  /** labels of arms already tested that LOST to control — don't re-propose them */
  losers?: string[];
  /** any additional keyword-ish phrases to ground the concepts */
  keywords?: string[];
}

/** Build the request from the picked seed at click time (never during render). */
function buildRequest(seed: LpVariantSeed, controlDescription: string): LpVariantIdeasRequest {
  const req: LpVariantIdeasRequest = {
    topic: seed.cluster,
    controlLabel: seed.controlLabel,
    controlDescription,
  };
  if (seed.keywords && seed.keywords.length > 0) req.keywords = seed.keywords;
  if (typeof seed.controlCvr === "number") req.controlCvr = seed.controlCvr;
  if (seed.losers && seed.losers.length > 0) req.losers = seed.losers;
  return req;
}

export default function LpVariantIdeasPanel({ seeds }: { seeds: LpVariantSeed[] }) {
  const t = useT(T);
  const { status, data, error, retryIn, upgradeUrl, timedOut, run, reset, refine, canRefine } =
    useAiTool<LpVariantIdeasResult>("lp-variant-ideas");
  const [selectedId, setSelectedId] = useState(seeds[0]?.id ?? "");
  const selected = seeds.find((s) => s.id === selectedId) ?? seeds[0];
  const r = data?.result;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
            <Beaker width={16} height={16} className="shrink-0 text-brand-accent" />
            {t("panelTitle")}
          </p>
          <p className="mt-0.5 text-xs text-muted">{t("panelHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          {seeds.length > 1 && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={status === "loading"}
              aria-label={t("selectExperiment")}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {seeds.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.cluster}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => {
              if (status !== "loading" && selected) {
                const desc = t("controlDescription", { label: selected.controlLabel, cluster: selected.cluster });
                run(buildRequest(selected, desc) as unknown as Record<string, unknown>);
              }
            }}
            disabled={status === "loading" || !selected}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            <Sparkles width={15} height={15} className={status === "loading" ? "animate-pulse" : ""} />
            {status === "loading" ? t("suggestingBtn") : t("suggestBtn")}
          </button>
        </div>
      </div>

      <div className="p-5">
        {status === "idle" && (
          <p className="text-sm leading-relaxed text-muted">{t("idleHint")}</p>
        )}

        {status === "loading" && <LoadingTimer />}

        {status === "error" &&
          (timedOut ? (
            <TimeoutState onRetry={reset} />
          ) : (
            <ToolError message={error ?? ""} onRetry={reset} retryIn={retryIn} upgradeUrl={upgradeUrl} />
          ))}

        {status === "done" && r && data && (
          <div className="animate-fade-up space-y-5">
            <ResultMeta meta={data.meta} />

            {selected && (
              <p className="text-xs text-muted">
                {t("proposalsFor")}{" "}
                <span className="font-medium text-navy-700">“{selected.cluster}”</span> {t("vsControl")}{" "}
                <span className="font-medium text-navy-700">“{selected.controlLabel}”</span>.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {r.variants.map((v, i) => (
                <div key={i} className="card border-brand-200 bg-brand-50/40 p-4">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-navy-800">
                      <Beaker width={14} height={14} className="shrink-0 text-brand-accent" />
                      <span className="truncate">{v.label}</span>
                    </span>
                    <Pill tone="brand">{t("challenger")}</Pill>
                  </div>

                  <p className="text-sm font-medium leading-snug text-navy-800">{v.headline}</p>

                  <div className="mt-3 flex items-start gap-2">
                    <Target width={15} height={15} className="mt-0.5 shrink-0 text-brand-600" />
                    <p className="text-xs leading-relaxed text-navy-700">{v.hypothesis}</p>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="pill bg-positive-soft text-positive">{v.primaryCTA}</span>
                  </div>

                  {v.rationale && (
                    <div className="mt-3 flex items-start gap-2 border-t border-line pt-2.5">
                      <Bulb width={14} height={14} className="mt-0.5 shrink-0 text-positive" />
                      <p className="text-xs leading-relaxed text-muted">{v.rationale}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {canRefine && <RefineBar onRefine={refine} />}

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
