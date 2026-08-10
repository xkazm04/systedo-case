"use client";

/** The on-demand face of the resumable orphan sweep (/api/projects/orphans), which
 *  until now had no UI consumer anywhere in the app.
 *
 *  The route's contract, surfaced verbatim rather than reinterpreted: GET REPORTS and
 *  removes nothing ever; POST APPLIES and is idempotent (a second run finds nothing
 *  left). A candidate whose project turns out to still EXIST is reported `alive` and
 *  never touched — which is why the copy can promise that nothing live is deleted.
 *
 *  `autoOpen` skips straight to the apply button, for the one place that already
 *  knows the answer to "is there anything to clean?": right after a delete whose
 *  cascade left stores behind. */

import { useState } from "react";
import { summarizeOrphanReport, type OrphanSummary } from "@/lib/projects/settings-actions";
import { useT } from "@/lib/i18n/client";
import type { TFn } from "@/lib/i18n/interpolate";

const T = {
  cs: {
    sweepTitle: "Dokončit úklid smazaných projektů",
    sweepHint: "Zkontroluje, jestli po dřívějším mazání nezůstala data bez projektu, a nabídne jejich dokončení. Nic živého se nesmaže — projekty, které existují, se jen ohlásí.",
    sweepCheck: "Zkontrolovat",
    sweepChecking: "Kontroluji…",
    sweepRun: "Dokončit úklid",
    sweepRunning: "Uklízím…",
    sweepClean: "Žádná osiřelá data. Vše je uklizené.",
    sweepFound: "Osiřelých projektů: {count}. Nedokončená úložiště: {stores}.",
    sweepDone: "Úklid dokončen. Nic dalšího nezbývá.",
    sweepPartial: "Část se nepodařilo dokončit ({stores}). Zkuste to prosím znovu později.",
    sweepFailed: "Kontrolu se nepodařilo spustit.",
  },
  en: {
    sweepTitle: "Finish cleaning up deleted projects",
    sweepHint: "Checks whether an earlier deletion left data behind without a project, and offers to finish it. Nothing live is removed — projects that still exist are only reported.",
    sweepCheck: "Check",
    sweepChecking: "Checking…",
    sweepRun: "Finish cleanup",
    sweepRunning: "Cleaning up…",
    sweepClean: "No orphaned data. Everything is clean.",
    sweepFound: "Orphaned projects: {count}. Unfinished stores: {stores}.",
    sweepDone: "Cleanup finished. Nothing left to do.",
    sweepPartial: "Part of it could not be finished ({stores}). Please try again later.",
    sweepFailed: "Couldn't run the check.",
  },
} as const;

export default function OrphanSweepPanel({ autoOpen = false }: { autoOpen?: boolean }) {
  const t = useT(T);
  const [busy, setBusy] = useState<"check" | "apply" | null>(null);
  const [summary, setSummary] = useState<OrphanSummary | null>(null);
  const [failed, setFailed] = useState(false);

  async function call(apply: boolean) {
    setBusy(apply ? "apply" : "check");
    setFailed(false);
    try {
      const res = await fetch("/api/projects/orphans", apply ? { method: "POST" } : undefined);
      if (!res.ok) throw new Error("sweep");
      setSummary(summarizeOrphanReport(await res.json()));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  const showApply = autoOpen || (summary !== null && summary.orphanCount > 0 && !summary.applied);

  return (
    <div className="mt-6 border-t border-line pt-5">
      <p className="text-sm font-semibold text-navy-800">{t("sweepTitle")}</p>
      <p className="mt-1 text-sm text-muted">{t("sweepHint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => call(false)}
          disabled={busy !== null}
          className="rounded-pill border border-line px-4 py-2 text-sm font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
        >
          {busy === "check" ? t("sweepChecking") : t("sweepCheck")}
        </button>
        {showApply && (
          <button
            type="button"
            onClick={() => call(true)}
            disabled={busy !== null}
            className="rounded-pill bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {busy === "apply" ? t("sweepRunning") : t("sweepRun")}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-negative">
          {t("sweepFailed")}
        </p>
      )}
      {summary && !failed && <SweepResult summary={summary} t={t} />}
    </div>
  );
}

function SweepResult({
  summary,
  t,
}: {
  summary: OrphanSummary;
  t: TFn<keyof (typeof T)["cs"]>;
}) {
  if (summary.orphanCount === 0) {
    return <p className="mt-3 text-sm text-positive">{t("sweepClean")}</p>;
  }
  if (!summary.applied) {
    return (
      <p className="mt-3 text-sm text-navy-700">
        {t("sweepFound", {
          count: String(summary.orphanCount),
          stores: summary.pending.join(", "),
        })}
      </p>
    );
  }
  return summary.stillFailing.length > 0 ? (
    <p role="alert" className="mt-3 text-sm text-negative">
      {t("sweepPartial", { stores: summary.stillFailing.join(", ") })}
    </p>
  ) : (
    <p className="mt-3 text-sm text-positive">{t("sweepDone")}</p>
  );
}
