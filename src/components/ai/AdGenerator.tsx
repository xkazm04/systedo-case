"use client";

import { useState } from "react";
import { Bolt, Check, Copy, Info, Sparkles } from "@/components/icons";
import {
  AD_LIMITS,
  PLATFORM_LABELS,
  TONE_LABELS,
  TONES,
  type AdRequest,
  type AdResponse,
  type Platform,
  type Tone,
} from "@/lib/ai-types";

const EXAMPLE: AdRequest = {
  product: "Kešu ořechy natural, 500 g",
  benefits:
    "100% natural bez soli a oleje, čerstvé z pravidelného obratu zásob, výhodné rodinné balení, BIO varianta skladem",
  audience: "Lidé se zájmem o zdravý životní styl a kvalitní svačiny, domácí pekaři",
  platform: "google",
  tone: "pratelsky",
};

const EMPTY: AdRequest = { product: "", benefits: "", audience: "", platform: "google", tone: "vecny" };

type Status = "idle" | "loading" | "done" | "error";

function CopyButton({ text, label = "Kopírovat" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1300);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-navy-50 hover:text-navy-700"
      aria-label={label}
    >
      {copied ? <Check width={14} height={14} className="text-positive" /> : <Copy width={14} height={14} />}
      {copied ? "Zkopírováno" : label}
    </button>
  );
}

function CharCount({ value, limit }: { value: number; limit: number }) {
  const over = value > limit;
  return (
    <span
      className={`tnum shrink-0 text-xs font-medium ${over ? "text-negative" : "text-muted"}`}
      title={over ? "Přes limit znaků" : "V limitu"}
    >
      {value}/{limit}
    </span>
  );
}

