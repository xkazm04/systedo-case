"use client";

/** Direction 2: the monthly REVENUE goal editor on the report. Writes the project's
 *  real goal (over the illustrative sample) to the ownership-checked /goal
 *  sub-resource, appending to the change history via the shared idempotent primitive
 *  (a same-value save never grows the log). When no real goal is set the report's
 *  pacing/attainment run on the sample goal, labeled "ukázkový cíl" — this editor is
 *  how the tenant replaces it. DS primitives; cs/en. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Target } from "@/components/icons";
import { useT, useFormatters } from "@/lib/i18n/client";
import type { GoalChange } from "@/lib/metrics/goal-history";

const T = {
  cs: {
    heading: "Měsíční cíl obratu",
    sub: "Reálný cíl, proti kterému se poměřuje tempo a plnění. Bez něj report používá ukázkový cíl.",
    sampleBadge: "ukázkový cíl",
    realBadge: "reálný cíl",
    current: "Aktuální cíl",
    goalLabel: "Cíl (Kč / měsíc)",
    monthLabel: "Platí od měsíce",
    save: "Uložit cíl",
    saving: "Ukládám…",
    saved: "Uloženo",
    failed: "Cíl se nepodařilo uložit.",
    historyHeading: "Historie cíle",
    from: "od {month}",
  },
  en: {
    heading: "Monthly revenue goal",
    sub: "The real goal pacing + attainment are judged against. Without it the report uses a sample goal.",
    sampleBadge: "sample goal",
    realBadge: "real goal",
    current: "Current goal",
    goalLabel: "Goal (CZK / month)",
    monthLabel: "Effective from",
    save: "Save goal",
    saving: "Saving…",
    saved: "Saved",
    failed: "Could not save the goal.",
    historyHeading: "Goal history",
    from: "from {month}",
  },
} as const;

/** Current YYYY-MM (the default effective month for a new goal). */
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function GoalEditor({
  projectId,
  goal,
  sampleGoal,
  history: initialHistory,
}: {
  projectId: string;
  /** the goal in force now — the real one, or the sample fallback when none is set */
  goal: number;
  /** true when `goal` is the illustrative sample goal (no real goal saved yet) */
  sampleGoal: boolean;
  /** the saved change history (newest resolution via goalForMonth server-side) */
  history: GoalChange[];
}) {
  const t = useT(T);
  const { fmtCZK, fmtMonth } = useFormatters();
  const router = useRouter();
  const [value, setValue] = useState<string>(String(Math.round(goal)));
  const [month, setMonth] = useState<string>(currentMonth());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const g = Number(value);
    if (busy || !Number.isFinite(g) || g <= 0) return;
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: g, effectiveMonth: month }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setOk(true);
        router.refresh();
      } else {
        setErr(json.error || t("failed"));
      }
    } catch {
      setErr(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  // Newest-first for the small history list.
  const sortedHistory = [...initialHistory].sort((a, b) => (a.effectiveMonth < b.effectiveMonth ? 1 : -1));

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-accent">
            <Target width={15} height={15} />
          </span>
          <h3 className="text-base font-semibold text-navy-800">{t("heading")}</h3>
        </div>
        <span
          className={
            "rounded-pill px-2 py-0.5 text-xs font-medium " +
            (sampleGoal ? "bg-canvas text-muted" : "bg-positive-soft text-positive")
          }
        >
          {sampleGoal ? t("sampleBadge") : t("realBadge")}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted">{t("sub")}</p>

      <p className="mt-3 text-sm">
        <span className="text-muted">{t("current")}: </span>
        <span className="tnum font-semibold text-navy-800">{fmtCZK(goal)}</span>
      </p>

      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-2 print:hidden">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t("goalLabel")}</span>
          <input
            type="number"
            min={1}
            step={1000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="tnum rounded-pill border border-line bg-surface px-3 py-1.5 text-sm text-navy-800"
            style={{ width: 160 }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t("monthLabel")}</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-pill border border-line bg-surface px-3 py-1.5 text-sm text-navy-800"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !(Number(value) > 0)}
          className="inline-flex items-center gap-1.5 rounded-pill bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
        >
          {ok && !busy ? <Check width={14} height={14} /> : null}
          {busy ? t("saving") : ok ? t("saved") : t("save")}
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-negative">{err}</p>}

      {sortedHistory.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-semibold text-muted">{t("historyHeading")}</p>
          <ul className="mt-2 space-y-1">
            {sortedHistory.map((h) => (
              <li key={h.effectiveMonth} className="flex items-center gap-2 text-xs text-navy-700">
                <span className="tnum font-semibold text-navy-800">{fmtCZK(h.goal)}</span>
                <span className="text-muted">{t("from", { month: fmtMonth(`${h.effectiveMonth}-01`) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
