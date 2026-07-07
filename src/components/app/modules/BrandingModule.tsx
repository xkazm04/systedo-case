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
    logo: "Logo (URL)", logoHint: "Odkaz na hostované logo (PNG/SVG). Zobrazí se v hlavičce klientských reportů.",
    logoPlaceholder: "https://…/logo.png",
    preview: "Náhled hlavičky reportu", reportTitle: "Měsíční report",
    save: "Uložit branding", saving: "Ukládám…", saved: "Uloženo", error: "Uložení se nezdařilo.",
    nameNote: "Název projektu se upravuje v Nastavení.", invalidHex: "Zadej platnou hex barvu (#rrggbb).",
  },
  en: {
    accent: "Brand accent", accentHint: "Used in the sidebar rail, reports and the client microsite.",
    logo: "Logo (URL)", logoHint: "Link to a hosted logo (PNG/SVG). Shows in the client report header.",
    logoPlaceholder: "https://…/logo.png",
    preview: "Report header preview", reportTitle: "Monthly report",
    save: "Save branding", saving: "Saving…", saved: "Saved", error: "Could not save.",
    nameNote: "The project name is edited in Settings.", invalidHex: "Enter a valid hex color (#rrggbb).",
  },
} as const;

type Status = "idle" | "saving" | "saved" | "error";

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
            type="url"
            value={logo}
            onChange={(e) => { setLogo(e.target.value); setStatus("idle"); }}
            placeholder={t("logoPlaceholder")}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 focus:border-brand-400 focus:outline-none"
          />
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