function TextRow({ text, limit }: { text: string; limit: number }) {
  const over = text.length > limit;
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
        over ? "border-negative/40 bg-[#fcf1ef]" : "border-line bg-surface"
      }`}
    >
      <span className="min-w-0 flex-1 text-sm text-navy-800">{text}</span>
      <CharCount value={text.length} limit={limit} />
      <CopyButton text={text} label="" />
    </li>
  );
}

export default function AdGenerator() {
  const [form, setForm] = useState<AdRequest>(EMPTY);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<AdResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const set = <K extends keyof AdRequest>(key: K, value: AdRequest[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.product.trim().length >= 2 &&
    form.benefits.trim().length >= 2 &&
    form.audience.trim().length >= 2 &&
    status !== "loading";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Něco se pokazilo.");
        setStatus("error");
        return;
      }
      setData(json as AdResponse);
      setStatus("done");
    } catch {
      setError("Nepodařilo se spojit se serverem.");
      setStatus("error");
    }
  }

  const copyAllText = data
    ? [
        "NADPISY:",
        ...data.result.headlines.map((h) => `- ${h}`),
        "",
        "POPISKY:",
        ...data.result.descriptions.map((d) => `- ${d}`),
        "",
        "ODZNAKY:",
        ...data.result.callouts.map((c) => `- ${c}`),
        "",
        `DLOUHÝ NADPIS:\n- ${data.result.longHeadline}`,
        "",
        `KLÍČOVÁ SLOVA:\n${data.result.keywords.join(", ")}`,
      ].join("\n")
    : "";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      {/* ---------------------------------------------------------- form */}
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
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
        </Field>

        <Field label="Hlavní výhody / USP" htmlFor="benefits">
          <textarea
            id="benefits"
            rows={3}
            value={form.benefits}
            onChange={(e) => set("benefits", e.target.value)}
            placeholder="100% natural, bez soli a oleje, skladem, doprava zdarma…"
            className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
        </Field>

        <Field label="Cílová skupina" htmlFor="audience">
          <input
            id="audience"
            type="text"
            value={form.audience}
            onChange={(e) => set("audience", e.target.value)}
            placeholder="Lidé se zájmem o zdravý životní styl"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* ------------------------------------------------------- results */}
      <div className="min-w-0">
        {status === "idle" && <EmptyState />}
        {status === "loading" && <LoadingState />}
        {status === "error" && (
          <div className="card border-negative/30 p-6">
            <p className="text-sm font-semibold text-negative">Generování selhalo</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-4 rounded-pill border border-line px-4 py-2 text-sm font-medium text-navy-700 hover:border-brand-300"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {status === "done" && data && (
          <div className="space-y-5">
            {/* results header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill bg-navy-50 text-navy-700">{data.meta.model}</span>
                {data.meta.demo ? (
                  <span className="pill bg-[#fff0e9] text-coral-600">
                    <Info width={13} height={13} />
                    Ukázkový režim (bez API klíče)
                  </span>
                ) : (
                  <span className="pill bg-[#e7f4ef] text-positive">
                    <Check width={13} height={13} />
                    Vygenerováno modelem · {(data.meta.tookMs / 1000).toFixed(1)} s
                  </span>
                )}
              </div>
              <CopyButton text={copyAllText} label="Kopírovat vše" />
            </div>

            <Group title="Nadpisy" hint={`max ${AD_LIMITS.headline} znaků`}>
              <ul className="space-y-2">
                {data.result.headlines.map((h, i) => (
                  <TextRow key={i} text={h} limit={AD_LIMITS.headline} />
                ))}
              </ul>
            </Group>

            <Group title="Popisky" hint={`max ${AD_LIMITS.description} znaků`}>
              <ul className="space-y-2">
                {data.result.descriptions.map((d, i) => (
                  <TextRow key={i} text={d} limit={AD_LIMITS.description} />
                ))}
              </ul>
            </Group>

            <div className="grid gap-5 sm:grid-cols-2">
              <Group title="Odznaky" hint={`max ${AD_LIMITS.callout} znaků`}>
                <ul className="space-y-2">
                  {data.result.callouts.map((c, i) => (
                    <TextRow key={i} text={c} limit={AD_LIMITS.callout} />
                  ))}
                </ul>
              </Group>

              <Group title="Dlouhý nadpis" hint={`max ${AD_LIMITS.longHeadline} znaků`}>
                <ul>
                  <TextRow text={data.result.longHeadline} limit={AD_LIMITS.longHeadline} />
                </ul>
              </Group>
            </div>

            <Group title="Klíčová slova" hint={`${data.result.keywords.length} návrhů`}>
              <div className="flex flex-wrap gap-2">
                {data.result.keywords.map((k, i) => (
                  <span key={i} className="rounded-pill bg-navy-50 px-3 py-1.5 text-sm text-navy-700">
                    {k}
                  </span>
                ))}
              </div>
            </Group>

            {data.result.rationale && (
              <div className="rounded-card border border-brand-200 bg-brand-50 p-5">
                <p className="text-sm font-semibold text-brand-800">Proč právě takhle</p>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{data.result.rationale}</p>
              </div>
            )}

            {/* transparency: the exact prompt */}
            <div className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPrompt((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-navy-800"
              >
                <span className="flex items-center gap-2">
                  <Info width={16} height={16} className="text-brand-600" />
                  Zobrazit prompt poslaný modelu
                </span>
                <span className="text-muted">{showPrompt ? "skrýt" : "zobrazit"}</span>
              </button>
              {showPrompt && (
                <pre className="overflow-x-auto border-t border-line bg-navy-800 px-5 py-4 font-mono text-xs leading-relaxed text-navy-100">
                  {data.meta.prompt}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- small presentational helpers -------------------------------------------

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-navy-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-navy-800">{title}</h3>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center p-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Sparkles width={28} height={28} />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-navy-800">Návrh inzerátů se zobrazí tady</h2>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Vyplňte zadání kampaně vlevo a nechte Gemini vygenerovat nadpisy, popisky a klíčová slova
        — rovnou s kontrolou limitů znaků pro Google Ads i Sklik.
      </p>
      <p className="mt-4 text-xs text-muted">Tip: zkuste „Vyplnit ukázku“ a klikněte na Vygenerovat.</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-48 animate-pulse rounded-full bg-navy-100" />
      {[0, 1].map((g) => (
        <div key={g} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-navy-100" />
          {[0, 1, 2].map((r) => (
            <div key={r} className="h-11 animate-pulse rounded-lg bg-navy-50" />
          ))}
        </div>
      ))}
    </div>
  );
}
