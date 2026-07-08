"use client";

/** A2 — honest source banner + rank import for the map's keyword ladder. Live
 *  (imported/synced) → a "živá data" strip with a revert; sample → an illustrative
 *  note plus a paste-in importer (keyword, oblast, pozice) that hits the
 *  local-signals import route and refreshes. Client (fetch + router.refresh). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { Check } from "@/components/icons";

const T = {
  cs: {
    live: "Živá data · pozice z importu",
    synced: "synchronizováno {date}",
    revert: "Zpět na ukázková",
    sampleNote: "Ukázkové pozice (ilustrativní). Naimportujte reálné pozice z libovolného rank trackeru.",
    importCta: "Importovat pozice",
    importHelp: "Vložte řádky ve formátu: klíčové slovo, oblast, pozice (oddělené čárkou, středníkem nebo tabem). První řádek může být hlavička.",
    importBtn: "Nahrát pozice",
    importing: "Nahrávám…",
    failed: "Import se nezdařil.",
  },
  en: {
    live: "Live data · imported rankings",
    synced: "synced {date}",
    revert: "Back to sample",
    sampleNote: "Sample rankings (illustrative). Import your real positions from any rank tracker.",
    importCta: "Import rankings",
    importHelp: "Paste rows as: keyword, area, position (comma-, semicolon- or tab-separated). A header row is optional.",
    importBtn: "Upload rankings",
    importing: "Uploading…",
    failed: "Import failed.",
  },
} as const;

export default function LocalLadderSource({
  projectId,
  live,
  syncedAt,
}: {
  projectId: string;
  live: boolean;
  syncedAt?: string;
}) {
  const t = useT(T);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/local-signals/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setOpen(false);
        setText("");
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

  if (live) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-positive-soft px-4 py-3 text-xs">
        <span className="font-medium text-positive">
          <Check width={12} height={12} className="mb-0.5 mr-1 inline" />
          {t("live")}
          {syncedAt ? ` · ${t("synced", { date: syncedAt.slice(0, 10) })}` : ""}
        </span>
        <button
          type="button"
          onClick={revert}
          disabled={busy}
          className="rounded-pill border border-line bg-surface px-3 py-1.5 font-semibold text-navy-700 transition-colors hover:border-brand-300 disabled:opacity-50"
        >
          {t("revert")}
        </button>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !text.trim()}
              className="rounded-pill bg-brand-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? t("importing") : t("importBtn")}
            </button>
            {msg && <span className="text-negative">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
