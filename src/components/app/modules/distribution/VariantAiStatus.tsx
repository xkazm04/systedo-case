/** The AI generation status strip under a variant editor: generating / failed /
 *  demo-mode, plus the refine bar once a model variant is on screen. The text
 *  itself (AI or deterministic) always stays in the editor above — none of these
 *  states replace content, they only explain it. */
"use client";

import { Info, Sparkles } from "@/components/icons";
import { RefineBar } from "@/components/ai/primitives";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    generatingMsg: "Generuji variantu na míru kanálu… mezitím vidíte deterministický návrh.",
    timedOut: "Model neodpověděl včas. Ponecháváme deterministický návrh.",
    errorMsg: "Generování selhalo{detail}. Ponecháváme deterministický návrh.",
    retryBtn: "Zkusit znovu",
    demoMode: "Ukázkový režim (bez API klíče). Připojte LLM pro generování modelem.",
  },
  en: {
    generatingMsg: "Generating a channel-native variant… the deterministic draft stays on screen in the meantime.",
    timedOut: "The model did not respond in time. Keeping the deterministic draft.",
    errorMsg: "Generation failed{detail}. Keeping the deterministic draft.",
    retryBtn: "Retry",
    demoMode: "Demo mode (no API key). Connect an LLM for model-generated variants.",
  },
} as const;

export default function VariantAiStatus({
  status,
  timedOut,
  error,
  showDemo,
  canRefine,
  onRefine,
  onRetry,
}: {
  status: "idle" | "loading" | "done" | "error";
  timedOut: boolean;
  error: string | null;
  /** the applied variant came from the keyless deterministic fallback */
  showDemo: boolean;
  canRefine: boolean;
  onRefine: (note: string) => void;
  onRetry: () => void;
}) {
  const t = useT(T);
  return (
    <>
      {status === "loading" ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <Sparkles width={14} height={14} className="shrink-0 animate-pulse" />
          {t("generatingMsg")}
        </p>
      ) : null}
      {status === "error" ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-xs">
          <span className="text-negative">
            {timedOut ? t("timedOut") : t("errorMsg", { detail: error ? `: ${error}` : "" })}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 hover:border-brand-300"
          >
            {t("retryBtn")}
          </button>
        </div>
      ) : null}
      {showDemo ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-coral-soft bg-coral-soft px-3 py-2 text-xs text-coral-600">
          <Info width={14} height={14} className="shrink-0" />
          {t("demoMode")}
        </p>
      ) : null}
      {/* Iterate on the AI variant with a steering note — same article, same
          channel, plus the user's instruction (server-side `refine`). */}
      {canRefine ? (
        <div className="mt-2">
          <RefineBar onRefine={onRefine} disabled={status !== "done"} />
        </div>
      ) : null}
    </>
  );
}
