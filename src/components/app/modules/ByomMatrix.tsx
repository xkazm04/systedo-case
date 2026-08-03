"use client";

import { useT } from "@/lib/i18n/client";
import {
  BYOM_MODEL_CATALOG,
  BYOM_OPERATIONS,
  BYOM_OPERATION_LABELS,
  BYOM_VENDOR_LABELS,
  REASONING_LABELS,
  REASONING_LEVELS,
  type ByomVendor,
  type PublicByomConfig,
  type ReasoningLevel,
} from "@/lib/llm/keys/types";
import {
  bestModelForOp,
  cellComposite,
  formatMeasuredAge,
  isMeasurementStale,
  isSelfJudged,
  matrixSlug,
} from "@/lib/llm/quality";
import { QUALITY_SCORES, hasQualityScores } from "@/lib/llm/quality-scores";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useAsyncAction } from "@/components/hooks/useAsyncAction";
import { useByomConfig } from "@/components/hooks/useByomConfig";

const T = {
  cs: {
    title: "Matice operací",
    subtitle:
      "Přiřaďte každé AI operaci vlastního poskytovatele, model a úroveň uvažování. Nepřiřazené operace používají výchozího aktivního poskytovatele.",
    needKey: "Nejprve připojte alespoň jeden API klíč výše, pak sem přiřaďte operace.",
    colOperation: "Operace",
    colProvider: "Poskytovatel",
    colModel: "Model",
    colReasoning: "Uvažování",
    inherit: "Výchozí",
    recTitle: "Nejlepší naměřený model: {model}",
    recSelfJudge: " (pozor: model rodiny rozhodčího claude-sonnet — home-team bias)",
    measured: "★ = nejlepší naměřený model · změřeno {date} ({age}).",
    stale: " ⚠ skóre může být zastaralé.",
    errGeneric: "Něco se pokazilo.",
    errNetwork: "Nepodařilo se spojit se serverem.",
  },
  en: {
    title: "Operations matrix",
    subtitle:
      "Assign each AI operation its own provider, model and reasoning level. Unassigned operations use the default active provider.",
    needKey: "Connect at least one API key above first, then assign operations here.",
    colOperation: "Operation",
    colProvider: "Provider",
    colModel: "Model",
    colReasoning: "Reasoning",
    inherit: "Default",
    recTitle: "Best measured model: {model}",
    recSelfJudge: " (note: same family as the judge claude-sonnet — home-team bias)",
    measured: "★ = best measured model · measured {date} ({age}).",
    stale: " ⚠ scores may be stale.",
    errGeneric: "Something went wrong.",
    errNetwork: "Could not reach the server.",
  },
} as const;

const selectClass =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50";

