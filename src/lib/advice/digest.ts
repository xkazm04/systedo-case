/** WP W3-A — the weekly digest's "Výsledky rad" section. Pure: rows in,
 *  `{ alertBody, html }` out, exactly like `renderDiagnosis` in the digest route, so
 *  the route change stays ten lines.
 *
 *  Czech-only by design: the whole digest email is (see the route's hardcoded "cs").
 *
 *  THE SECTION IDIOM: no rows → `""`, and the route concatenates `""` into the email
 *  body harmlessly. Silence is the honest output — a "Výsledky rad" heading over an
 *  empty list would tell the operator the app measured something when it measured
 *  nothing. Sample-derived advice can never reach here: it carries no outcome at all
 *  (ledger.ts), and `adviceOutcomeRows` filters on the outcome's presence. */
import { escapeHtml } from "@/lib/html";
import { fmtSignedPct } from "@/lib/format";
import { recentAdviceOutcomes, type AdviceLedger, type AdviceOutcomeStatus } from "./ledger";

/** One row of the section — minted from a resolved advice record OR from a realized
 *  change-set (./changesets), so both close-the-loop sources render identically. */
export interface AdviceDigestRow {
  /** the whole label, already prefixed by its source ("Rada „…"", "Změna rozpočtu …") */
  title: string;
  status: AdviceOutcomeStatus;
  /** signed relative move of the tracked metric; null when there is no percentage */
  deltaPct: number | null;
  /** the metric's registered key, named so the number is never anonymous */
  metricKey?: string;
}

const VERDICT: Record<AdviceOutcomeStatus, string> = {
  improved: "zlepšeno",
  unchanged: "beze změny",
  worse: "zhoršeno",
};

/** Resolved-with-outcome advice from the last `days` days, as digest rows. */
export function adviceOutcomeRows(
  ledger: AdviceLedger | null | undefined,
  now: Date,
  days = 7,
  limit = 5
): AdviceDigestRow[] {
  return recentAdviceOutcomes(ledger, now, days, limit).map((r) => ({
    title: `Rada „${r.title}“`,
    status: r.outcome!.status,
    deltaPct: r.outcome!.deltaPct,
    ...(r.snapshot ? { metricKey: r.snapshot.key } : {}),
  }));
}

/** One row as plain text — the alert body's unit, and the text inside the <li>. */
export function adviceRowLine(row: AdviceDigestRow): string {
  const measured =
    row.metricKey && row.deltaPct !== null && Number.isFinite(row.deltaPct)
      ? ` (${row.metricKey} ${fmtSignedPct(row.deltaPct)})`
      : "";
  return `${row.title} — ${VERDICT[row.status]}${measured}`;
}

/** The digest section. `{ alertBody: "", html: "" }` when there is nothing measured. */
export function renderAdviceOutcomes(rows: AdviceDigestRow[]): { alertBody: string; html: string } {
  if (rows.length === 0) return { alertBody: "", html: "" };
  const items = rows
    .map((r) => {
      const measured =
        r.metricKey && r.deltaPct !== null && Number.isFinite(r.deltaPct)
          ? ` (${escapeHtml(r.metricKey)} ${escapeHtml(fmtSignedPct(r.deltaPct))})`
          : "";
      return `<li style="margin:6px 0"><strong>${escapeHtml(r.title)}:</strong> ${VERDICT[r.status]}${measured}</li>`;
    })
    .join("");
  return {
    alertBody: rows.map(adviceRowLine).join(" · "),
    html: `<p style="margin-top:16px"><strong>Výsledky rad</strong></p><ul>${items}</ul>`,
  };
}
