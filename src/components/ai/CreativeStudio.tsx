"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Bolt, Check, Close, Download, Gauge, Image as ImageIcon } from "@/components/icons";
import { downloadDataUrl } from "@/lib/export";
import { fmtRelative } from "@/lib/format";
import {
  IMAGE_FORMATS,
  IMAGE_FORMAT_PRESETS,
  IMAGE_STYLES,
  IMAGE_STYLE_LABELS,
  MAX_IMAGE_CANDIDATES,
  type CreativeSummary,
  type GeneratedImage,
  type ImageFormat,
  type ImageGenResult,
  type ImageStyle,
} from "@/lib/images/types";
import { Field, ToolEmpty, ToolError, inputClass } from "./primitives";

type Status = "idle" | "loading" | "done" | "error";

const COUNTS = [1, 2, 3, 4].filter((n) => n <= MAX_IMAGE_CANDIDATES);

function scoreTone(score: number | null): string {
  if (score === null) return "bg-navy-50 text-muted";
  if (score >= 8) return "bg-positive-soft text-positive";
  if (score >= 5) return "bg-coral-soft text-coral-600";
  return "bg-negative-soft text-negative";
}

function extOf(mime: string): string {
  return mime.includes("svg") ? "svg" : mime.includes("jpeg") ? "jpg" : "png";
}

type NobgEntry =
  | { status: "loading" }
  | { status: "done"; dataUrl: string }
  | { status: "error"; error: string };

/** Light checkerboard so a transparent (background-removed) PNG reads as cut-out. */
const CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#e4eaef 25%,transparent 25%),linear-gradient(-45deg,#e4eaef 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4eaef 75%),linear-gradient(-45deg,transparent 75%,#e4eaef 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
};

