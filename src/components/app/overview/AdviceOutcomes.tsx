/** WP W3-A — "Vyřešeno nedávno": the outcome chips under the Needs-attention list.
 *
 *  A recommendation whose signal has gone quiet for ADVICE_RESOLVE_AFTER_DAYS is
 *  resolved by the ledger, and — when it carried a real number, and was never
 *  sample-derived — scored on the move of that number between the first and last time
 *  it was shown. This section is where the operator sees that: the app's advice with
 *  a result attached, instead of a feed that only ever grows.
 *
 *  The chip look deliberately mirrors `DiagnosisTracking`'s `OutcomeChip` — the same
 *  three verdicts, the same tokens — because the two are the same claim about the same
 *  kind of thing, and the underlying maths is held in lockstep on purpose (see
 *  advice/ledger.ts). Renders NOTHING when there is nothing scored: an empty
 *  "Vyřešeno nedávno" heading would imply a measurement that was never taken.
 *  Server component. */
import { TrendDown, TrendUp } from "@/components/icons";
import type { AdviceOutcomeStatus, AdviceRecord } from "@/lib/advice/ledger";
import { getServerFormatters, getT } from "@/lib/i18n/server";

const T = {
  cs: {
    heading: "Vyřešeno nedávno",
    lead: "Rady, jejichž signál zmizel. Měřeno na vlastní metrice signálu.",
    improved: "Zlepšeno {delta}",
    unchanged: "Beze změny",
    worse: "Zhoršeno {delta}",
    seenSince: "Sledováno od {date}",
  },
  en: {
    heading: "Resolved recently",
    lead: "Advice whose signal went quiet. Measured on the signal's own metric.",
    improved: "Improved {delta}",
    unchanged: "Unchanged",
    worse: "Worse {delta}",
    seenSince: "Tracked since {date}",
  },
} as const;

const CHIP: Record<AdviceOutcomeStatus, string> = {
  improved: "bg-positive-soft text-positive",
  worse: "bg-coral-soft text-coral-600",
  unchanged: "bg-canvas text-muted",
};

export default async function AdviceOutcomes({ records }: { records: AdviceRecord[] }) {
  if (records.length === 0) return null;
  const t = await getT(T);
  const fmt = await getServerFormatters();

  return (
    <div className="mt-3 rounded-card border border-line bg-canvas px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {t("heading")}
      </p>
      <p className="mt-0.5 text-xs text-muted">{t("lead")}</p>
      <ul className="mt-2.5 space-y-2">
        {records.map((r) => {
          const outcome = r.outcome!;
          // A percentage is printed ONLY for a verdict that claims a direction, and
          // only when the ledger actually holds one — "unchanged" says so in words.
          const delta =
            outcome.deltaPct !== null && Number.isFinite(outcome.deltaPct)
              ? fmt.fmtSignedPct(outcome.deltaPct)
              : "";
          const label =
            outcome.status === "improved"
              ? t("improved", { delta })
              : outcome.status === "worse"
                ? t("worse", { delta })
                : t("unchanged");
          return (
            <li key={r.subjectKey} className="flex items-start justify-between gap-3">
              <span
                className="min-w-0 flex-1 truncate text-sm text-navy-800"
                title={t("seenSince", { date: fmt.fmtDate(r.firstSeenAt.slice(0, 10)) })}
              >
                {r.title}
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium ${CHIP[outcome.status]}`}
              >
                {outcome.status === "improved" && <TrendUp width={12} height={12} />}
                {outcome.status === "worse" && <TrendDown width={12} height={12} />}
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
