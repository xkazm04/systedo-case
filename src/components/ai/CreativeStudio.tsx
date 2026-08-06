"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useOptionalProject } from "@/lib/projects/context";
import { Bolt, Check, Close, Download, Gauge, Image as ImageIcon } from "@/components/icons";
import { downloadDataUrl } from "@/lib/export";
import { useFormatters, useT } from "@/lib/i18n/client";
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
import { AI_TIMEOUT_MS, AI_TIMEOUT_SECONDS } from "./useAiTool";

/** localStorage slots for the latest image generation and the brand kit, so a
 *  refresh / tab-switch doesn't discard candidates the user already paid image
 *  quota for (every text tool persists via useAiTool history; images hand-rolled
 *  their own lifecycle and persisted nothing). Distinct from useAiTool's
 *  `systedo.ai.result.<mode>` keys.
 *
 *  Both are keyed PER PROJECT, matching AdGenerator's `ads.${pid}` drafts. They
 *  used to be global, which made the brand kit — palette, tonality, the text fed
 *  into both generation and the vision scoring — follow the user from one
 *  workspace into the next, quietly spending image quota rendering project A's
 *  brand for project B. The unsuffixed slot stays for the standalone
 *  (non-project) host. */
const STUDIO_RESULT_PREFIX = "systedo.ai.result.creative-studio";
const BRAND_PREFIX = "app:creative-brand";
const slotFor = (prefix: string, pid: string | undefined) => (pid ? `${prefix}.${pid}` : prefix);

