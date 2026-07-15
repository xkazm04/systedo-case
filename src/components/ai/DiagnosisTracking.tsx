"use client";

/** Shared UI for the persistent-diagnosis lifecycle (Direction 1): the status bar +
 *  deep-link handoff rendered under the current diagnosis, and the capped history
 *  strip below the panel. Used by LtvDiagnosisPanel and LeadSourceDiagnosisPanel so
 *  both track a diagnosis identically. Presentational — the parent owns the
 *  persistence hook and passes the status callback + the handoff target. */
import Link from "next/link";
import { ArrowRight, Check, Clock, Refresh, Target } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { DiagnosisStatus, StoredDiagnosis } from "@/lib/diagnoses/types";

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
  },
} as const;

/** Direction 1 — honest provenance label. When the diagnosis was computed from the
 *  illustrative sample (no live import), say so plainly instead of implying the
 *  numbers are the client's own. This is the click-path parity with the digest cron's
 *  honesty gate: the cron refuses to run over sample, the click path labels it. */
const SAMPLE_T = {
  cs: { note: "Ukázková data — diagnóza běží nad ilustrativním vzorkem, ne nad živým importem." },
  en: { note: "Sample data — the diagnosis ran on the illustrative sample, not a live import." },
} as const;

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
}: {
  diagnosis: StoredDiagnosis;
  onStatus: (id: string, status: DiagnosisStatus) => void;
  handoff: DiagnosisHandoff;
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
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <Clock width={12} height={12} />
        {t("savedAt", { when: fmt.fmtRelative(diagnosis.createdAt) })}
        {diagnosis.origin === "digest" ? ` · ${t("fromDigest")}` : ""}
      </span>
      <span className="ml-auto flex items-center gap-2">
        {nextButton}
        <Link
          href={handoff.href}
          className="inline-flex items-center gap-1.5 rounded-pill bg-onyx px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-800"
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
}: {
  items: StoredDiagnosis[];
  onStatus: (id: string, status: DiagnosisStatus) => void;
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
