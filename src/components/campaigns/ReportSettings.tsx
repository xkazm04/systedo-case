"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Document } from "@/components/icons";
import {
  REPORT_CADENCES,
  REPORT_CADENCE_LABELS,
  type ReportCadence,
  type ReportConfig,
} from "@/lib/campaigns/report-config-types";

/** White-label + scheduling settings for the client report. Branding stamps the
 *  shared report page; cadence + recipients drive the daily report cron. Renders
 *  nothing for anonymous visitors. */
export default function ReportSettings() {
  const { status } = useSession();
  const [cfg, setCfg] = useState<ReportConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/report-config");
      if (!res.ok) return;
      setCfg((await res.json()) as ReportConfig);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  if (status !== "authenticated" || !cfg) return null;

  const set = <K extends keyof ReportConfig>(key: K, value: ReportConfig[K]) => {
    setCfg((c) => (c ? { ...c, [key]: value } : c));
    setSaved(false);
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/report-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: cfg.brandName,
          accentColor: cfg.accentColor,
          recipients: cfg.recipients,
          cadence: cfg.cadence,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Uložení se nezdařilo.");
        return;
      }
      setCfg(json as ReportConfig);
      setSaved(true);
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="card p-5 sm:p-6">
      <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold text-navy-800">
        <Document width={18} height={18} className="text-brand-600" />
        Automatický report pro klienta
        <span className="ml-auto text-xs font-normal text-muted">
          {cfg.cadence === "off" ? "vypnuto" : REPORT_CADENCE_LABELS[cfg.cadence]}
        </span>
      </summary>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">Název značky (white-label)</span>
          <input
            type="text"
            value={cfg.brandName}
            onChange={(e) => set("brandName", e.target.value)}
            placeholder="Adamant"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">Akcentová barva</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={cfg.accentColor || "#0e9c97"}
              onChange={(e) => set("accentColor", e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-line bg-surface"
              aria-label="Akcentová barva"
            />
            <input
              type="text"
              value={cfg.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
              placeholder="#0e9c97"
              className="tnum w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">
            Příjemci (e-maily oddělené čárkou)
          </span>
          <input
            type="text"
            value={cfg.recipients.join(", ")}
            onChange={(e) => set("recipients", e.target.value.split(/[\s,;]+/).filter(Boolean))}
            placeholder="klient@firma.cz, account@agentura.cz"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
          <span className="mt-1 block text-xs text-muted">Prázdné = pošle se vlastníkovi účtu.</span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">Frekvence</span>
          <select
            value={cfg.cadence}
            onChange={(e) => set("cadence", e.target.value as ReportCadence)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          >
            {REPORT_CADENCES.map((c) => (
              <option key={c} value={c}>
                {REPORT_CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-negative">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Ukládám…" : "Uložit nastavení"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-positive">
            <Check width={15} height={15} />
            Uloženo
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        Automatické odesílání běží pro připojené živé účty. Report se vytvoří z posledního
        vyhodnocení portfolia; pokud žádné není, odeslání se přeskočí.
      </p>
    </details>
  );
}
