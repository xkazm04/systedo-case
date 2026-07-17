/** The one place the profit primitives live. `grossProfit = revenue × margin`,
 *  overhead proration, fulfilment cost, net profit and the break-even ROAS were
 *  each re-implemented independently across the cost-model report engine
 *  (`cost-model/compute`) and the per-channel profit engine (`profit/compute`,
 *  `profit/trend`, `profit/overhead`). One drifting copy = the "profitable"
 *  verdict silently disagreeing between the report and the /zisk module. These are
 *  the shared primitives BOTH engines call, so the formula can only ever change in
 *  one place. Framework-free, zero imports, numbers in → numbers out.
 *
 *  THE SEAM — what deliberately DIFFERS between the two engines, and stays theirs:
 *   - MARGIN basis: the report applies ONE blended `grossMarginPct` to the whole
 *     revenue; the /zisk engine applies a PER-CHANNEL margin to each channel's
 *     revenue and blends after. Both call `grossProfit(revenue, margin)` — the
 *     primitive is margin-agnostic; which margin is the caller's decision.
 *   - OVERHEAD incidence: `overheadForPeriod` returns the PORTFOLIO overhead for a
 *     window. The report charges the whole figure against blended net profit (one
 *     P&L); `profit/overhead` splits that same figure across channels by revenue
 *     share before charging each. Same total, different allocation — the split is
 *     the caller's, not this module's. */

/** Gross profit = revenue × gross-margin fraction. */
export function grossProfit(revenue: number, marginPct: number): number {
  return revenue * marginPct;
}

/** Fixed monthly overhead prorated to a window of `months`. Negative/non-finite
 *  inputs collapse to 0 so a disabled/blank model degrades to the pre-overhead
 *  view rather than producing a negative overhead. */
export function overheadForPeriod(monthlyOverhead: number, months: number): number {
  const o = monthlyOverhead > 0 ? monthlyOverhead : 0;
  const m = months > 0 ? months : 0;
  return o * m;
}

/** Fractional months a span of `days` covers, for overhead proration. This is the
 *  general day→month helper the live /zisk module uses for arbitrary day counts;
 *  the fixed analysis windows use the rounded `PERIOD_MONTHS` map instead
 *  (30d→1, 90d→3, 12m→12), which is intentionally the tidy sibling of `days/30`. */
export function monthsForDays(days: number): number {
  return days / 30;
}

/** Variable fulfilment cost = per-order cost × order count. Negative per-order
 *  cost collapses to 0 (same degrade-to-zero rule as overhead). */
export function fulfilment(perOrderCost: number, orders: number): number {
  const c = perOrderCost > 0 ? perOrderCost : 0;
  return c * orders;
}

/** Net profit = gross profit − ad spend − overhead − fulfilment. The per-channel
 *  engine passes overhead = fulfilment = 0 (it layers those separately in the
 *  contribution view); the report passes all four. */
export function netProfit(
  gross: number,
  adCost: number,
  overhead = 0,
  fulfil = 0
): number {
  return gross - adCost - overhead - fulfil;
}

/** The ROAS at which revenue × margin exactly covers ad spend — the GROSS
 *  break-even: `1 / margin`. Infinity for a non-positive margin (a channel with
 *  no margin never breaks even). This is the number that says a 42 %-margin
 *  channel breaks even at ~2.4×, not the margin-blind portfolio target.
 *  NOTE: callers that serialize this across a JSON boundary must map the non-finite
 *  (Infinity) case to `undefined`/omit it — `JSON.stringify(Infinity)` is `null`,
 *  which violates a `number`-typed field (see deriveBreakEven). */
export function breakEvenRoas(marginPct: number): number {
  return marginPct > 0 ? 1 / marginPct : Infinity;
}

/** The GROSS break-even PNO (cost share of revenue) = margin, since at break-even
 *  ad spend equals gross profit so cost/revenue = margin (= 1 / breakEvenRoas).
 *  Infinity for a non-positive margin (never breaks even). */
export function breakEvenPno(marginPct: number): number {
  return marginPct > 0 ? marginPct : Infinity;
}

/** The break-even ROAS once fixed overhead + fulfilment are loaded on top of ad
 *  spend: the channel/account must cover ad spend AND its share of overhead out of
 *  its margin. `revenue × margin = adCost + overhead + fulfilment`, solved for
 *  ROAS = revenue / adCost holding ad spend fixed. Infinity when there is no
 *  margin or no ad spend to divide by. */
export function loadedBreakEvenRoas(
  marginPct: number,
  adCost: number,
  overhead: number,
  fulfil: number
): number {
  const loadedCost = adCost + overhead + fulfil;
  return marginPct > 0 && adCost > 0 ? loadedCost / (adCost * marginPct) : Infinity;
}
