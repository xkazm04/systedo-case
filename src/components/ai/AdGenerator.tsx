"use client";

import { useState } from "react";
import { Bolt, Sparkles } from "@/components/icons";
import {
  AD_LIMITS,
  PLATFORM_LABELS,
  TONE_LABELS,
  TONES,
  type AdRequest,
  type AdResult,
  type Platform,
  type Tone,
} from "@/lib/ai-types";
import { useAiTool } from "./useAiTool";
import {
  Field,
  Group,
  LoadingTimer,
  PromptDisclosure,
  ResultMeta,
  TextRow,
  TimeoutState,
  ToolEmpty,
  ToolError,
  inputClass,
} from "./primitives";

const EXAMPLE: AdRequest = {
  product: "Kešu ořechy natural, 500 g",
  benefits:
    "100% natural bez soli a oleje, čerstvé z pravidelného obratu zásob, výhodné rodinné balení, BIO varianta skladem",
  audience: "Lidé se zájmem o zdravý životní styl a kvalitní svačiny, domácí pekaři",
  platform: "google",
  tone: "pratelsky",
};

const EMPTY: AdRequest = { product: "", benefits: "", audience: "", platform: "google", tone: "vecny" };

export default function AdGenerator() {
  const [form, setForm] = useState<AdRequest>(EMPTY);
  const { status, data, error, timedOut, run, reset } = useAiTool<AdResult>("ads");

  const set = <K extends keyof AdRequest>(key: K, value: AdRequest[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.product.trim().length >= 2 &&
    form.benefits.trim().length >= 2 &&
    form.audience.trim().length >= 2 &&
    status !== "loading";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) run({ ...form });
  }

  const r = data?.result;
  const copyAllText = r
    ? [
        "NADPISY:",
        ...r.headlines.map((h) => `- ${h}`),
        "\nPOPISKY:",
        ...r.descriptions.map((d) => `- ${d}`),
        "\nODZNAKY:",
        ...r.callouts.map((c) => `- ${c}`),
        `\nDLOUHÝ NADPIS:\n- ${r.longHeadline}`,
        `\nKLÍČOVÁ SLOVA:\n${r.keywords.join(", ")}`,
      ].join("\n")
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <form onSubmit={onSubmit} className="card space-y-5 p-6 lg:sticky lg:top-24">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-800">Zadání kampaně</h2>
          <button
            type="button"
            onClick={() => setForm(EXAMPLE)}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800"
          >
            Vyplnit ukázku
          </button>
        </div>

        <Field label="Produkt nebo služba" htmlFor="product">
          <input
            id="product"
            type="text"
            value={form.product}
            onChange={(e) => set("product", e.target.value)}
            placeholder="Kešu ořechy natural, 500 g"
            className={inputClass}
          />
        </Field>

        <Field label="Hlavní výhody / USP" htmlFor="benefits">
          <textarea
            id="benefits"
            rows={3}
            value={form.benefits}
            onChange={(e) => set("benefits", e.target.value)}
            placeholder="100% natural, bez soli a oleje, skladem, doprava zdarma…"
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field label="Cílová skupina" htmlFor="audience">
          <input
            id="audience"
            type="text"
            value={form.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="Lidé se zájmem o zdravý životní styl"
            className={inputClass}
          />
        </Field>

        <Field label="Platforma">
          <div className="inline-flex w-full rounded-lg bg-navy-50 p-1">
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set("platform", p)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  form.platform === p ? "bg-surface text-navy-800 shadow-card" : "text-muted"
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Tón komunikace">
          <div className="grid grid-cols-2 gap-2">
            {TONES.map((t: Tone) => (
              <button
                key={t}
                type="button"
                onClick={() => set("tone", t)}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                  form.tone === t
                    ? "border-brand-400 bg-brand-50 text-brand-800"
                    : "border-line text-muted hover:border-navy-200"
                }`}
              >
                {TONE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {status === "loading" ? (
            <>
              <Sparkles width={17} height={17} className="animate-pulse" />
              Generuji…
            </>
          ) : (
            <>
              <Bolt width={17} height={17} />
              Vygenerovat inzeráty
            </>
          )}
        </button>
      </form>

      <div className="min-w-0">
        {status === "idle" && (
          <ToolEmpty
            icon={Sparkles}
            title="Návrh inzerátů se zobrazí tady"
            body="Vyplňte zadání kampaně vlevo a nechte Gemini vygenerovat nadpisy, popisky a klíčová slova — rovnou s kontrolou limitů znaků pro Google Ads i Sklik."
            hint="Tip: zkuste „Vyplnit ukázku“ a klikněte na Vygenerovat."
          />
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
            <ResultMeta meta={data.meta} copyAllText={copyAllText} />

            <Group title="Nadpisy" hint={`max ${AD_LIMITS.headline} znaků`}>
              <ul className="space-y-2">
                {r.headlines.map((h, i) => (
                  <TextRow key={i} text={h} limit={AD_LIMITS.headline} />
                ))}
              </ul>
            </Group>

            <Group title="Popisky" hint={`max ${AD_LIMITS.description} znaků`}>
              <ul className="space-y-2">
                {r.descriptions.map((d, i) => (
                  <TextRow key={i} text={d} limit={AD_LIMITS.description} />
                ))}
              </ul>
            </Group>

            <div className="grid gap-5 sm:grid-cols-2">
              <Group title="Odznaky" hint={`max ${AD_LIMITS.callout} znaků`}>
                <ul className="space-y-2">
                  {r.callouts.map((c, i) => (
                    <TextRow key={i} text={c} limit={AD_LIMITS.callout} />
                  ))}
                </ul>
              </Group>

              <Group title="Dlouhý nadpis" hint={`max ${AD_LIMITS.longHeadline} znaků`}>
                <ul>
                  <TextRow text={r.longHeadline} limit={AD_LIMITS.longHeadline} />
                </ul>
              </Group>
            </div>

            <Group title="Klíčová slova" hint={`${r.keywords.length} návrhů`}>
              <div className="flex flex-wrap gap-2">
                {r.keywords.map((k, i) => (
                  <span key={i} className="rounded-pill bg-navy-50 px-3 py-1.5 text-sm text-navy-700">
                    {k}
                  </span>
                ))}
              </div>
            </Group>

            {r.rationale && (
              <div className="rounded-card border border-brand-200 bg-brand-50 p-5">
                <p className="text-sm font-semibold text-brand-800">Proč právě takhle</p>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{r.rationale}</p>
              </div>
            )}

            <PromptDisclosure prompt={data.meta.prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
