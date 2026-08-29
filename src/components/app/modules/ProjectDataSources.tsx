"use client";

/** The project's "Zdroj dat" card — which ad platforms feed THIS project's report.
 *
 *  Extracted out of ProjectSettings (which was already at its 200-line ceiling) when
 *  ADR-0010 gave the card a second row: Google Ads linkage is an account id set in
 *  the Kampaně module, but Sklik has no per-account id to link on — one per-user
 *  token, one `sklik` tenant — so its linkage to a project is an explicit boolean the
 *  owner flips here. Without it a multi-client workspace would file one client's
 *  Sklik spend under every other client's report. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { useProject } from "@/lib/projects/context";
import { projectDataSource } from "@/lib/project-data/source";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    dataSourceTitle: "Zdroj dat",
    dataSourceLive: "Projekt používá živá data z Google Ads.",
    dataSourceDemo: "Připojte účet Google Ads v modulu Kampaně pro živá data.",
    sklikLabel: "Načítat data ze Skliku do tohoto projektu",
    sklikHint:
      "Sklik se do projektu nenapojuje přes ID účtu — zapněte ho tady. Když běží obě sítě, report je sečte a rozpadne podle platformy.",
    sklikError: "Uložení se nezdařilo.",
  },
  en: {
    dataSourceTitle: "Data source",
    dataSourceLive: "This project uses live data from Google Ads.",
    dataSourceDemo: "Connect a Google Ads account in the Campaigns module for live data.",
    sklikLabel: "Pull Sklik data into this project",
    sklikHint:
      "Sklik has no account id to link on — switch it on here. With both networks running, the report sums them and breaks the mix down per platform.",
    sklikError: "Save failed.",
  },
} as const;

export default function ProjectDataSources({ live }: { live: boolean }) {
  const t = useT(T);
  const { locale } = useLocale();
  const project = useProject();
  const router = useRouter();
  const [linked, setLinked] = useState(project.sklikLinked === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ds = projectDataSource(live, locale);

  async function toggleSklik() {
    const next = !linked;
    setSaving(true);
    setError(null);
    setLinked(next); // optimistic — reverted below if the write is refused
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sklikLinked: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? t("sklikError"));
      }
      router.refresh(); // the sync fan-out + report resolver read this flag server-side
    } catch (err) {
      setLinked(!next);
      setError(err instanceof Error ? err.message : t("sklikError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card divide-y divide-line">
      <div className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-semibold text-navy-800">{t("dataSourceTitle")}</p>
          <p className="mt-0.5 text-xs text-muted">
            {ds.live ? t("dataSourceLive") : t("dataSourceDemo")}
          </p>
        </div>
        <Pill tone={ds.live ? "positive" : "neutral"}>{ds.label}</Pill>
      </div>

      <div className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-medium text-navy-800">{t("sklikLabel")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("sklikHint")}</p>
          {error && (
            <p className="mt-2 rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative" role="alert">
              {error}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={linked}
          aria-label={t("sklikLabel")}
          disabled={saving}
          onClick={toggleSklik}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-pill border transition-colors disabled:opacity-50 ${
            linked ? "border-brand-600 bg-brand-700" : "border-line bg-surface"
          }`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              linked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
