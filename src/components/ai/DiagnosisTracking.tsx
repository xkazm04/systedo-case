"use client";

/** Shared UI for the persistent-diagnosis lifecycle (Direction 1): the status bar +
 *  deep-link handoff rendered under the current diagnosis, and the capped history
 *  strip below the panel. Used by LtvDiagnosisPanel and LeadSourceDiagnosisPanel so
 *  both track a diagnosis identically. Presentational — the parent owns the
 *  persistence hook and passes the status callback + the handoff target. */
import Link from "next/link";
import { ArrowRight, Check, Clock, Refresh, Target, TrendUp, TrendDown } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { DiagnosisStatus, StoredDiagnosis } from "@/lib/diagnoses/types";
import type { OutcomeVerdict } from "@/lib/diagnoses/outcome";
import type { DiagnosisSaveErrorKind } from "@/components/ai/useDiagnosisPersistence";

const T = {
  cs: {
    statusNew: "Nová",
    statusAcknowledged: "Vzato na vědomí",
    statusResolved: "Vyřešeno",
    acknowledge: "Vzít na vědomí",
    resolve: "Označit vyřešené",
    reopen: "Znovu otevřít",
    savedAt: "Uloženo {when}",
    historyTitle: "Historie diagnóz",
    historyDesc: "Posledních {n} — přetrvává mezi návštěvami.",
    empty: "Zatím žádné uložené diagnózy.",
    fromDigest: "z týdenního souhrnu",
    stale: "Neaktuální — data se od uložení změnila",
    staleNudge: "Spusťte rozbor znovu pro aktuální čísla.",
    outcomeImproved: "Zlepšeno {delta}",
    outcomeUnchanged: "Beze změny",
    outcomeWorse: "Zhoršeno {delta}",
    alreadyResolved: "Již řešeno, beze změny — tato diagnóza už byla vyřešena a sledovaná metrika se od té doby nezměnila.",
  },
  en: {
    statusNew: "New",
    statusAcknowledged: "Acknowledged",
    statusResolved: "Resolved",
    acknowledge: "Acknowledge",
    resolve: "Mark resolved",
    reopen: "Reopen",
    savedAt: "Saved {when}",
    historyTitle: "Diagnosis history",
    historyDesc: "Last {n} — persists across visits.",
    empty: "No saved diagnoses yet.",
    fromDigest: "from the weekly digest",
    stale: "Out of date — the data changed since this was saved",
    staleNudge: "Re-run the analysis for current figures.",
    outcomeImproved: "Improved {delta}",
    outcomeUnchanged: "Unchanged",
    outcomeWorse: "Worse {delta}",
    alreadyResolved: "Already resolved, unchanged — this was resolved earlier and the tracked metric hasn't moved since.",
  },
} as const;

/** Direction 1 — the outcome chip. For a RESOLVED diagnosis whose subject still
 *  exists, the CURRENT key metric is re-derived and compared to the at-diagnosis
 *  snapshot: improved (with the signed delta) / unchanged / worse. This is what
 *  closes the loop — the operator sees whether the diagnosed problem actually moved,
 *  not just that a status was flipped. */
function OutcomeChip({ verdict }: { verdict: OutcomeVerdict }) {
  const t = useT(T);
  const fmt = useFormatters();
  const delta = fmt.fmtSignedPct(verdict.deltaPct);
  if (verdict.status === "improved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-positive-soft px-2 py-0.5 text-xs font-medium text-positive">
        <TrendUp width={12} height={12} />
        {t("outcomeImproved", { delta })}
      </span>
    );
  }
  if (verdict.status === "worse") {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-coral-soft px-2 py-0.5 text-xs font-medium text-coral-600">
        <TrendDown width={12} height={12} />
        {t("outcomeWorse", { delta })}
      </span>
    );
  }
  return (
    <span className="rounded-pill bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
      {t("outcomeUnchanged")}
    </span>
  );
}

