"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { External, Check, Layers } from "@/components/icons";
import { useOptionalProject } from "@/lib/projects/context";
import type { MicrositeConfig } from "@/lib/microsite";

const PERIODS = [
  { days: 30, label: "30 dní" },
  { days: 90, label: "90 dní" },
  { days: 365, label: "12 měsíců" },
];

/** Publish a white-label, SEO-indexable client microsite at /m/{slug} that
 *  re-renders from the latest snapshot. Anonymous → hidden. */
export default function MicrositeCard() {
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [site, setSite] = useState<MicrositeConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [clientName, setClientName] = useState("");
  const [accentColor, setAccentColor] = useState("#0f766e");
  const [periodDays, setPeriodDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(pid ? `/api/microsite?projectId=${encodeURIComponent(pid)}` : "/api/microsite");
      if (!res.ok) return;
      const json = (await res.json()) as { microsite?: MicrositeConfig | null };
      setSite(json.microsite ?? null);
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, [pid]);

  useEffect(() => {
    // Set after mount (not during render) so SSR ("") and first client paint
    // agree — avoids a hydration mismatch on the displayed absolute URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    if (status === "authenticated") void load();
  }, [status, load]);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/microsite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, accentColor, periodDays, projectId: pid }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Publikování se nezdařilo.");
        return;
      }
      setSite(json.microsite as MicrositeConfig);
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setBusy(false);
    }
  };

  const takeOffline = async () => {
    setBusy(true);
    try {
      await fetch(pid ? `/api/microsite?projectId=${encodeURIComponent(pid)}` : "/api/microsite", {
        method: "DELETE",
      });
      setSite(null);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  if (status !== "authenticated" || !loaded) return null;

  const url = site ? `${origin}/m/${site.slug}` : "";

  return (
    <section className="card p-6">
      <div className="flex items-center gap-2">
        <Layers width={16} height={16} className="text-brand-accent" />
        <h2 className="text-base font-semibold text-navy-800">Klientský microsite</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Veřejná, vyhledávači indexovatelná stránka s výkonem klienta na stálé adrese — vždy aktuální
        z posledního snapshotu, ve vašich barvách.
      </p>

      {site ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-positive/30 bg-positive-soft/40 px-3 py-2.5 text-sm">
            <Check width={15} height={15} className="text-positive" />
            <span className="font-medium text-navy-800">{site.clientName}</span>
            <a
              href={`/m/${site.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-accent hover:underline"
            >
              {url || `/m/${site.slug}`}
              <External width={13} height={13} />
            </a>
          </div>
          <button
            type="button"
            onClick={takeOffline}
            disabled={busy}
            className="text-xs font-medium text-negative hover:underline disabled:opacity-60"
          >
            Vypnout microsite
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="text-xs font-medium text-muted">
            Název klienta
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Mionelo"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
            />
          </label>
          <label className="text-xs font-medium text-muted">
            Akcent
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="mt-1 block h-9 w-14 cursor-pointer rounded-lg border border-line bg-surface"
            />
          </label>
          <label className="text-xs font-medium text-muted">
            Období
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800"
            >
              {PERIODS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={publish}
            disabled={busy || clientName.trim().length < 2}
            className="rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-3 sm:justify-self-start"
          >
            {busy ? "Publikuji…" : "Publikovat microsite"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}
    </section>
  );
}
