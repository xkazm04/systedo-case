/** Direction 3 — the money unit proves itself. A PURE, fixture-testable verdict on
 *  whether a Sklik stats sample looks like it is reported in native CZK or in haléře
 *  (1/100 CZK). Dependency-free (no fetch, no server-only, no store) so the whole
 *  decision runs offline over fixtures; a live sync merely feeds it the freshly
 *  mapped campaigns.
 *
 *  WHY costs-vs-budget: a Sklik `dayBudget` is a CZK cap the advertiser sets, so it
 *  is a TRUSTED CZK reference. A campaign's average daily SPEND rarely exceeds its
 *  daily budget by more than a small factor (Google/Sklik overdeliver a little, ~2×
 *  at the extreme). If stats `money` were actually haléře but treated as CZK, the
 *  spend would read ~100× the budget — wildly implausible. So the spend/budget ratio
 *  is the discriminator, and the budget stays native CZK (never haléře-scaled) so the
 *  ratio can move. The verdict NEVER converts anything — it only classifies. */

/** The three possible verdicts a live sync records on the connection / sync meta. */
export type SklikMoneyVerdict = "czk-plausible" | "halere-suspected" | "insufficient-data";

/** Median spend/budget ratio at or above which haléře is suspected. 20 sits far above
 *  any plausible overdelivery (a campaign spending 20× its daily budget every day is
 *  not real) yet far below the ~100× a haléře-as-CZK misread produces, so the band is
 *  unambiguous. Deterministic + documented. */
export const HALERE_SUSPECT_RATIO = 20;

/** Minimum campaigns with BOTH a positive daily budget and positive spend needed to
 *  form a verdict — below this the sample can't support a confident call. */
export const MIN_EVALUABLE_CAMPAIGNS = 1;

/** Median of a non-empty numeric list (deterministic: sorts a copy, averages the two
 *  middle values on an even count). */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Classify a Sklik stats sample's money unit from costs-vs-budget magnitudes.
 *
 * `campaigns` are the freshly-mapped Campaign rows (cost = period total spend in the
 * unit currently applied; budgetPerDay = native CZK daily budget). `days` is the
 * period length. Evaluable rows have a positive budget AND positive spend; the
 * verdict is the MEDIAN of their (dailySpend / dailyBudget) ratios:
 *
 *   - < {@link MIN_EVALUABLE_CAMPAIGNS} evaluable rows → "insufficient-data";
 *   - median ratio ≥ {@link HALERE_SUSPECT_RATIO}       → "halere-suspected";
 *   - otherwise                                         → "czk-plausible".
 *
 * Note the natural quiescence: once the haléře conversion is CONFIRMED (spend already
 * ÷100), the ratio falls back into the plausible band → "czk-plausible", so a
 * confirmed account never re-alarms.
 */
export function classifySklikMoneyUnit(
  campaigns: readonly { cost: number; budgetPerDay?: number }[],
  days: number
): SklikMoneyVerdict {
  if (days <= 0) return "insufficient-data";
  const ratios = campaigns
    .filter((c) => (c.budgetPerDay ?? 0) > 0 && c.cost > 0)
    .map((c) => c.cost / days / (c.budgetPerDay as number));
  if (ratios.length < MIN_EVALUABLE_CAMPAIGNS) return "insufficient-data";
  return median(ratios) >= HALERE_SUSPECT_RATIO ? "halere-suspected" : "czk-plausible";
}