const T = {
  cs: {
    formHeading: "Zadání vizuálu",
    fillExample: "Vyplnit ukázku",
    fieldPrompt: "Popis (prompt)",
    promptPlaceholder: "Popište scénu, styl, barvy, náladu…",
    fieldStyle: "Styl",
    fieldFormat: "Formát",
    fieldCount: "Počet kandidátů",
    fieldBrandKit: "Brand kit — barvy, styl, tonalita (volitelné)",
    brandKitPlaceholder: "např. teplé zemité tóny, minimalisticky, přírodní světlo, žádná stocková klišé",
    brandKitHint: "Drží generování i hodnocení v rámci značky — vítěz se vybírá i podle souladu se značkou.",
    fieldRefImage: "Referenční obrázek (volitelné)",
    refImageAlt: "Referenční obrázek",
    refUploading: "Nahrávám…",
    refReadyProduct: "Připraveno — zachová produkt",
    refReadyStyle: "Připraveno — ovlivní styl",
    refRemove: "Odebrat",
    refModeStyle: "Ovlivnit styl",
    refModeProduct: "Zachovat produkt",
    refFidelityLabel: "Věrnost produktu",
    refFidelityAriaLabel: "Věrnost produktu",
    refFidelityHint: "Vyšší = generovaný vizuál věrněji zachová nahraný produkt.",
    refUploadLabel: "Nahrát produkt nebo referenci",
    submitGenerating: "Generuji…",
    submitGenerate: "Vygenerovat vizuál",
    footerNote: "Leonardo vygeneruje {count} {countLabel}, Gemini je ohodnotí a vybere nejlepší. Bez klíče běží ukázkový režim. Vygenerované obrázky se ukládají do knihovny.",
    footerCountSingle: "návrh",
    footerCountPlural: "návrhy",
    emptyTitle: "Vizuály se zobrazí tady",
    emptyBody: "Popište, co potřebujete. Studio vygeneruje několik variant, ohodnotí je AI viděním a nejlepší označí — pak ji můžete stáhnout nebo vylepšit.",
    emptyHint: "Tip: zkuste „Vyplnit ukázku“ a klikněte na Vygenerovat vizuál.",
    loadingLabel: "Generuji a hodnotím kandidáty… (může trvat i půl minuty)",
    sourceLeonardo: "Leonardo · Gemini hodnocení",
    sourceDemo: "Ukázkový režim (bez LEONARDO_API_KEY)",
    improveByDefects: "Vylepšit podle defektů",
    libraryHeading: "Knihovna vizuálů",
    librarySaved: "{n} uloženo",
    libraryOffline:
      "Knihovna vizuálů běží na cloudovém úložišti, které v offline režimu není dostupné. Vygenerované vizuály se zde teď neukládají.",
    downloadAriaLabel: "Stáhnout",
    deleteAriaLabel: "Smazat",
    deleteFailed: "Smazání se nezdařilo.",
    candidateAlt: "Kandidát {n}",
    candidateBest: "Nejlepší",
    candidateNoBg: "Bez pozadí",
    candidateNoDefects: "bez závad",
    candidateVariants: "Varianty",
    candidateVariantsTitle: "Vytvořit varianty podle tohoto návrhu",
    candidateRemoveBg: "Odebrat pozadí",
    candidateRemovingBg: "Odebírám…",
    downloadFilename: "adamant-vizual-{n}{suffix}.{ext}",
    downloadSuffixNoBg: "-bez-pozadi",
    examplePrompt: "Ploché aranžmá ořechů a semínek na světlém dřevěném pozadí, prémiový e-shop, měkké přirozené světlo",
    errorVariantPrep: "Příprava reference selhala.",
    errorVariantGen: "Generování variant selhalo.",
    errorConnect: "Nepodařilo se spojit se serverem.",
    errorNobgFailed: "Nepodařilo se.",
    errorNobgConnect: "Chyba spojení.",
    errorRefUpload: "Nahrání selhalo.",
    errorRefConnect: "Chyba spojení.",
    errorGen: "Generování se nezdařilo.",
    errorTimeout: "Generování nedoběhlo do {n} s. Zkuste to prosím znovu.",
  },
  en: {
    formHeading: "Visual brief",
    fillExample: "Fill example",
    fieldPrompt: "Description (prompt)",
    promptPlaceholder: "Describe the scene, style, colors, mood…",
    fieldStyle: "Style",
    fieldFormat: "Format",
    fieldCount: "Number of candidates",
    fieldBrandKit: "Brand kit — colors, style, tonality (optional)",
    brandKitPlaceholder: "e.g. warm earthy tones, minimalist, natural light, no stock clichés",
    brandKitHint: "Keeps generation and scoring within brand — the winner is also judged on brand fit.",
    fieldRefImage: "Reference image (optional)",
    refImageAlt: "Reference image",
    refUploading: "Uploading…",
    refReadyProduct: "Ready — will preserve the product",
    refReadyStyle: "Ready — will influence the style",
    refRemove: "Remove",
    refModeStyle: "Influence style",
    refModeProduct: "Preserve product",
    refFidelityLabel: "Product fidelity",
    refFidelityAriaLabel: "Product fidelity",
    refFidelityHint: "Higher = the generated visual more faithfully preserves the uploaded product.",
    refUploadLabel: "Upload product or reference",
    submitGenerating: "Generating…",
    submitGenerate: "Generate visual",
    footerNote: "Leonardo will generate {count} {countLabel}, Gemini will score them and pick the best. Without an API key it runs in demo mode. Generated images are saved to the library.",
    footerCountSingle: "draft",
    footerCountPlural: "drafts",
    emptyTitle: "Visuals will appear here",
    emptyBody: "Describe what you need. The studio will generate several variants, score them with AI vision and mark the best — then you can download or refine it.",
    emptyHint: "Tip: try “Fill example” and click Generate visual.",
    loadingLabel: "Generating and scoring candidates… (may take up to half a minute)",
    sourceLeonardo: "Leonardo · Gemini scoring",
    sourceDemo: "Demo mode (no LEONARDO_API_KEY)",
    improveByDefects: "Improve based on defects",
    libraryHeading: "Visual library",
    librarySaved: "{n} saved",
    libraryOffline:
      "The visual library runs on cloud storage, which isn't reachable in offline mode. Generated visuals aren't saved here right now.",
    downloadAriaLabel: "Download",
    deleteAriaLabel: "Delete",
    deleteFailed: "Delete failed.",
    candidateAlt: "Candidate {n}",
    candidateBest: "Best",
    candidateNoBg: "No background",
    candidateNoDefects: "no defects",
    candidateVariants: "Variants",
    candidateVariantsTitle: "Create variants based on this draft",
    candidateRemoveBg: "Remove bg",
    candidateRemovingBg: "Removing…",
    downloadFilename: "adamant-visual-{n}{suffix}.{ext}",
    downloadSuffixNoBg: "-no-bg",
    examplePrompt: "Flat lay of nuts and seeds on a light wooden background, premium e-shop, soft natural light",
    errorVariantPrep: "Reference preparation failed.",
    errorVariantGen: "Variant generation failed.",
    errorConnect: "Could not connect to the server.",
    errorNobgFailed: "Failed.",
    errorNobgConnect: "Connection error.",
    errorRefUpload: "Upload failed.",
    errorRefConnect: "Connection error.",
    errorGen: "Generation failed.",
    errorTimeout: "Generation didn't finish within {n}s. Please try again.",
  },
} as const;

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