/** Direction 1 — the "already handled" note. Shown after a fresh run whose subject
 *  matches a resolved diagnosis with an unchanged metric, so a re-diagnosis of an
 *  already-closed-and-unmoved subject is labelled honestly instead of read as news.
 *  Display-only — never blocks the run. */
export function DiagnosisAlreadyResolvedNote({ show }: { show: boolean }) {
  const t = useT(T);
  if (!show) return null;
  return (
    <div className="flex items-start gap-2 rounded-card border border-line bg-canvas px-3.5 py-2.5 text-xs text-muted">
      <Clock width={14} height={14} className="mt-0.5 shrink-0 text-muted" />
      <span className="leading-relaxed">{t("alreadyResolved")}</span>
    </div>
  );
}

/** Direction 2 — the stale marker. A stored diagnosis whose input digest no longer
 *  matches the current data digest (digestFreshness === "stale") is out of date; say
 *  so with a coral pill, mirroring the MonthlyReport / ReportView recap-stale badge. */
function StaleBadge({ t }: { t: (k: keyof (typeof T)["cs"]) => string }) {
  return (
    <span className="rounded-pill bg-coral-soft px-2 py-0.5 text-xs font-medium text-coral-600">
      {t("stale")}
    </span>
  );
}

/** Direction 1 — honest provenance label. When the diagnosis was computed from the
 *  illustrative sample (no live import), say so plainly instead of implying the
 *  numbers are the client's own. This is the click-path parity with the digest cron's
 *  honesty gate: the cron refuses to run over sample, the click path labels it. */
const SAMPLE_T = {
  cs: { note: "Ukázková data — diagnóza běží nad ilustrativním vzorkem, ne nad živým importem." },
  en: { note: "Sample data — the diagnosis ran on the illustrative sample, not a live import." },
} as const;

/** Direction 3 — a save / status write failed. The operator paid quota for this
 *  diagnosis; say the persistence didn't land (instead of swallowing it) and offer a
 *  one-tap retry + dismiss. Coral, mirroring the app's other inline failure notes. */
const SAVE_ERROR_T = {
  cs: {
    save: "Uložení diagnózy se nezdařilo — výsledek je zobrazen, ale nemusí přetrvat.",
    status: "Změnu stavu se nepodařilo uložit.",
    retry: "Zkusit znovu",
    dismiss: "Skrýt",
  },
  en: {
    save: "Saving the diagnosis failed — the result is shown but may not persist.",
    status: "Could not save the status change.",
    retry: "Try again",
    dismiss: "Dismiss",
  },
} as const;

export function DiagnosisSaveError({
  error,
  onRetry,
  onDismiss,
}: {
  error: DiagnosisSaveErrorKind;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const t = useT(SAVE_ERROR_T);
  if (!error) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-coral-400/30 bg-coral-soft px-4 py-3">
      <span className="min-w-0 flex-1 text-sm leading-relaxed text-coral-600">
        {error === "save" ? t("save") : t("status")}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-pill bg-onyx px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-onyx-soft"
      >
        <Refresh width={13} height={13} />
        {t("retry")}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs font-medium text-muted transition-colors hover:text-navy-700"
      >
        {t("dismiss")}
      </button>
    </div>
  );
}

export function DiagnosisSampleNote({ sample }: { sample: boolean }) {
  const t = useT(SAMPLE_T);
  if (!sample) return null;
  return (
    <div className="flex items-start gap-2 rounded-card border border-line bg-canvas px-3.5 py-2.5 text-xs text-muted">
      <Target width={14} height={14} className="mt-0.5 shrink-0 text-brand-600" />
      <span className="leading-relaxed">{t("note")}</span>
    </div>
  );
}

const STATUS_TONE: Record<DiagnosisStatus, PillTone> = {
  new: "brand",
  acknowledged: "neutral",
  resolved: "positive",
};

function statusLabel(t: (k: keyof (typeof T)["cs"]) => string, s: DiagnosisStatus): string {
  return s === "new" ? t("statusNew") : s === "acknowledged" ? t("statusAcknowledged") : t("statusResolved");
}

export interface DiagnosisHandoff {
  href: string;
  label: string;
}