export default function CreativeStudio() {
  const { status: authStatus } = useSession();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyle>("dynamic");
  const [format, setFormat] = useState<ImageFormat>("square");
  const [count, setCount] = useState(2);
  // Reference image (image-to-image guidance via Leonardo imagePrompts).
  const [referenceImageId, setReferenceImageId] = useState<string | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [refStatus, setRefStatus] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [refError, setRefError] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ImageGenResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [library, setLibrary] = useState<CreativeSummary[]>([]);
  const [delBusy, setDelBusy] = useState<string | null>(null);
  // Background-removal results, keyed by Leonardo image id.
  const [nobg, setNobg] = useState<Record<string, NobgEntry>>({});

  const removeBg = async (img: GeneratedImage) => {
    const id = img.leonardoImageId;
    if (!id) return;
    setNobg((m) => ({ ...m, [id]: { status: "loading" } }));
    try {
      const res = await fetch("/api/images/nobg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNobg((m) => ({ ...m, [id]: { status: "error", error: json?.error ?? "Nepodařilo se." } }));
        return;
      }
      setNobg((m) => ({ ...m, [id]: { status: "done", dataUrl: json.dataUrl } }));
    } catch {
      setNobg((m) => ({ ...m, [id]: { status: "error", error: "Chyba spojení." } }));
    }
  };

  // "More like this": re-upload the chosen candidate as a reference image and
  // regenerate guided by it (reuses the upload-ref + imagePrompts flow).
  const makeVariations = async (img: GeneratedImage) => {
    if (!result) return;
    setStatus("loading");
    setError(null);
    try {
      const blob = await (await fetch(img.dataUrl)).blob();
      const fd = new FormData();
      fd.append("file", new File([blob], "variant.png", { type: blob.type || "image/png" }));
      const up = await fetch("/api/images/upload-ref", { method: "POST", body: fd });
      const upJson = await up.json();
      if (!up.ok) {
        setError(upJson?.error ?? "Příprava reference selhala.");
        setStatus("error");
        return;
      }
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: result.prompt,
          style: result.style,
          format: result.format,
          count,
          referenceImageId: upJson.referenceImageId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Generování variant selhalo.");
        setStatus("error");
        return;
      }
      setResult(json as ImageGenResult);
      setStatus("done");
      if (authStatus === "authenticated") void loadLibrary();
    } catch {
      setError("Nepodařilo se spojit se serverem.");
      setStatus("error");
    }
  };

  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/images");
      if (!res.ok) return;
      const json = (await res.json()) as { creatives?: CreativeSummary[] };
      setLibrary(json.creatives ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") void loadLibrary();
  }, [authStatus, loadLibrary]);

  const canSubmit = prompt.trim().length >= 2 && status !== "loading" && refStatus !== "uploading";

  const onRefSelect = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRefPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    setRefStatus("uploading");
    setRefError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/images/upload-ref", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setRefStatus("error");
        setRefError(json?.error ?? "Nahrání selhalo.");
        setReferenceImageId(null);
        return;
      }
      setReferenceImageId(json.referenceImageId);
      setRefStatus("ready");
    } catch {
      setRefStatus("error");
      setRefError("Chyba spojení.");
      setReferenceImageId(null);
    }
  };

  const clearRef = () => {
    setReferenceImageId(null);
    setRefPreview(null);
    setRefStatus("idle");
    setRefError(null);
  };

  const generate = async (avoid?: string) => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style,
          format,
          count,
          avoid,
          referenceImageId: refStatus === "ready" ? referenceImageId : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Generování se nezdařilo.");
        setStatus("error");
        return;
      }
      setResult(json as ImageGenResult);
      setStatus("done");
      if (authStatus === "authenticated") void loadLibrary();
    } catch {
      setError("Nepodařilo se spojit se serverem.");
      setStatus("error");
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSubmit) void generate();
  };

  const winner = result?.images.find((i) => i.winner);
  const canIterate = result?.source === "leonardo" && Boolean(winner?.defects) && status !== "loading";

  const remove = async (id: string) => {
    setDelBusy(id);
    try {
      const res = await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setLibrary((l) => l.filter((c) => c.id !== id));
    } finally {
      setDelBusy(null);
    }
  };

  const preset = IMAGE_FORMAT_PRESETS[format];

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        <form onSubmit={onSubmit} className="card space-y-5 p-6 lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-navy-800">Zadání vizuálu</h2>
            <button
              type="button"
              onClick={() => setPrompt("Ploché aranžmá ořechů a semínek na světlém dřevěném pozadí, prémiový e-shop, měkké přirozené světlo")}
              className="text-xs font-semibold text-brand-accent hover:text-brand-800"
            >
              Vyplnit ukázku
            </button>
          </div>

          <Field label="Popis (prompt)" htmlFor="cs-prompt">
            <textarea
              id="cs-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Popište scénu, styl, barvy, náladu…"
              className={`${inputClass} resize-y`}
            />
          </Field>

          <Field label="Styl">
            <div className="grid grid-cols-3 gap-2">
              {IMAGE_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStyle(s)}
                  className={`rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors ${
                    style === s ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-navy-200"
                  }`}
                >
                  {IMAGE_STYLE_LABELS[s]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Formát">
            <div className="grid grid-cols-2 gap-2">
              {IMAGE_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors ${
                    format === f ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-navy-200"
                  }`}
                >
                  {IMAGE_FORMAT_PRESETS[f].label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Počet kandidátů">
            <div className="flex gap-2">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`tnum h-9 w-9 rounded-lg border text-sm font-medium transition-colors ${
                    count === n ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-navy-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Referenční obrázek (volitelné)">
            {refPreview ? (
              <div className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={refPreview} alt="Referenční obrázek" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                <span className="min-w-0 flex-1 text-xs">
                  {refStatus === "uploading" && <span className="text-muted">Nahrávám…</span>}
                  {refStatus === "ready" && <span className="text-positive">Připraveno — ovlivní styl</span>}
                  {refStatus === "error" && <span className="text-negative">{refError}</span>}
                </span>
                <button
                  type="button"
                  onClick={clearRef}
                  className="shrink-0 text-xs font-medium text-muted hover:text-coral-600"
                >
                  Odebrat
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-xs text-muted transition-colors hover:border-brand-300 hover:text-brand-accent">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onRefSelect(e.target.files?.[0] ?? null)}
                />
                Nahrát obrázek pro vedení stylu
              </label>
            )}
          </Field>

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            {status === "loading" ? (
              <>
                <Gauge width={17} height={17} className="animate-pulse" />
                Generuji…
              </>
            ) : (
              <>
                <ImageIcon width={17} height={17} />
                Vygenerovat vizuál
              </>
            )}
          </button>

          <p className="text-xs leading-relaxed text-muted">
            Leonardo vygeneruje {count} {count === 1 ? "návrh" : "návrhy"}, Gemini je ohodnotí a vybere
            nejlepší. Bez klíče běží ukázkový režim. Vygenerované obrázky se ukládají do knihovny.
          </p>
        </form>

        <div className="min-w-0">
          {status === "idle" && (
            <ToolEmpty
              icon={ImageIcon}
              title="Vizuály se zobrazí tady"
              body="Popište, co potřebujete. Studio vygeneruje několik variant, ohodnotí je AI viděním a nejlepší označí — pak ji můžete stáhnout nebo vylepšit."
              hint="Tip: zkuste „Vyplnit ukázku“ a klikněte na Vygenerovat vizuál."
            />
          )}
          {status === "loading" && (
            <div className="card flex animate-fade-in flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted">
              <Gauge width={22} height={22} className="animate-pulse text-brand-600" />
              Generuji a hodnotím kandidáty… (může trvat i půl minuty)
            </div>
          )}
          {status === "error" && <ToolError message={error ?? ""} onRetry={() => setStatus("idle")} />}

          {status === "done" && result && (
            <div className="animate-fade-up space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`pill ${result.source === "leonardo" ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-600"}`}
                >
                  {result.source === "leonardo" ? "Leonardo · Gemini hodnocení" : "Ukázkový režim (bez LEONARDO_API_KEY)"}
                </span>
                {canIterate && (
                  <button
                    type="button"
                    onClick={() => void generate(winner?.defects)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                  >
                    <Bolt width={13} height={13} />
                    Vylepšit podle defektů
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {result.images.map((img, i) => (
                  <Candidate
                    key={i}
                    img={img}
                    index={i}
                    aspect={preset.aspect}
                    nobgState={img.leonardoImageId ? nobg[img.leonardoImageId] : undefined}
                    onRemoveBg={removeBg}
                    onVariations={makeVariations}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* persisted asset library */}
      {authStatus === "authenticated" && library.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-navy-800">Knihovna vizuálů</h2>
            <span className="text-xs text-muted">{library.length} uloženo</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {library.map((c) => (
              <div key={c.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/images/file/${c.id}`}
                  alt={c.prompt}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                <div className="p-3">
                  <p className="line-clamp-2 text-xs text-navy-700">{c.prompt}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted">
                      {c.score !== null && <span className={`pill ${scoreTone(c.score)} mr-1`}>{c.score}/10</span>}
                      {c.createdAt && <time dateTime={c.createdAt}>{fmtRelative(c.createdAt)}</time>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <a
                        href={`/api/images/file/${c.id}`}
                        download
                        aria-label="Stáhnout"
                        className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-brand-accent"
                      >
                        <Download width={14} height={14} />
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={delBusy === c.id}
                        aria-label="Smazat"
                        className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-coral-600 disabled:opacity-50"
                      >
                        <Close width={14} height={14} />
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Candidate({
  img,
  index,
  aspect,
  nobgState,
  onRemoveBg,
  onVariations,
}: {
  img: GeneratedImage;
  index: number;
  aspect: string;
  nobgState?: NobgEntry;
  onRemoveBg: (img: GeneratedImage) => void;
  onVariations: (img: GeneratedImage) => void;
}) {
  const cutout = nobgState?.status === "done" ? nobgState.dataUrl : null;
  const display = cutout ?? img.dataUrl;
  const download = () =>
    downloadDataUrl(
      `systedo-vizual-${index + 1}${cutout ? "-bez-pozadi" : ""}.${cutout ? "png" : extOf(img.mime)}`,
      display
    );
  return (
    <div className={`card overflow-hidden ${img.winner ? "ring-2 ring-brand-400" : ""}`}>
      <div className="relative" style={cutout ? CHECKER : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={display}
          alt={`Kandidát ${index + 1}`}
          className={`w-full ${cutout ? "object-contain" : "object-cover"} ${aspect}`}
        />
        {img.winner && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-pill bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Check width={11} height={11} />
            Nejlepší
          </span>
        )}
        {img.score !== null && (
          <span className={`pill absolute right-2 top-2 ${scoreTone(img.score)}`}>{img.score}/10</span>
        )}
        {cutout && (
          <span className="pill absolute bottom-2 left-2 bg-positive-soft text-positive">Bez pozadí</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-2.5">
        <span className="truncate text-[11px] text-muted" title={img.defects}>
          {img.defects && img.defects !== "none" ? img.defects : "bez závad"}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {img.leonardoImageId && (
            <button
              type="button"
              onClick={() => onVariations(img)}
              title="Vytvořit varianty podle tohoto návrhu"
              className="rounded-pill border border-line px-2.5 py-1 text-[11px] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
            >
              Varianty
            </button>
          )}
          {img.leonardoImageId && !cutout && (
            <button
              type="button"
              onClick={() => onRemoveBg(img)}
              disabled={nobgState?.status === "loading"}
              className="rounded-pill border border-line px-2.5 py-1 text-[11px] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
            >
              {nobgState?.status === "loading" ? "Odebírám…" : "Bez pozadí"}
            </button>
          )}
          <button
            type="button"
            onClick={download}
            aria-label="Stáhnout"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-brand-accent"
          >
            <Download width={14} height={14} />
          </button>
        </span>
      </div>
      {nobgState?.status === "error" && (
        <p className="px-2.5 pb-2 text-[11px] text-negative">{nobgState.error}</p>
      )}
    </div>
  );
}