export default function ByomMatrix() {
  const t = useT(T);
  // Operation names come from the shared {cs, en} table so a new tool ships its
  // row localized, not hardcoded Czech.
  const tOp = useT(BYOM_OPERATION_LABELS);
  const { locale } = useLocale();
  // Shared config source of truth (single fetch for the whole AI-settings page);
  // stays in sync when ByomKeys connects/removes a key. ByomKeys owns the section's
  // loading/error chrome, so the matrix simply stays absent until config is ready.
  const { state, patch } = useByomConfig();
  // `busy` is a plain boolean here: every select is disabled while any single
  // mutation is in flight (no per-row keying), so the shared hook fits exactly.
  const { busy, error, setError, run } = useAsyncAction();

  function apply(url: string, opts: RequestInit): Promise<void | undefined> {
    return run(
      async () => {
        const res = await fetch(url, opts);
        const json = (await res.json().catch(() => ({}))) as { error?: string; config?: PublicByomConfig };
        if (!res.ok) {
          setError(json.error ?? t("errGeneric"));
          return;
        }
        if (json.config) patch(json.config);
      },
      { serverError: t("errNetwork") }
    );
  }

  const setOp = (toolId: string, vendor: ByomVendor, model: string, reasoning: ReasoningLevel) =>
    apply("/api/byom/matrix", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolId, vendor, model, reasoning }),
    });

  const clearOp = (toolId: string) =>
    apply(`/api/byom/matrix?toolId=${toolId}`, { method: "DELETE" });

  if (!state || !state.entitled) return null; // ByomKeys renders the upsell for the whole area

  const configured = state.config.keys.map((k) => k.vendor);

  return (
    <section className="mt-8 max-w-3xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-navy-800">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
        {hasQualityScores() && (
          <p className="mt-1 text-xs text-muted">
            {t("measured", {
              date: QUALITY_SCORES.measuredAt.slice(0, 10),
              age: formatMeasuredAge(QUALITY_SCORES.measuredAt, locale),
            })}
            {isMeasurementStale(QUALITY_SCORES.measuredAt) && (
              <span className="text-coral-600">{t("stale")}</span>
            )}
          </p>
        )}
      </div>

      {configured.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-muted">
          {t("needKey")}
        </p>
      ) : (
        <div className="card overflow-hidden p-0">
          {error && (
            <p className="border-b border-line bg-negative-soft px-4 py-2.5 text-sm text-negative" role="alert">
              {error}
            </p>
          )}
          <div className="hidden grid-cols-[1.4fr_1fr_1.2fr_1fr] gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
            <span>{t("colOperation")}</span>
            <span>{t("colProvider")}</span>
            <span>{t("colModel")}</span>
            <span>{t("colReasoning")}</span>
          </div>

          {BYOM_OPERATIONS.map((op) => {
            const ov = state.config.operations?.[op.id];
            const vendor = ov?.vendor;
            const models = vendor ? BYOM_MODEL_CATALOG[vendor].models : [];
            const modelOpt = models.find((m) => m.id === ov?.model);
            const reasoningDisabled = !vendor || Boolean(modelOpt?.noReasoning) || busy;
            const rec = hasQualityScores() ? bestModelForOp(QUALITY_SCORES, op.id) : null;

            return (
              <div
                key={op.id}
                className="grid grid-cols-1 gap-2 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1.4fr_1fr_1.2fr_1fr] sm:items-center sm:gap-3"
              >
                <span className="text-sm font-medium text-navy-800">
                  {tOp(op.id)}
                  {rec && (
                    <span
                      className="ml-2 whitespace-nowrap text-xs font-normal text-brand-accent"
                      title={
                        t("recTitle", { model: rec.model }) +
                        (isSelfJudged(QUALITY_SCORES.judge, rec.model) ? t("recSelfJudge") : "")
                      }
                    >
                      ★ {rec.model.split("/").pop()} {rec.composite.toFixed(1)}
                    </span>
                  )}
                </span>

                {/* provider */}
                <select
                  aria-label={`${tOp(op.id)} — ${t("colProvider")}`}
                  className={selectClass}
                  value={vendor ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return void clearOp(op.id);
                    const vend = v as ByomVendor;
                    const cat = BYOM_MODEL_CATALOG[vend];
                    const first = cat.models.find((m) => m.id === cat.default);
                    const reasoning: ReasoningLevel = first?.noReasoning
                      ? "default"
                      : first?.reasoning ?? "default";
                    void setOp(op.id, vend, cat.default, reasoning);
                  }}
                >
                  <option value="">— {t("inherit")} —</option>
                  {configured.map((v) => (
                    <option key={v} value={v}>
                      {BYOM_VENDOR_LABELS[v]}
                    </option>
                  ))}
                </select>

                {/* model */}
                <select
                  aria-label={`${tOp(op.id)} — ${t("colModel")}`}
                  className={selectClass}
                  value={ov?.model ?? ""}
                  disabled={!vendor || busy}
                  onChange={(e) => {
                    if (!vendor) return;
                    const model = e.target.value;
                    const mo = BYOM_MODEL_CATALOG[vendor].models.find((m) => m.id === model);
                    const reasoning: ReasoningLevel = mo?.noReasoning
                      ? "default"
                      : ov?.reasoning ?? mo?.reasoning ?? "default";
                    void setOp(op.id, vendor, model, reasoning);
                  }}
                >
                  {vendor ? (
                    models.map((m) => {
                      const s = hasQualityScores()
                        ? cellComposite(QUALITY_SCORES, op.id, matrixSlug(vendor, m.id))
                        : null;
                      return (
                        <option key={m.id} value={m.id}>
                          {`${m.id}${s !== null ? ` · ${s.toFixed(1)}` : ""}`}
                        </option>
                      );
                    })
                  ) : (
                    <option value="">—</option>
                  )}
                </select>

                {/* reasoning */}
                <select
                  aria-label={`${tOp(op.id)} — ${t("colReasoning")}`}
                  className={selectClass}
                  value={modelOpt?.noReasoning ? "default" : ov?.reasoning ?? "default"}
                  disabled={reasoningDisabled}
                  onChange={(e) => {
                    if (!vendor || !ov?.model) return;
                    void setOp(op.id, vendor, ov.model, e.target.value as ReasoningLevel);
                  }}
                >
                  {REASONING_LEVELS.map((r) => (
                    <option key={r} value={r}>
                      {REASONING_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
