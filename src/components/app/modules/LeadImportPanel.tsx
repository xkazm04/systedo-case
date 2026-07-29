"use client";

/** Direction 2 — honest source banner + importer for the lead funnel. Live → a
 *  "živá data" strip with a revert (and URL refresh); sample → an illustrative note
 *  plus a paste-in / URL importer that hits the leads import route. Mirrors
 *  LocalSourcePanel; the funnel/velocity/alerts recompute from the imported rows on
 *  refresh. Client. cs/en. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Check } from "@/components/icons";

const T = {
  cs: {
    live: "Živá data · leady z importu",
    liveUrl: "Živá data · leady z URL",
    sampleNote: "Ukázkový trychtýř (ilustrativní). Naimportujte reálné leady z CRM a trychtýř, rychlost i upozornění se spočítají z nich.",
    importCta: "Importovat leady",
    importHelp:
      "Vložte řádky ve formátu: zdroj, fáze (lead / kvalifikovaný / příležitost / uzavřeno), datum, hodnota (nepovinné), datum uzavření (nepovinné). Hodnoty mohou být v uvozovkách. První řádek může být hlavička.",
    placeholder:
      "zdroj, fáze, datum, hodnota, datum uzavření\nGoogle Ads,uzavřeno,2026-05-02,48000,2026-05-20\nMeta,lead,2026-05-05",
    urlPlaceholder: "https://…/leady.csv",
    synced: "synchronizováno {date}",
    refresh: "Aktualizovat z URL",
    revert: "Zpět na ukázková",
    importBtn: "Nahrát",
    importing: "Nahrávám…",
    failed: "Import se nezdařil.",
    urlLabel: "…nebo načíst z URL (publikovaná tabulka / export):",
    urlBtn: "Načíst z URL",
  },
  en: {
    live: "Live data · imported leads",
    liveUrl: "Live data · leads from URL",
    sampleNote: "Sample funnel (illustrative). Import your real CRM leads and the funnel, velocity and alerts compute from them.",
    importCta: "Import leads",
    importHelp:
      "Paste rows as: source, stage (lead / qualified / opportunity / won), date, value (optional), close date (optional). Values may be quoted. A header row is optional.",
    placeholder:
      "source, stage, date, value, close date\nGoogle Ads,won,2026-05-02,48000,2026-05-20\nMeta,lead,2026-05-05",
    urlPlaceholder: "https://…/leads.csv",
    synced: "synced {date}",
    refresh: "Refresh from URL",
    revert: "Back to sample",
    importBtn: "Upload",
    importing: "Uploading…",
    failed: "Import failed.",
    urlLabel: "…or fetch from a URL (published sheet / export):",
    urlBtn: "Fetch from URL",
  },
} as const;

export default function LeadImportPanel({
  projectId,
  live,
  source,
  syncedAt,
  sourceUrl,
}: {
  projectId: string;
  live: boolean;
  source?: "sample" | "import" | "url";
  syncedAt?: string;
  sourceUrl?: string;
}) {
  const t = useT(T);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const route = `/api/projects/${projectId}/leads/import`;

  async function submit(mode: "text" | "url", overrideUrl?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "url" ? { url: overrideUrl ?? url } : { text }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setOpen(false);
        setText("");
        setUrl("");
        router.refresh();
      } else {
        setMsg(json.error || t("failed"));
      }
    } catch {
      setMsg(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function revert() {
    setBusy(true);
    try {
      await fetch(route, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (live) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-positive-soft px-4 py-3 text-xs">
        <span className="font-medium text-positive">
          <Check width={12} height={12} className="mb-0.5 mr-1 inline" />
          {source === "url" ? t("liveUrl") : t("live")}
          {syncedAt ? ` · ${t("synced", { date: syncedAt.slice(0, 10) })}` : ""}
        </span>
        <div className="flex items-center gap-2">
          {msg && <span className="text-negative">{msg}</span>}
          {source === "url" && sourceUrl && (
            <button
              type="button"
              onClick={() => submit("url", sourceUrl)}
              disabled={busy}
              className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
            >
              {t("refresh")}
            </button>
          )}
          <button
            type="button"
            onClick={revert}
            disabled={busy}
            className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
          >
            {t("revert")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-canvas px-4 py-3 text-xs text-muted">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{t("sampleNote")}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300"
        >
          {t("importCta")}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="leading-relaxed">{t("importHelp")}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={t("placeholder")}
            className="w-full rounded-card border border-line bg-surface px-3 py-2 font-mono text-xs text-navy-800 focus:border-brand-300 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => submit("text")}
            disabled={busy || !text.trim()}
            className="rounded-pill bg-brand-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {busy ? t("importing") : t("importBtn")}
          </button>

          <p className="pt-1 leading-relaxed">{t("urlLabel")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("urlPlaceholder")}
              className="min-w-0 flex-1 rounded-card border border-line bg-surface px-3 py-2 text-xs text-navy-800 focus:border-brand-300 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => submit("url")}
              disabled={busy || !url.trim()}
              className="shrink-0 rounded-pill border border-line bg-surface px-4 py-2 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
            >
              {busy ? t("importing") : t("urlBtn")}
            </button>
          </div>
          {msg && <span className="block text-negative">{msg}</span>}
        </div>
      )}
    </div>
  );
}
