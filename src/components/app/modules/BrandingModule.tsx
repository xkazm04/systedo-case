"use client";

/** Branding — the client-facing look applied to reports & the microsite: brand
 *  accent + logo, with a live preview of a report header. Persists to the project
 *  via PATCH /api/projects/{id} (accent already persisted; logoUrl added in the
 *  same epic across both stores). Account epic (consolidation phase 6). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { ACCENT_PALETTE, initials, isHexColor, readableOn } from "@/lib/branding/compute";

const T = {
  cs: {
    accent: "Brand accent", accentHint: "Použije se v postranním panelu, reportech a klientském webu.",
    logo: "Logo", logoHint: "Vlož odkaz na hostované logo, nebo nahraj soubor. Zobrazí se v hlavičce klientských reportů.",
    logoPlaceholder: "https://…/logo.png",
    uploadBtn: "Nahrát soubor", uploadHint: "PNG/JPG/SVG — rastr se zmenší na 256 px.",
    uploadError: "Soubor se nepodařilo načíst (obrázek do 5 MB).", removeLogo: "Odebrat",
    preview: "Náhled hlavičky reportu", reportTitle: "Měsíční report",
    save: "Uložit branding", saving: "Ukládám…", saved: "Uloženo", error: "Uložení se nezdařilo.",
    nameNote: "Název projektu se upravuje v Nastavení.", invalidHex: "Zadej platnou hex barvu (#rrggbb).",
  },
  en: {
    accent: "Brand accent", accentHint: "Used in the sidebar rail, reports and the client microsite.",
    logo: "Logo", logoHint: "Paste a hosted logo URL, or upload a file. Shows in the client report header.",
    logoPlaceholder: "https://…/logo.png",
    uploadBtn: "Upload file", uploadHint: "PNG/JPG/SVG — raster is downscaled to 256 px.",
    uploadError: "Could not load the file (image up to 5 MB).", removeLogo: "Remove",
    preview: "Report header preview", reportTitle: "Monthly report",
    save: "Save branding", saving: "Saving…", saved: "Saved", error: "Could not save.",
    nameNote: "The project name is edited in Settings.", invalidHex: "Enter a valid hex color (#rrggbb).",
  },
} as const;

type Status = "idle" | "saving" | "saved" | "error";

const LOGO_MAX_PX = 256;
const SVG_MAX_BYTES = 100_000;
const FILE_MAX_BYTES = 5_000_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

/** Picked image file → a small data URL for the persisted logoUrl field: an SVG
 *  passes through (vector, capped); a raster is downscaled to <=256px webp so the
 *  stored value stays tiny (well under the Firestore 1MB doc limit). */
async function fileToLogoDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  if (file.type === "image/svg+xml") {
    if (file.size > SVG_MAX_BYTES) throw new Error("svg too large");
    return readAsDataUrl(file);
  }
  const img = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/webp", 0.85);
}

export default function BrandingModule({
  projectId,
  name,
  accentColor,
  logoUrl,
}: {
  projectId: string;
  name: string;
  accentColor: string;
  logoUrl?: string;
}) {
  const t = useT(T);
  const router = useRouter();
  const [accent, setAccent] = useState(accentColor);
  const [logo, setLogo] = useState(logoUrl ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [uploadError, setUploadError] = useState(false);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the user re-pick the same file
    if (!file) return;
    setUploadError(false);
    try {
      if (file.size > FILE_MAX_BYTES) throw new Error("too big");
      const dataUrl = await fileToLogoDataUrl(file);
      setLogo(dataUrl);
      setStatus("idle");
    } catch {
      setUploadError(true);
    }
  }

  const hexValid = isHexColor(accent);
  const fg = hexValid ? readableOn(accent) : "#ffffff";

  async function save() {
    if (!hexValid) return;
    setStatus("saving");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accentColor: accent, logoUrl: logo.trim() }),
      });
      if (!res.ok) throw new Error("save failed");
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start">
      {/* controls */}
      <div className="card space-y-6 p-6">
        <div>
          <p className="text-sm font-medium text-navy-800">{t("accent")}</p>
          <p className="mb-3 text-xs text-muted">{t("accentHint")}</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setAccent(c); setStatus("idle"); }}
                aria-label={c}
                className={"relative h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-surface transition " + (accent.toLowerCase() === c ? "ring-navy-800" : "ring-transparent hover:ring-line")}
                style={{ backgroundColor: c }}
              >
                {accent.toLowerCase() === c && (
                  <Check width={14} height={14} className="absolute inset-0 m-auto" style={{ color: readableOn(c) }} />
                )}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="color"
              value={hexValid ? accent : "#000000"}
              onChange={(e) => { setAccent(e.target.value); setStatus("idle"); }}
              aria-label={t("accent")}
              className="h-9 w-9 cursor-pointer rounded border border-line bg-surface p-0.5"
            />
            <input
              type="text"
              value={accent}
              onChange={(e) => { setAccent(e.target.value); setStatus("idle"); }}
              spellCheck={false}
              className="tnum w-28 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-navy-800 focus:border-brand-400 focus:outline-none"
            />
          </div>
          {!hexValid && <p className="mt-1.5 text-xs text-negative">{t("invalidHex")}</p>}
        </div>

        <div>
          <label htmlFor="brand-logo" className="text-sm font-medium text-navy-800">{t("logo")}</label>
          <p className="mb-2 text-xs text-muted">{t("logoHint")}</p>
          <input
            id="brand-logo"
            type="text"
            value={logo.startsWith("data:") ? "" : logo}
            onChange={(e) => { setLogo(e.target.value); setStatus("idle"); setUploadError(false); }}
            placeholder={logo.startsWith("data:") ? "— nahraný soubor —" : t("logoPlaceholder")}
            disabled={logo.startsWith("data:")}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none disabled:opacity-60"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-800 transition-colors hover:border-brand-300">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={onPickFile}
                className="hidden"
              />
              {t("uploadBtn")}
            </label>
            {logo && (
              <button
                type="button"
                onClick={() => { setLogo(""); setStatus("idle"); setUploadError(false); }}
                className="text-xs font-medium text-muted transition-colors hover:text-negative"
              >
                {t("removeLogo")}
              </button>
            )}
            <span className="text-xs text-muted">{t("uploadHint")}</span>
          </div>
          {uploadError && <p className="mt-1.5 text-xs text-negative">{t("uploadError")}</p>}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={status === "saving" || !hexValid}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {status === "saved" && <Check width={16} height={16} />}
            {status === "saving" ? t("saving") : status === "saved" ? t("saved") : t("save")}
          </button>
          {status === "error" && <span className="text-sm text-negative">{t("error")}</span>}
        </div>
        <p className="text-xs text-muted">{t("nameNote")}</p>
      </div>

      {/* live preview */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("preview")}</p>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-4 p-6" style={{ backgroundColor: hexValid ? accent : "#334155", color: fg }}>
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/15">
              {logo.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-lg font-bold" style={{ color: fg }}>{initials(name)}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{name}</p>
              <p className="text-sm opacity-80">{t("reportTitle")}</p>
            </div>
          </div>
          <div className="space-y-3 p-6">
            <div className="h-2.5 w-1/3 rounded-pill" style={{ backgroundColor: hexValid ? accent : "#334155" }} />
            <div className="h-2 w-full rounded-pill bg-canvas" />
            <div className="h-2 w-5/6 rounded-pill bg-canvas" />
            <div className="h-2 w-2/3 rounded-pill bg-canvas" />
          </div>
        </div>
      </div>
    </div>
  );
}
