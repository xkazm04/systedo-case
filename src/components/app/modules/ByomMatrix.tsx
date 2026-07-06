"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  BYOM_MODEL_CATALOG,
  BYOM_OPERATIONS,
  BYOM_VENDOR_LABELS,
  REASONING_LABELS,
  REASONING_LEVELS,
  type ByomVendor,
  type PublicByomConfig,
  type ReasoningLevel,
} from "@/lib/llm/keys/types";
import { bestModelForOp, cellComposite, matrixSlug } from "@/lib/llm/quality";
import { QUALITY_SCORES, hasQualityScores } from "@/lib/llm/quality-scores";

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
    errGeneric: "Something went wrong.",
    errNetwork: "Could not reach the server.",
  },
} as const;

const selectClass =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-navy-800 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50";

type State = { entitled: boolean; config: PublicByomConfig };

export default function ByomMatrix() {
  const t = useT(T);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/byom");
        if (!res.ok || !alive) return;
        const json = (await res.json()) as { entitled?: boolean; config?: PublicByomConfig };
        if (!alive || !json.config) return;
        setState({ entitled: Boolean(json.entitled), config: json.config });
      } catch {
        /* settings chrome — stay silent on failure */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function apply(url: string, opts: RequestInit, action: string): Promise<void> {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(url, opts);
      const json = (await res.json().catch(() => ({}))) as { error?: string; config?: PublicByomConfig };
      if (!res.ok) {
        setError(json.error ?? t("errGeneric"));
        return;
      }
      if (json.config) setState((s) => (s ? { ...s, config: json.config! } : s));
    } catch {
      setError(t("errNetwork"));
    } finally {
      setBusy(null);
    }
  }

  const setOp = (toolId: string, vendor: ByomVendor, model: string, reasoning: ReasoningLevel) =>
    apply(
      "/api/byom/matrix",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolId, vendor, model, reasoning }),
      },
      toolId
    );

  const clearOp = (toolId: string) =>
    apply(`/api/byom/matrix?toolId=${toolId}`, { method: "DELETE" }, toolId);

  if (!state || !state.entitled) return null; // ByomKeys renders the upsell for the whole area

  const configured = state.config.keys.map((k) => k.vendor);

  return (
    <section className="mt-8 max-w-3xl">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-navy-800">{t("title")}</h3>
        <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
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
            const reasoningDisabled = !vendor || Boolean(modelOpt?.noReasoning) || busy !== null;
            const rec = hasQualityScores() ? bestModelForOp(QUALITY_SCORES, op.id) : null;

            return (
              <div
                key={op.id}
                className="grid grid-cols-1 gap-2 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[1.4fr_1fr_1.2fr_1fr] sm:items-center sm:gap-3"
              >
                <span className="text-sm font-medium text-navy-800">
                  {op.label}
                  {rec && (
                    <span
                      className="ml-2 whitespace-nowrap text-xs font-normal text-brand-accent"
                      title={`Nejlepší naměřený model: ${rec.model}`}
                    >
                      ★ {rec.model.split("/").pop()} {rec.composite.toFixed(1)}
                    </span>
                  )}
                </span>

                {/* provider */}
                <select
                  aria-label={`${op.label} — ${t("colProvider")}`}
                  className={selectClass}
                  value={vendor ?? ""}
                  disabled={busy !== null}
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
                  aria-label={`${op.label} — ${t("colModel")}`}
                  className={selectClass}
                  value={ov?.model ?? ""}
                  disabled={!vendor || busy !== null}
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
                  aria-label={`${op.label} — ${t("colReasoning")}`}
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
