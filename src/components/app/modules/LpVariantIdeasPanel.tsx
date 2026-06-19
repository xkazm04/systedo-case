"use client";

/** Client-only „Navrhnout varianty“ panel co-located with the server-rendered
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
  ResultMeta,
  TimeoutState,
  ToolError,
} from "@/components/ai/primitives";

/** The few fields the panel needs per experiment — a projection built by the
 *  parent server component, so no compute / sample data ships with the client. */
export interface LpVariantSeed {
  id: string;
  /** the keyword cluster the experiment targets — the topic seed */
  cluster: string;
  status: "running" | "done";
  /** the control variant's label (first variant) — pitched against */
  controlLabel: string;
  /** any additional keyword-ish phrases to ground the concepts */
  keywords?: string[];
}

/** Build the request from the picked seed at click time (never during render). */
function buildRequest(seed: LpVariantSeed): LpVariantIdeasRequest {
  const req: LpVariantIdeasRequest = {
    topic: seed.cluster,
    controlLabel: seed.controlLabel,
    controlDescription: `Kontrolní varianta „${seed.controlLabel}“ landing page pro klastr „${seed.cluster}“.`,
  };
  if (seed.keywords && seed.keywords.length > 0) req.keywords = seed.keywords;
  return req;
}

export default function LpVariantIdeasPanel({ seeds }: { seeds: LpVariantSeed[] }) {
  const { status, data, error, timedOut, run, reset } =
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
            Navrhnout varianty
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Model navrhne 2–3 konkurenční varianty (challengery) z klastru experimentu, které můžete
            otestovat proti kontrole. Žádná čísla si nevymýšlí.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {seeds.length > 1 && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={status === "loading"}
              aria-label="Vyberte experiment"
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
            onClick={() => status !== "loading" && selected && run(buildRequest(selected) as unknown as Record<string, unknown>)}
            disabled={status === "loading" || !selected}
            className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            <Sparkles width={15} height={15} className={status === "loading" ? "animate-pulse" : ""} />
            {status === "loading" ? "Navrhuji…" : "Navrhnout varianty"}
          </button>
        </div>
      </div>

      <div className="p-5">
        {status === "idle" && (
          <p className="text-sm leading-relaxed text-muted">
            Vyberte experiment a klikněte na „Navrhnout varianty“. Model z klastru navrhne nové
            challengery k otestování proti kontrole. Funguje i bez API klíče v ukázkovém režimu.
          </p>
        )}

        {status === "loading" && <LoadingTimer />}

        {status === "error" &&
          (timedOut ? (
            <TimeoutState onRetry={reset} />
          ) : (
            <ToolError message={error ?? ""} onRetry={reset} />
          ))}

        {status === "done" && r && data && (
          <div className="animate-fade-up space-y-5">
            <ResultMeta meta={data.meta} />

            {selected && (
              <p className="text-xs text-muted">
                Návrhy pro klastr{" "}
                <span className="font-medium text-navy-700">„{selected.cluster}“</span> vs kontrola{" "}
                <span className="font-medium text-navy-700">„{selected.controlLabel}“</span>.
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
                    <Pill tone="brand">Challenger</Pill>
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

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
