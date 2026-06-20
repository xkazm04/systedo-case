"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useOptionalProject } from "@/lib/projects/context";
import { Bolt, Check, Close, Download, Gauge, Layers, Sparkles } from "@/components/icons";
import { downloadText, toCsv } from "@/lib/export";
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
import {
  AD_STRENGTH_LABELS,
  AD_STRENGTH_ORDER,
  computeAdStrength,
  type AdStrength,
  type AdStrengthFactor,
  type AdStrengthRating,
} from "@/lib/ad-strength";
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

/** Per-rating accents for the strength meter — red → orange → blue → green. */
const RATING_STYLE: Record<AdStrengthRating, { bar: string; chip: string }> = {
  poor: { bar: "bg-negative", chip: "bg-negative-soft text-negative" },
  average: { bar: "bg-coral-500", chip: "bg-coral-soft text-coral-600" },
  good: { bar: "bg-brand-500", chip: "bg-brand-50 text-brand-accent" },
  excellent: { bar: "bg-positive", chip: "bg-positive-soft text-positive" },
};

/** Tiny status glyph for a strength factor: met / partial / not met. */
function FactorIcon({ status }: { status: AdStrengthFactor["status"] }) {
  if (status === "pass") return <Check width={15} height={15} className="text-positive" />;
  if (status === "fail") return <Close width={14} height={14} className="text-negative" />;
  return <span className="block h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden />;
}

/** Google-Ads-style "Ad Strength" rating with a segmented meter and the factor
 *  checklist that tells the user what would push the set toward Excellent. */
