/** WP W3-A ↔ W2-E join. The control plane already measures what an APPLIED
 *  change-set actually did (`ChangeSet.realized`, written once by the post-sync
 *  realization pass). This module maps that measurement into the same digest row
 *  shape the advice ledger produces, so the operator reads one "did our advice work"
 *  list instead of two half-lists in different places — plus the recap's grounding
 *  sentence for the same rows.
 *
 *  STRICTLY READ-ONLY. Nothing here recomputes a realization, re-opens a window or
 *  touches `realize*.ts` / `calibration.ts` — if the control plane has not written a
 *  `measured` realization, this module has nothing to say and says nothing. Pure. */
import { createFormatters, type SupportedLocale } from "@/lib/format";
import type { ChangeSet } from "@/lib/campaigns/control-plane-types";
import type { AdviceDigestRow } from "./digest";

const DAY_MS = 86_400_000;

/** The realized change-sets worth reporting: applied, `measured`, computed within
 *  `days`, newest first.
 *
 *  Only `status: "measured"` qualifies. An `insufficient` realization means the stored
 *  series did not cover enough of one window — the control plane's own honest verdict
 *  — and a row saying "beze změny" over it would launder "we could not measure" into
 *  "nothing happened". */
function measuredSets(sets: readonly ChangeSet[], now: Date, days: number, limit: number): ChangeSet[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return sets
    .filter((s) => s.status === "applied" && s.realized?.status === "measured")
    .filter((s) => {
      const at = Date.parse(s.realized!.computedAt);
      return Number.isFinite(at) && at >= cutoff;
    })
    .sort((a, b) => b.realized!.computedAt.localeCompare(a.realized!.computedAt))
    .slice(0, limit);
}

/** Realized change-sets as digest rows.
 *
 *  The verdict reads the REALIZED value delta (what the touched campaigns actually
 *  did), while the reported percentage reads `ratio` (how that landed against the
 *  projection the operator approved). Those are two different questions and the row
 *  keeps them apart: the koruna numbers are in the title, the ratio is the delta. */
export function changeSetOutcomeRows(
  sets: readonly ChangeSet[],
  now: Date,
  locale: SupportedLocale = "cs",
  days = 7,
  limit = 3
): AdviceDigestRow[] {
  const f = createFormatters(locale);
  return measuredSets(sets, now, days, limit).map((s) => {
    const r = s.realized!;
    const measured = r.ratio !== null && Number.isFinite(r.ratio);
    return {
      title:
        locale === "en"
          ? `Budget change ${f.fmtSignedCZK(r.realizedValueDelta)} vs. projected ${f.fmtSignedCZK(r.projectedValueGain)}`
          : `Změna rozpočtu ${f.fmtSignedCZK(r.realizedValueDelta)} vs. projekce ${f.fmtSignedCZK(r.projectedValueGain)}`,
      status:
        r.realizedValueDelta > 0 ? "improved" : r.realizedValueDelta < 0 ? "worse" : "unchanged",
      // `ratio` is null when the projection was ≤ 0 — there is nothing to divide by,
      // so the row carries no percentage rather than an invented one.
      deltaPct: measured ? r.ratio! - 1 : null,
      ...(measured ? { metricKey: locale === "en" ? "vs. projected" : "vs. projekce" } : {}),
    } satisfies AdviceDigestRow;
  });
}

/** The recap's grounding sentence for realized change-sets. "" when nothing has been
 *  measured — the common case, and byte-identical to the pre-W3-A prompt. */
export function changeSetOutcomesGroundingText(
  sets: readonly ChangeSet[],
  locale: SupportedLocale,
  now: Date,
  days = 30
): string {
  const f = createFormatters(locale);
  const rows = measuredSets(sets, now, days, 4);
  if (rows.length === 0) return "";
  const items = rows
    .map((s) => {
      const r = s.realized!;
      return locale === "en"
        ? `applied budget change: realized ${f.fmtSignedCZK(r.realizedValueDelta)} against a projected ${f.fmtSignedCZK(r.projectedValueGain)}`
        : `provedená změna rozpočtu: reálně ${f.fmtSignedCZK(r.realizedValueDelta)} oproti projekci ${f.fmtSignedCZK(r.projectedValueGain)}`;
    })
    .join("; ");
  return locale === "en"
    ? `Measured outcomes of budget changes actually applied: ${items}. Measured on the stored campaign series 7 days after vs. 7 days before each change.`
    : `Změřené výsledky skutečně provedených změn rozpočtu: ${items}. Měřeno na uložených řadách kampaní 7 dní po vs. 7 dní před každou změnou.`;
}