/** The status lifecycle control + the deep-link handoff, rendered under the shown
 *  diagnosis. `new → acknowledged → resolved`, with a reopen from resolved. */
export function DiagnosisActions({
  diagnosis,
  onStatus,
  handoff,
  stale = false,
  outcome = null,
}: {
  diagnosis: StoredDiagnosis;
  onStatus: (id: string, status: DiagnosisStatus) => void;
  handoff: DiagnosisHandoff;
  /** Direction 2: the diagnosis is out of date vs the current data → badge + nudge */
  stale?: boolean;
  /** Direction 1: the outcome verdict for a resolved diagnosis (null → no chip) */
  outcome?: OutcomeVerdict | null;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { id, status } = diagnosis;

  const nextButton =
    status === "new" ? (
      <StatusButton onClick={() => onStatus(id, "acknowledged")} icon={<Check width={13} height={13} />}>
        {t("acknowledge")}
      </StatusButton>
    ) : status === "acknowledged" ? (
      <StatusButton onClick={() => onStatus(id, "resolved")} icon={<Check width={13} height={13} />}>
        {t("resolve")}
      </StatusButton>
    ) : (
      <StatusButton onClick={() => onStatus(id, "new")} icon={<Refresh width={13} height={13} />}>
        {t("reopen")}
      </StatusButton>
    );

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <Pill tone={STATUS_TONE[status]}>{statusLabel(t, status)}</Pill>
      {outcome && <OutcomeChip verdict={outcome} />}
      {stale && <StaleBadge t={t} />}
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <Clock width={12} height={12} />
        {t("savedAt", { when: fmt.fmtRelative(diagnosis.createdAt) })}
        {diagnosis.origin === "digest" ? ` · ${t("fromDigest")}` : ""}
      </span>
      {stale && <span className="w-full text-xs text-coral-600">{t("staleNudge")}</span>}
      <span className="ml-auto flex items-center gap-2">
        {nextButton}
        <Link
          href={handoff.href}
          className="inline-flex items-center gap-1.5 rounded-pill bg-onyx px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-onyx-soft"
        >
          {handoff.label}
          <ArrowRight width={13} height={13} />
        </Link>
      </span>
    </div>
  );
}

function StatusButton({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-canvas px-3.5 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
    >
      {icon}
      {children}
    </button>
  );
}

/** The capped history strip below the panel: each saved diagnosis's subject,
 *  status and time, with the same status control per row. */
export function DiagnosisHistory({
  items,
  onStatus,
  isStale,
  outcomeOf,
}: {
  items: StoredDiagnosis[];
  onStatus: (id: string, status: DiagnosisStatus) => void;
  /** Direction 2: per-row staleness verdict against the current data digest */
  isStale?: (d: StoredDiagnosis) => boolean;
  /** Direction 1: per-row outcome verdict (resolved rows only; null → no chip) */
  outcomeOf?: (d: StoredDiagnosis) => OutcomeVerdict | null;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  if (items.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3.5">
        <p className="text-sm font-semibold text-navy-800">{t("historyTitle")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("historyDesc", { n: items.length })}</p>
      </div>
      <ul className="divide-y divide-line/70">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
            <Pill tone={STATUS_TONE[it.status]}>{statusLabel(t, it.status)}</Pill>
            {(() => {
              const v = outcomeOf?.(it) ?? null;
              return v ? <OutcomeChip verdict={v} /> : null;
            })()}
            {isStale?.(it) && <StaleBadge t={t} />}
            <span className="min-w-0 flex-1 truncate text-sm text-navy-700">{it.subject}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock width={12} height={12} />
              {fmt.fmtRelative(it.createdAt)}
            </span>
            {it.status !== "resolved" && (
              <button
                type="button"
                onClick={() => onStatus(it.id, it.status === "new" ? "acknowledged" : "resolved")}
                className="text-xs font-medium text-brand-accent transition-colors hover:underline"
              >
                {it.status === "new" ? t("acknowledge") : t("resolve")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
