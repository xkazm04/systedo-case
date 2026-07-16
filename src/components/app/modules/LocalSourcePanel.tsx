"use client";

/** D2/D3 — honest source banner + importer for the local-signals sections that ride
 *  the same seam as the rank ladder (reviews, GBP). Live → a "živá data" strip with a
 *  per-source revert (and URL refresh); sample → an illustrative note plus a paste-in
 *  importer that hits the local-signals import route with the section's `kind`. Mirrors
 *  LocalLadderSource; the labels/placeholder come from the `kind`. Client. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Check } from "@/components/icons";
import type { LocalSignalsSource } from "@/lib/local-signals/types";

type Kind = "reviews" | "gbp" | "coverage";

const T = {
  cs: {
    reviewsLive: "Živá data · recenze z importu",
    reviewsLiveUrl: "Živá data · recenze z URL",
    reviewsSampleNote: "Ukázkové recenze (ilustrativní). Naimportujte reálné recenze z Google profilu nebo jiného zdroje.",
    reviewsImportCta: "Importovat recenze",
    reviewsImportHelp: "Vložte řádky ve formátu: autor, hodnocení (1–5), text, datum, oblast. Text může být v uvozovkách. První řádek může být hlavička.",
    reviewsPlaceholder: 'autor, hodnocení, text, datum, oblast\nJana K.,5,"Skvělé, doporučuji",2026-06-01,Praha',
    reviewsUrlPlaceholder: "https://…/recenze.csv",
    gbpLive: "Živá data · pobočky z importu",
    gbpLiveUrl: "Živá data · pobočky z URL",
    gbpSampleNote: "Ukázkové pobočky (ilustrativní). Naimportujte reálný stav Google profilů (export z Business Profile).",
    gbpImportCta: "Importovat pobočky",
    gbpImportHelp: "Vložte řádky ve formátu: pobočka, stav (připojeno/vyžaduje akci/odpojeno), počet recenzí, hodnocení, nezodpovězené. První řádek může být hlavička.",
    gbpPlaceholder: "pobočka, stav, recenze, hodnocení, nezodpovězené\nPraha,připojeno,128,4.8,2",
    gbpUrlPlaceholder: "https://…/pobocky.csv",
    coverageLive: "Živá data · pokrytí z importu",
    coverageLiveUrl: "Živá data · pokrytí z URL",
    coverageSampleNote: "Ukázkové pokrytí (odvozené z katalogu). Naimportujte reálný stav stránek, nebo klikněte na buňku matice a přepněte pokrytí ručně.",
    coverageImportCta: "Importovat pokrytí",
    coverageImportHelp: "Vložte řádky ve formátu: služba, lokalita, má stránku (ano/ne). První řádek může být hlavička.",
    coveragePlaceholder: "služba, lokalita, má stránku\nMontáž klimatizací,Praha,ano",
    coverageUrlPlaceholder: "https://…/pokryti.csv",
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
    reviewsLive: "Live data · imported reviews",
    reviewsLiveUrl: "Live data · reviews from URL",
    reviewsSampleNote: "Sample reviews (illustrative). Import your real reviews from a Google profile or another source.",
    reviewsImportCta: "Import reviews",
    reviewsImportHelp: "Paste rows as: author, rating (1–5), text, date, area. Text may be quoted. A header row is optional.",
    reviewsPlaceholder: 'author, rating, text, date, area\nJana K.,5,"Great, recommend",2026-06-01,Praha',
    reviewsUrlPlaceholder: "https://…/reviews.csv",
    gbpLive: "Live data · imported locations",
    gbpLiveUrl: "Live data · locations from URL",
    gbpSampleNote: "Sample locations (illustrative). Import your real Google profile status (Business Profile export).",
    gbpImportCta: "Import locations",
    gbpImportHelp: "Paste rows as: location, status (connected/attention/disconnected), review count, rating, unanswered. A header row is optional.",
    gbpPlaceholder: "location, status, reviews, rating, unanswered\nPraha,connected,128,4.8,2",
    gbpUrlPlaceholder: "https://…/locations.csv",
    coverageLive: "Live data · imported coverage",
    coverageLiveUrl: "Live data · coverage from URL",
    coverageSampleNote: "Sample coverage (derived from the catalog). Import your real page status, or click a matrix cell to toggle coverage manually.",
    coverageImportCta: "Import coverage",
    coverageImportHelp: "Paste rows as: service, locality, has page (yes/no). A header row is optional.",
    coveragePlaceholder: "service, locality, has page\nAC installation,Prague,yes",
    coverageUrlPlaceholder: "https://…/coverage.csv",
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

type LabelKey = keyof (typeof T)["cs"];

export default function LocalSourcePanel({
  projectId,
  kind,
  live,
  source,
  syncedAt,
  sourceUrl,
}: {
  projectId: string;
  kind: Kind;
  live: boolean;
  source?: "sample" | LocalSignalsSource;
  syncedAt?: string;
  sourceUrl?: string;
}) {
  const t = useT(T);
  // Kind-scoped label lookup: `kt("Live")` → t("reviewsLive") | t("gbpLive").
  const kt = (suffix: string) => t(`${kind}${suffix}` as LabelKey);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const route = `/api/projects/${projectId}/local-signals/import`;

  async function submit(mode: "text" | "url") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "url" ? { url, kind } : { text, kind }),
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
      await fetch(`${route}?source=${kind}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function refreshFromUrl() {
    if (!sourceUrl) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, kind }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) router.refresh();
      else setMsg(json.error || t("failed"));
    } catch {
      setMsg(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  if (live) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-positive-soft px-4 py-3 text-xs">
        <span className="font-medium text-positive">
          <Check width={12} height={12} className="mb-0.5 mr-1 inline" />
          {source === "url" ? kt("LiveUrl") : kt("Live")}
          {syncedAt ? ` · ${t("synced", { date: syncedAt.slice(0, 10) })}` : ""}
        </span>
        <div className="flex items-center gap-2">
          {msg && <span className="text-negative">{msg}</span>}
          {source === "url" && sourceUrl && (
            <button
              type="button"
              onClick={refreshFromUrl}
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
        <span>{kt("SampleNote")}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300"
        >
          {kt("ImportCta")}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="leading-relaxed">{kt("ImportHelp")}</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={kt("Placeholder")}
            className="w-full rounded-card border border-line bg-surface px-3 py-2 font-mono text-xs text-navy-800 focus:border-brand-300 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => submit("text")}
            disabled={busy || !text.trim()}
            className="rounded-pill bg-brand-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t("importing") : t("importBtn")}
          </button>

          <p className="pt-1 leading-relaxed">{t("urlLabel")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={kt("UrlPlaceholder")}
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