function AdStrengthMeter({ strength }: { strength: AdStrength }) {
  const filled = AD_STRENGTH_ORDER.indexOf(strength.rating) + 1;
  const style = RATING_STYLE[strength.rating];
  const ratingLabel = AD_STRENGTH_LABELS[strength.rating];
  return (
    <div data-testid="ad-strength" className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge width={18} height={18} className="text-brand-600" />
          <h3 className="text-sm font-semibold text-navy-800">Síla inzerátu</h3>
        </div>
        <span className={`pill ${style.chip}`}>{ratingLabel}</span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="flex flex-1 gap-1.5"
          role="img"
          aria-label={`Síla inzerátu: ${ratingLabel}, ${strength.score} ze 100`}
        >
          {AD_STRENGTH_ORDER.map((rating, i) => (
            <span
              key={rating}
              className={`h-2 flex-1 rounded-full transition-colors ${i < filled ? style.bar : "bg-navy-100"}`}
            />
          ))}
        </div>
        <span className="tnum shrink-0 text-xs font-medium text-muted">{strength.score}/100</span>
      </div>

      <ul className="mt-4 space-y-2">
        {strength.factors.map((f, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
              <FactorIcon status={f.status} />
            </span>
            <span className="min-w-0 text-sm leading-snug">
              <span className="font-medium text-navy-800">{f.label}</span>
              <span className="text-muted"> — {f.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** URL-path seed for the preview: lowercase, de-accented, dash-joined. */
const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/g, "");

/** Live preview that assembles a sample responsive search ad the way Google
 *  shows it: up to 3 headlines joined with " | " and up to 2 descriptions. */
function RsaPreview({
  headlines,
  descriptions,
  pathSeed,
  platform,
}: {
  headlines: string[];
  descriptions: string[];
  pathSeed: string;
  platform: Platform;
}) {
  const title = headlines.filter((h) => h.trim()).slice(0, 3).join(" | ");
  const desc = descriptions.filter((d) => d.trim()).slice(0, 2).join(" ");
  const path = slugify(pathSeed);
  const isGoogle = platform === "google";
  return (
    <div data-testid="rsa-preview" className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{isGoogle ? "Náhled inzerátu (RSA)" : "Náhled inzerátu"}</p>
        <span className="pill bg-navy-50 text-muted">Ukázková kombinace</span>
      </div>
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-onyx text-[13px] font-semibold text-white"
            aria-hidden
          >
            M
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-semibold text-navy-800">Sponzorováno · Mionelo</p>
            <p className="truncate text-xs text-serp-url">
              www.mionelo.cz{path ? ` › ${path}` : ""}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xl leading-snug text-serp-link">{title || "Nadpis inzerátu"}</p>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-navy-600">
          {desc || "Popisek inzerátu se zobrazí tady."}
        </p>
      </div>
    </div>
  );
}

const EXAMPLE: AdRequest = {
  product: "Kešu ořechy natural, 500 g",
  benefits:
    "100% natural bez soli a oleje, čerstvé z pravidelného obratu zásob, výhodné rodinné balení, BIO varianta skladem",
  audience: "Lidé se zájmem o zdravý životní styl a kvalitní svačiny, domácí pekaři",
  platform: "google",
  tone: "pratelsky",
};

const EMPTY: AdRequest = { product: "", benefits: "", audience: "", platform: "google", tone: "vecny" };

export default function AdGenerator({ onVariantSaved }: { onVariantSaved?: () => void } = {}) {
  const { status: authStatus } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [form, setForm] = useState<AdRequest>(EMPTY);
  const { status, data, error, timedOut, run, reset } = useAiTool<AdResult>("ads");
  const [abName, setAbName] = useState("");
  const [abState, setAbState] = useState<"idle" | "saving" | "saved">("idle");
  const [abOpen, setAbOpen] = useState(false);

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
  const strength = useMemo(() => (r ? computeAdStrength(r) : null), [r]);

  // Save the current ad as a variant of an A/B test (same name → same test).
  const saveVariant = async () => {
    if (!r || !strength || abState === "saving") return;
    const name = abName.trim() || form.product.trim() || "A/B test";
    setAbState("saving");
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ad: r, strength: strength.score, projectId: pid }),
      });
      if (!res.ok) {
        setAbState("idle");
        return;
      }
      setAbState("saved");
      setAbOpen(false);
      onVariantSaved?.();
    } catch {
      setAbState("idle");
    }
  };

  // Export every generated asset (with its character count) as a CSV the user can
  // paste straight into Google Ads / Sklik or a sheet — beyond copy-to-clipboard.
  const exportAdsCsv = () => {
    if (!r) return;
    const rows: (string | number)[][] = [];
    r.headlines.forEach((h) => rows.push(["Nadpis", h, h.length]));
    r.descriptions.forEach((d) => rows.push(["Popisek", d, d.length]));
    r.callouts.forEach((c) => rows.push(["Odznak", c, c.length]));
    if (r.longHeadline) rows.push(["Dlouhý nadpis", r.longHeadline, r.longHeadline.length]);
    r.keywords.forEach((k) => rows.push(["Klíčové slovo", k, k.length]));
    downloadText(
      `systedo-inzeraty-${slugify(form.product) || "kampan"}.csv`,
      toCsv(["Typ", "Text", "Počet znaků"], rows)
    );
  };
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
            className="text-xs font-semibold text-brand-accent hover:text-brand-800"
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

            <div className="flex flex-wrap items-center justify-end gap-2">
              {authStatus === "authenticated" && (
                <>
                  {abOpen ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={abName}
                        onChange={(e) => setAbName(e.target.value)}
                        placeholder={form.product || "Název A/B testu"}
                        aria-label="Název A/B testu"
                        className="w-44 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs text-navy-800"
                      />
                      <button
                        type="button"
                        onClick={saveVariant}
                        disabled={abState === "saving"}
                        className="inline-flex items-center gap-1 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                      >
                        {abState === "saving" ? "Ukládám…" : "Uložit variantu"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAbOpen(true)}
                      title="Uložit jako variantu A/B testu pro porovnání"
                      className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                    >
                      {abState === "saved" ? (
                        <>
                          <Check width={14} height={14} /> Přidáno do A/B testu
                        </>
                      ) : (
                        <>
                          <Layers width={14} height={14} /> Přidat do A/B testu
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={exportAdsCsv}
                title="Stáhnout všechny texty jako CSV"
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                <Download width={14} height={14} />
                Stáhnout CSV
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
              <RsaPreview
                headlines={r.headlines}
                descriptions={r.descriptions}
                pathSeed={r.keywords[0] ?? form.product}
                platform={form.platform}
              />
              {strength && <AdStrengthMeter strength={strength} />}
            </div>

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