export default function CreativeStudio({ projectId }: { projectId?: string } = {}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { status: authStatus } = useSession();
  const project = useOptionalProject();
  // Prefer the explicit prop the project route passes (server-resolved), so a
  // late/missing context provider can't silently drop project scoping on the API
  // calls. The unscoped fallback stays only for the standalone (non-project) host.
  const pid = projectId ?? project?.id;
  const resultSlot = slotFor(STUDIO_RESULT_PREFIX, pid);
  const brandSlot = slotFor(BRAND_PREFIX, pid);
  const fileUrl = (id: string) =>
    pid ? `/api/images/file/${id}?projectId=${encodeURIComponent(pid)}` : `/api/images/file/${id}`;
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyle>("dynamic");
  const [format, setFormat] = useState<ImageFormat>("square");
  const [count, setCount] = useState(2);
  // Brand kit — palette/style/tonality fed into generation AND the vision scoring,
  // so the winner is judged on brand-fit, not just generic quality. Persisted locally.
  const [brand, setBrand] = useState("");
  // Reference image (image-to-image guidance via Leonardo imagePrompts).
  const [referenceImageId, setReferenceImageId] = useState<string | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [refStatus, setRefStatus] = useState<"idle" | "uploading" | "ready" | "error">("idle");
  const [refError, setRefError] = useState<string | null>(null);
  // Reference mode: "style" (imagePrompts — influence) vs "product" (img2img init —
  // faithful product compositing). Fidelity drives the init strength in product mode.
  const [refMode, setRefMode] = useState<"style" | "product">("style");
  const [fidelity, setFidelity] = useState(0.55);

  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ImageGenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Upgrade path carried by a quota (429) response from /api/images, so the error
  // state can show a clickable "raise your limit" CTA instead of only the message.
  const [errorUpgrade, setErrorUpgrade] = useState<string | undefined>(undefined);

  const [library, setLibrary] = useState<CreativeSummary[]>([]);
  // Set when the bucket-backed library is unavailable offline — the surface shows a
  // labeled notice instead of silently rendering an empty library.
  const [libraryOffline, setLibraryOffline] = useState(false);
  const [delBusy, setDelBusy] = useState<string | null>(null);
  // A rejected DELETE left the tile in place with nothing said, which reads as a
  // dead button rather than a failure the user could retry.
  const [delError, setDelError] = useState<string | null>(null);
  // Background-removal results, keyed by Leonardo image id.
  const [nobg, setNobg] = useState<Record<string, NobgEntry>>({});

  // Live request guard for image generation: an AbortController + monotonic run id
  // so a hung /api/images request aborts at AI_TIMEOUT_MS (matching every sibling
  // tool's ceiling) instead of spinning forever, and a slow first generate can't
  // resolve after a newer one and clobber it. Refs — mutating them must not re-render.
  const controllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  /** Begin an image run: abort any in-flight one, arm the hard timeout, and hand
   *  back the signal + staleness/abort guards. `done()` clears the timer. */
  const beginRun = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    return {
      signal: controller.signal,
      isStale: () => runId !== runIdRef.current,
      aborted: () => controller.signal.aborted,
      done: () => clearTimeout(timer),
    };
  };

  /** Persist the latest generation so a refresh doesn't discard quota-paid
   *  candidates. Best-effort: over-quota / unavailable storage keeps the in-memory
   *  result, it just won't survive a reload. */
  const persistResult = (r: ImageGenResult) => {
    try {
      window.localStorage.setItem(resultSlot, JSON.stringify(r));
    } catch {
      /* storage unavailable / over quota — non-fatal */
    }
  };

  // Restore this project's last generation (external-store sync in an effect keeps
  // the server + first client render identical, so the set-state rule is suppressed).
  // Re-runs when the slot changes, i.e. when the project changes — and then clears,
  // so project A's candidates never linger on project B's screen.
  useEffect(() => {
    let saved: ImageGenResult | null = null;
    try {
      const raw = window.localStorage.getItem(resultSlot);
      const parsed = raw ? (JSON.parse(raw) as ImageGenResult) : null;
      if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0) saved = parsed;
    } catch {
      /* corrupt / unavailable storage — start fresh */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(saved);
    setStatus(saved ? "done" : "idle");
  }, [resultSlot]);

  const removeBg = async (img: GeneratedImage) => {
    const id = img.leonardoImageId;
    if (!id) return;
    setNobg((m) => ({ ...m, [id]: { status: "loading" } }));
    try {
      const res = await fetch("/api/images/nobg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: id, projectId: pid }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNobg((m) => ({ ...m, [id]: { status: "error", error: json?.error ?? t("errorNobgFailed") } }));
        return;
      }
      setNobg((m) => ({ ...m, [id]: { status: "done", dataUrl: json.dataUrl } }));
    } catch {
      setNobg((m) => ({ ...m, [id]: { status: "error", error: t("errorNobgConnect") } }));
    }
  };

  // "More like this": re-upload the chosen candidate as a reference image and
  // regenerate guided by it (reuses the upload-ref + imagePrompts flow).
  const makeVariations = async (img: GeneratedImage) => {
    if (!result) return;
    const run = beginRun();
    setStatus("loading");
    setError(null);
    setErrorUpgrade(undefined);
    try {
      const blob = await (await fetch(img.dataUrl, { signal: run.signal })).blob();
      const fd = new FormData();
      fd.append("file", new File([blob], "variant.png", { type: blob.type || "image/png" }));
      if (pid) fd.append("projectId", pid);
      const up = await fetch("/api/images/upload-ref", { method: "POST", body: fd, signal: run.signal });
      const upJson = await up.json();
      if (run.isStale()) return;
      if (!up.ok) {
        setError(upJson?.error ?? t("errorVariantPrep"));
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
          brand: brand.trim() || undefined,
          referenceImageId: upJson.referenceImageId,
          referenceMode: refMode,
          fidelity,
          projectId: pid,
        }),
        signal: run.signal,
      });
      const json = await res.json();
      if (run.isStale()) return;
      if (!res.ok) {
        setError(json?.error ?? t("errorVariantGen"));
        setErrorUpgrade(typeof json?.upgradeUrl === "string" ? json.upgradeUrl : undefined);
        setStatus("error");
        return;
      }
      setResult(json as ImageGenResult);
      persistResult(json as ImageGenResult);
      setStatus("done");
      if (authStatus === "authenticated") void loadLibrary();
    } catch {
      if (run.isStale()) return;
      setError(run.aborted() ? t("errorTimeout", { n: AI_TIMEOUT_SECONDS }) : t("errorConnect"));
      setStatus("error");
    } finally {
      run.done();
    }
  };

  const loadLibrary = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/images?projectId=${encodeURIComponent(pid)}` : "/api/images");
      if (!res.ok) return;
      const json = (await res.json()) as { creatives?: CreativeSummary[]; offline?: boolean };
      setLibrary(json.creatives ?? []);
      setLibraryOffline(Boolean(json.offline));
    } catch {
      /* non-critical */
    }
  }, [pid]);

  useEffect(() => {
    if (authStatus === "authenticated") void loadLibrary();
  }, [authStatus, loadLibrary]);

  // Load this project's brand kit (effect, not lazy init, to avoid SSR hydration
  // mismatch). Re-runs on a project switch and resets to that project's own value.
  useEffect(() => {
    let saved = "";
    try {
      saved = window.localStorage.getItem(brandSlot) ?? "";
    } catch {
      /* storage unavailable — non-fatal */
    }
    // localStorage restore is a valid external-store sync; doing it in an effect
    // keeps the server + first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBrand(saved);
  }, [brandSlot]);

  /** Write-through on edit rather than in an effect keyed on `brand`: an effect
   *  would also fire on a project switch, and in that same commit it still closes
   *  over the OUTGOING project's text — copying A's brand kit into B's slot. */
  const onBrandChange = (value: string) => {
    setBrand(value);
    try {
      window.localStorage.setItem(brandSlot, value);
    } catch {
      /* storage unavailable — non-fatal */
    }
  };

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
      if (pid) fd.append("projectId", pid);
      const res = await fetch("/api/images/upload-ref", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setRefStatus("error");
        setRefError(json?.error ?? t("errorRefUpload"));
        setReferenceImageId(null);
        return;
      }
      setReferenceImageId(json.referenceImageId);
      setRefStatus("ready");
    } catch {
      setRefStatus("error");
      setRefError(t("errorRefConnect"));
      setReferenceImageId(null);
    }
  };

  const clearRef = () => {
    setReferenceImageId(null);
    setRefPreview(null);
    setRefStatus("idle");
    setRefError(null);
    setRefMode("style");
  };

  const generate = async (avoid?: string) => {
    const run = beginRun();
    setStatus("loading");
    setError(null);
    setErrorUpgrade(undefined);
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
          brand: brand.trim() || undefined,
          referenceImageId: refStatus === "ready" ? referenceImageId : undefined,
          referenceMode: refMode,
          fidelity,
          projectId: pid,
        }),
        signal: run.signal,
      });
      const json = await res.json();
      if (run.isStale()) return; // a newer generate/variation superseded this one
      if (!res.ok) {
        setError(json?.error ?? t("errorGen"));
        setErrorUpgrade(typeof json?.upgradeUrl === "string" ? json.upgradeUrl : undefined);
        setStatus("error");
        return;
      }
      setResult(json as ImageGenResult);
      persistResult(json as ImageGenResult);
      setStatus("done");
      if (authStatus === "authenticated") void loadLibrary();
    } catch {
      if (run.isStale()) return;
      setError(run.aborted() ? t("errorTimeout", { n: AI_TIMEOUT_SECONDS }) : t("errorConnect"));
      setStatus("error");
    } finally {
      run.done();
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
    setDelError(null);
    try {
      const res = await fetch("/api/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, projectId: pid }),
      });
      if (res.ok) setLibrary((l) => l.filter((c) => c.id !== id));
      else setDelError(t("deleteFailed"));
    } catch {
      setDelError(t("deleteFailed"));
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
            <h2 className="text-base font-semibold text-navy-800">{t("formHeading")}</h2>
            <button
              type="button"
              onClick={() => setPrompt(t("examplePrompt"))}
              className="text-xs font-semibold text-brand-accent hover:text-brand-800"
            >
              {t("fillExample")}
            </button>
          </div>

          <Field label={t("fieldPrompt")} htmlFor="cs-prompt">
            <textarea
              id="cs-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={t("promptPlaceholder")}
              className={`${inputClass} resize-y`}
            />
          </Field>

          <Field label={t("fieldStyle")}>
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

          <Field label={t("fieldFormat")}>
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

          <Field label={t("fieldCount")}>
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

          <Field label={t("fieldBrandKit")} htmlFor="cs-brand">
            <textarea
              id="cs-brand"
              value={brand}
              onChange={(e) => onBrandChange(e.target.value)}
              rows={2}
              placeholder={t("brandKitPlaceholder")}
              className={`${inputClass} resize-y`}
            />
            <p className="mt-1 text-xs text-muted">
              {t("brandKitHint")}
            </p>
          </Field>

          <Field label={t("fieldRefImage")}>
            {refPreview ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3 rounded-lg border border-line p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refPreview} alt={t("refImageAlt")} className="h-12 w-12 shrink-0 rounded-md object-cover" />
                  <span className="min-w-0 flex-1 text-xs">
                    {refStatus === "uploading" && <span className="text-muted">{t("refUploading")}</span>}
                    {refStatus === "ready" && (
                      <span className="text-positive">
                        {refMode === "product" ? t("refReadyProduct") : t("refReadyStyle")}
                      </span>
                    )}
                    {refStatus === "error" && <span className="text-negative">{refError}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={clearRef}
                    className="shrink-0 text-xs font-medium text-muted hover:text-coral-600"
                  >
                    {t("refRemove")}
                  </button>
                </div>
                {refStatus === "ready" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {(["style", "product"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRefMode(m)}
                          className={`rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                            refMode === m
                              ? "border-brand-400 bg-brand-50 text-brand-800"
                              : "border-line text-muted hover:border-navy-200"
                          }`}
                        >
                          {m === "style" ? t("refModeStyle") : t("refModeProduct")}
                        </button>
                      ))}
                    </div>
                    {refMode === "product" && (
                      <label className="block">
                        <span className="mb-1 flex items-center justify-between text-xs text-navy-700">
                          <span>{t("refFidelityLabel")}</span>
                          <span className="tnum text-muted">{fmt.fmtPct(fidelity)}</span>
                        </span>
                        <input
                          type="range"
                          min={0.3}
                          max={0.85}
                          step={0.05}
                          value={fidelity}
                          onChange={(e) => setFidelity(Number(e.target.value))}
                          className="h-1.5 w-full cursor-pointer accent-brand-600"
                          aria-label={t("refFidelityAriaLabel")}
                        />
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {t("refFidelityHint")}
                        </span>
                      </label>
                    )}
                  </>
                )}
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-3 text-xs text-muted transition-colors hover:border-brand-300 hover:text-brand-accent focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-200">
                {/* `sr-only`, never `hidden`: a display:none input is removed from
                    the tab order and a <label> is not focusable, so the whole
                    upload control was unreachable without a mouse. Visually hidden
                    keeps it focusable; focus-within paints the ring on the box. */}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => onRefSelect(e.target.files?.[0] ?? null)}
                />
                {t("refUploadLabel")}
              </label>
            )}
          </Field>

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-700 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            {status === "loading" ? (
              <>
                <Gauge width={17} height={17} className="animate-pulse" />
                {t("submitGenerating")}
              </>
            ) : (
              <>
                <ImageIcon width={17} height={17} />
                {t("submitGenerate")}
              </>
            )}
          </button>

          <p className="text-xs leading-relaxed text-muted">
            {t("footerNote", {
              count,
              countLabel: count === 1 ? t("footerCountSingle") : t("footerCountPlural"),
            })}
          </p>
        </form>

        <div className="min-w-0">
          {status === "idle" && (
            <ToolEmpty
              icon={ImageIcon}
              title={t("emptyTitle")}
              body={t("emptyBody")}
              hint={t("emptyHint")}
            />
          )}
          {status === "loading" && (
            <div className="card flex animate-fade-in flex-col items-center justify-center gap-3 p-12 text-center text-sm text-muted">
              <Gauge width={22} height={22} className="animate-pulse text-brand-600" />
              {t("loadingLabel")}
            </div>
          )}
          {status === "error" && <ToolError message={error ?? ""} onRetry={() => setStatus("idle")} upgradeUrl={errorUpgrade} />}

          {status === "done" && result && (
            <div className="animate-fade-up space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`pill ${result.source === "leonardo" ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-600"}`}
                >
                  {result.source === "leonardo" ? t("sourceLeonardo") : t("sourceDemo")}
                </span>
                {canIterate && (
                  <button
                    type="button"
                    onClick={() => void generate(winner?.defects)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                  >
                    <Bolt width={13} height={13} />
                    {t("improveByDefects")}
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
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* bucket-backed library unavailable offline — honest labeled notice */}
      {authStatus === "authenticated" && libraryOffline && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-navy-800">{t("libraryHeading")}</h2>
          <p className="card border-dashed p-3 text-xs text-muted">{t("libraryOffline")}</p>
        </section>
      )}

      {/* persisted asset library */}
      {authStatus === "authenticated" && library.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-navy-800">{t("libraryHeading")}</h2>
            <span className="text-xs text-muted">{t("librarySaved", { n: library.length })}</span>
          </div>
          {delError && (
            <p role="alert" className="mb-2 text-xs text-negative">
              {delError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {library.map((c) => (
              <div key={c.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(c.id)}
                  alt={c.prompt}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                <div className="p-3">
                  <p className="line-clamp-2 text-xs text-navy-700">{c.prompt}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[13px] text-muted">
                      {c.score !== null && <span className={`pill ${scoreTone(c.score)} mr-1`}>{c.score}/10</span>}
                      {c.createdAt && <time dateTime={c.createdAt}>{fmt.fmtRelative(c.createdAt)}</time>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <a
                        href={fileUrl(c.id)}
                        download
                        aria-label={t("downloadAriaLabel")}
                        className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-brand-accent"
                      >
                        <Download width={14} height={14} />
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={delBusy === c.id}
                        aria-label={t("deleteAriaLabel")}
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
  t,
}: {
  img: GeneratedImage;
  index: number;
  aspect: string;
  nobgState?: NobgEntry;
  onRemoveBg: (img: GeneratedImage) => void;
  onVariations: (img: GeneratedImage) => void;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
}) {
  const cutout = nobgState?.status === "done" ? nobgState.dataUrl : null;
  const display = cutout ?? img.dataUrl;
  const download = () =>
    downloadDataUrl(
      t("downloadFilename", {
        n: index + 1,
        suffix: cutout ? t("downloadSuffixNoBg") : "",
        ext: cutout ? "png" : extOf(img.mime),
      }),
      display
    );
  return (
    <div className={`card overflow-hidden ${img.winner ? "ring-2 ring-brand-400" : ""}`}>
      <div className="relative" style={cutout ? CHECKER : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={display}
          alt={t("candidateAlt", { n: index + 1 })}
          className={`w-full ${cutout ? "object-contain" : "object-cover"} ${aspect}`}
        />
        {img.winner && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-pill bg-brand-700 px-2 py-0.5 text-[13px] font-semibold text-white">
            <Check width={11} height={11} />
            {t("candidateBest")}
          </span>
        )}
        {img.score !== null && (
          <span className={`pill absolute right-2 top-2 ${scoreTone(img.score)}`}>{img.score}/10</span>
        )}
        {cutout && (
          <span className="pill absolute bottom-2 left-2 bg-positive-soft text-positive">{t("candidateNoBg")}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 p-2.5">
        <span className="truncate text-[13px] text-muted" title={img.defects}>
          {img.defects && img.defects !== "none" ? img.defects : t("candidateNoDefects")}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {img.leonardoImageId && (
            <button
              type="button"
              onClick={() => onVariations(img)}
              title={t("candidateVariantsTitle")}
              className="rounded-pill border border-line px-2.5 py-1 text-[13px] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
            >
              {t("candidateVariants")}
            </button>
          )}
          {img.leonardoImageId && !cutout && (
            <button
              type="button"
              onClick={() => onRemoveBg(img)}
              disabled={nobgState?.status === "loading"}
              className="rounded-pill border border-line px-2.5 py-1 text-[13px] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
            >
              {nobgState?.status === "loading" ? t("candidateRemovingBg") : t("candidateRemoveBg")}
            </button>
          )}
          <button
            type="button"
            onClick={download}
            aria-label={t("downloadAriaLabel")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-brand-accent"
          >
            <Download width={14} height={14} />
          </button>
        </span>
      </div>
      {nobgState?.status === "error" && (
        <p className="px-2.5 pb-2 text-[13px] text-negative">{nobgState.error}</p>
      )}
    </div>
  );
}
