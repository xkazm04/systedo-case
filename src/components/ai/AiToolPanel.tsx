"use client";

/** Shared AI-tool panel kit. LtvDiagnosisPanel, LeadSourceDiagnosisPanel and
 *  LpVariantIdeasPanel wrapped the SAME plumbing around a tool-specific body: the
 *  card shell + header, the idle / loading / error / timeout state machine, and
 *  the done block (ResultMeta → body → RefineBar → PromptDisclosure). This
 *  centralises all of it so the three panels render only their header controls and
 *  their result body, and behave identically. Presentational only — each panel
 *  still owns its `useAiTool` hook, so request/response shapes are unchanged. */
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { AiMeta, AiResponse } from "@/lib/ai-types";
import { Sparkles } from "@/components/icons";
import {
  LoadingTimer,
  PromptDisclosure,
  RefineBar,
  ResultMeta,
  TimeoutState,
  ToolError,
} from "./primitives";

/** The slice of a `useAiTool` return the panel kit consumes (a panel passes its
 *  whole hook object; the extra members like `run`/`history` are ignored). */
export interface AiPanelTool<T> {
  status: "idle" | "loading" | "done" | "error";
  data: AiResponse<T> | null;
  error: string | null;
  retryIn: number | null;
  upgradeUrl: string | null;
  timedOut: boolean;
  expectedMs: number | null;
  reset: () => void;
  refine: (note: string) => void;
  canRefine: boolean;
}

/** The card header: icon + title + description on the left, the panel's own
 *  controls (a select, the run button) on the right. */
export function AiPanelHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Icon width={16} height={16} className="shrink-0 text-brand-accent" />
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** The shared primary run button (icon + brand pill), pulsing while loading. */
export function AiRunButton({
  onClick,
  loading,
  disabled,
  idleLabel,
  loadingLabel,
  icon: Icon = Sparkles,
}: {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  idleLabel: string;
  loadingLabel: string;
  /** defaults to Sparkles */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
    >
      <Icon width={15} height={15} className={loading ? "animate-pulse" : ""} />
      {loading ? loadingLabel : idleLabel}
    </button>
  );
}

/** A persisted result to render on load, before any run this session — the durable
 *  latest diagnosis (Direction 1). `below` carries the status lifecycle + handoff. */
export interface AiPanelInitial<T> {
  result: T;
  below?: ReactNode;
}

/** Card shell + the idle / loading / error / done state machine. `renderResult`
 *  runs ONLY when a result is ready (with the typed result + its meta), so a
 *  panel body never dereferences a missing result. The done block always renders
 *  ResultMeta first and the refine bar + prompt disclosure last, identically.
 *
 *  `initial` renders a persisted result in the idle state (a diagnosis saved on a
 *  previous visit) instead of the idle hint, so the latest shows on module load —
 *  a live run then replaces it. `resultFooter` renders under a fresh result (the
 *  status + handoff bar for the just-run, now-persisted diagnosis). */
export function AiToolPanel<T>({
  header,
  tool,
  idleHint,
  renderResult,
  initial,
  resultFooter,
}: {
  header: ReactNode;
  tool: AiPanelTool<T>;
  idleHint: ReactNode;
  renderResult: (result: T, meta: AiMeta) => ReactNode;
  initial?: AiPanelInitial<T> | null;
  resultFooter?: ReactNode;
}) {
  const { status, data, error, retryIn, upgradeUrl, timedOut, expectedMs, reset, refine, canRefine } = tool;
  // Persisted results carry no AiMeta; the panel bodies read only the result, so a
  // stub meta keeps renderResult's signature satisfied without a live generation.
  const STUB_META: AiMeta = { model: "", demo: false, prompt: "", tookMs: 0 };
  return (
    <div className="card overflow-hidden">
      {header}
      <div className="p-5">
        {status === "idle" &&
          (initial ? (
            <div className="space-y-5">
              {renderResult(initial.result, STUB_META)}
              {initial.below}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted">{idleHint}</p>
          ))}

        {status === "loading" && <LoadingTimer expectedMs={expectedMs} />}

        {status === "error" &&
          (timedOut ? (
            <TimeoutState onRetry={reset} />
          ) : (
            <ToolError message={error ?? ""} onRetry={reset} retryIn={retryIn} upgradeUrl={upgradeUrl} />
          ))}

        {status === "done" && data && (
          <div className="animate-fade-up space-y-5">
            <ResultMeta meta={data.meta} />
            {renderResult(data.result, data.meta)}
            {resultFooter}
            {canRefine && <RefineBar onRefine={refine} />}
            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
