"use client";

/** A2 — honest source banner + rank import for the map's keyword ladder. Live
 *  (imported/synced) → a "živá data" strip with a revert; sample → an illustrative
 *  note plus a paste-in importer (keyword, oblast, pozice) that hits the
 *  local-signals import route and refreshes. Client (fetch + router.refresh). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Check } from "@/components/icons";
import type { LocalSignalsSource } from "@/lib/local-signals/types";

const T = {
  cs: {
    live: "Živá data · pozice z importu",
    liveUrl: "Živá data · pozice z URL",
    synced: "synchronizováno {date}",
    refresh: "Aktualizovat z URL",
    revert: "Zpět na ukázková",
    sampleNote: "Ukázkové pozice (ilustrativní). Naimportujte reálné pozice z libovolného rank trackeru.",
    importCta: "Importovat pozice",
    importHelp: "Vložte řádky ve formátu: klíčové slovo, oblast, pozice (oddělené čárkou, středníkem nebo tabem). První řádek může být hlavička.",
    importBtn: "Nahrát pozice",
    importing: "Nahrávám…",
    failed: "Import se nezdařil.",
    urlLabel: "…nebo načíst z URL (publikovaná tabulka / export z rank trackeru):",
    urlPlaceholder: "https://…/pozice.csv",
    urlBtn: "Načíst z URL",
    or: "nebo",
  },
  en: {
    live: "Live data · imported rankings",
    liveUrl: "Live data · rankings from URL",
    synced: "synced {date}",
    refresh: "Refresh from URL",
    revert: "Back to sample",
    sampleNote: "Sample rankings (illustrative). Import your real positions from any rank tracker.",
    importCta: "Import rankings",
    importHelp: "Paste rows as: keyword, area, position (comma-, semicolon- or tab-separated). A header row is optional.",
    importBtn: "Upload rankings",
    importing: "Uploading…",
    failed: "Import failed.",
    urlLabel: "…or fetch from a URL (published sheet / rank-tracker export):",
    urlPlaceholder: "https://…/rankings.csv",
    urlBtn: "Fetch from URL",
    or: "or",
  },
} as const;

export default function LocalLadderSource({
  projectId,
  live,
  source,
  syncedAt,
  sourceUrl,
}: {
  projectId: string;
  live: boolean;
  source?: "sample" | LocalSignalsSource;
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

  async function submit(mode: "text" | "url") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-signals/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "url" ? { url } : { text }),
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
      await fetch(`/api/projects/${projectId}/local-signals/import`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Re-fetch the stored URL — what makes the URL path a repeatable connector, not a
  // one-shot import (a future cron could call the same route).
  async function refreshFromUrl() {
    if (!sourceUrl) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-signals/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl }),
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
          {source === "url" ? t("liveUrl") : t("live")}
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
            placeholder={"klíčové slovo, oblast, pozice\nzubař, Žižkov, 3"}
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
