/** Seasonality + stock pacing math. Monthly seasonality indexes the daily series
 *  by calendar month; stock pacing turns velocity + on-hand into days-of-cover and
 *  a budget action (run / trim / pause). Pure. Real-integration seam: stock from
 *  the inventory feed, budget actions via the Ads control-plane (mutations). */
import type { DailyPoint } from "@/lib/types";
import type { Product } from "@/lib/catalog/sample";

const MONTHS_CS = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

export interface SeasonMonth {
  month: number;
  label: string;
  /** average daily revenue in this calendar month ÷ overall average (1 = typical) */
  index: number;
}

/** Index each calendar month by its average daily revenue vs the overall mean. */
export function monthlySeasonality(daily: DailyPoint[]): SeasonMonth[] {
  const sum = new Array(12).fill(0);
  const count = new Array(12).fill(0);
  for (const p of daily) {
    const m = new Date(`${p.date}T00:00:00Z`).getUTCMonth();
    sum[m] += p.revenue;
    count[m] += 1;
  }
  const avgPerDay = sum.map((s, i) => (count[i] > 0 ? s / count[i] : 0));
  const present = avgPerDay.filter((a) => a > 0);
  const overall = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : 0;
  return avgPerDay.map((a, i) => ({ month: i, label: MONTHS_CS[i]!, index: overall > 0 ? a / overall : 0 }));
}

/** `resuming` = crossed into pause but a restock lands within the planning
 *  horizon, so the recommendation is "pause then resume on {date}" rather than a
 *  hard, open-ended stop. */
export type StockStatus = "ok" | "low" | "pause" | "resuming";

export interface StockRow {
  product: Product;
  /** stock ÷ daily velocity */
  daysOfCover: number;
  status: StockStatus;
  action: string;
  /** projected stockout horizon in whole days (= rounded daysOfCover; Infinity = never) */
  stockoutDays: number;
  /** projected stockout date as ISO (YYYY-MM-DD), or null when cover is infinite */
  stockoutAt: string | null;
  /** trending toward stockout (< AT_RISK_DAYS) but not yet a hard pause — early warning */
  atRisk: boolean;
  /** scheduled restock date (ISO) that lands within the horizon, else null */
  resumeAt: string | null;
  /** gross margin fraction for this SKU (0–1) — illustrative profit weighting */
  margin: number;
  /** daysOfCover × margin × dailyVelocity — the margin-weighted value still on the
   *  shelf; the bigger it is, the more profit a stockout puts at risk */
  coverValue: number;
}

const DAYS_PAUSE = 7;
const DAYS_LOW = 21;
/** Days-of-cover below which a SKU is flagged "at risk soon" (early warning). */
export const AT_RISK_DAYS = 14;
/** Horizon (days) within which a scheduled restock turns a `pause` into `resuming`. */
export const RESTOCK_HORIZON_DAYS = 45;

/** Illustrative gross-margin fractions by product category (mirrors the profit
 *  module's margin idea without importing it — keeps inventory self-contained).
 *  Real-integration seam: source per-SKU margin from the merchant/cost feed. */
const CATEGORY_MARGIN: Record<string, number> = {
  Kočárky: 0.22,
  Autosedačky: 0.28,
  Židličky: 0.34,
  Postýlky: 0.3,
  Chůvičky: 0.42,
  Nosítka: 0.48,
};
/** Fallback margin for categories not in the table above. */
const DEFAULT_MARGIN = 0.3;

/** Gross-margin fraction for a product — its own `margin` if set, else by category. */
export function marginOf(product: Product): number {
  if (typeof product.margin === "number" && Number.isFinite(product.margin)) {
    return product.margin;
  }
  return CATEGORY_MARGIN[product.category] ?? DEFAULT_MARGIN;
}

/** Projected stockout from a point-in-time days-of-cover and a reference date.
 *  Pure & deterministic: the caller supplies `now` (server-derived) so the same
 *  inputs always yield the same projected date — no `Date.now()` at call time. */
export function projectStockout(
  daysOfCover: number,
  now: Date
): { stockoutDays: number; stockoutAt: string | null; atRisk: boolean } {
  if (!Number.isFinite(daysOfCover)) {
    return { stockoutDays: Infinity, stockoutAt: null, atRisk: false };
  }
  const stockoutDays = Math.round(daysOfCover);
  const at = new Date(now.getTime());
  at.setUTCDate(at.getUTCDate() + stockoutDays);
  const stockoutAt = at.toISOString().slice(0, 10);
  const atRisk = daysOfCover >= DAYS_PAUSE && daysOfCover < AT_RISK_DAYS;
  return { stockoutDays, stockoutAt, atRisk };
}

/** Whole days from `now` to `restockDate`, or null when the date is missing /
 *  unparseable / already in the past. */
function daysUntil(restockDate: string | undefined, now: Date): number | null {
  if (!restockDate) return null;
  const at = new Date(`${restockDate}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  const diff = Math.round((at.getTime() - now.getTime()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

/** Per-product days-of-cover + a budget action, worst cover first. `now` is the
 *  reference date for the projected stockout (defaults to the current instant —
 *  always pass a server-derived date from a client render to stay deterministic). */
export function stockRows(products: Product[], now: Date = new Date()): StockRow[] {
  return products
    .map((product) => {
      const daysOfCover = product.dailyVelocity > 0 ? product.stock / product.dailyVelocity : Infinity;
      const baseStatus: StockStatus = daysOfCover < DAYS_PAUSE ? "pause" : daysOfCover < DAYS_LOW ? "low" : "ok";

      // Restock-aware ramp: a pause with a scheduled restock inside the horizon
      // becomes `resuming` ("pause until {date} → resume"), not an open-ended stop.
      const restockIn = daysUntil(product.restockDate, now);
      const hasIncoming = (product.incomingQty ?? 0) > 0;
      const resumes = baseStatus === "pause" && hasIncoming && restockIn !== null && restockIn <= RESTOCK_HORIZON_DAYS;
      const status: StockStatus = resumes ? "resuming" : baseStatus;
      const resumeAt = resumes ? product.restockDate! : null;

      const action =
        status === "resuming"
          ? `Pauza do ${product.restockDate} → obnovit po doskladnění`
          : status === "pause"
            ? "Pozastavit reklamu — sklad dojde do týdne"
            : status === "low"
              ? "Snížit rozpočet — nízká zásoba"
              : "Jet naplno — zásoba v pořádku";

      const { stockoutDays, stockoutAt, atRisk } = projectStockout(daysOfCover, now);

      const margin = marginOf(product);
      const coverValue =
        Number.isFinite(daysOfCover) && product.dailyVelocity > 0
          ? daysOfCover * margin * product.dailyVelocity
          : 0;

      return { product, daysOfCover, status, action, stockoutDays, stockoutAt, atRisk, resumeAt, margin, coverValue };
    })
    .sort((a, b) => a.daysOfCover - b.daysOfCover);
}

// ---------------------------------------------------------------------------
// #3 Seasonality-scaled budget plan
// ---------------------------------------------------------------------------

export interface BudgetPlanMonth {
  month: number;
  label: string;
  /** seasonality index for the month (1 = typical) */
  index: number;
  /** baseline × index, then capped by aggregate days-of-cover for upcoming months */
  plannedBudget: number;
  /** plannedBudget − flatBudget (signed) */
  deltaVsFlat: number;
  /** seasonally the highest-index month */
  isPeak: boolean;
  /** an upcoming month whose planned budget was trimmed because aggregate cover is thin */
  capped: boolean;
}

export interface SeasonalBudgetPlan {
  /** the flat 1/12 split each month would get without seasonality */
  flatBudget: number;
  rows: BudgetPlanMonth[];
  /** sum of plannedBudget across the 12 rows */
  totalPlanned: number;
  /** sum of flatBudget across the 12 rows (= baselineMonthlyBudget × 12) */
  totalFlat: number;
}

/** Build a 12-month budget plan that scales a flat monthly baseline by the
 *  seasonality index. Pure & deterministic.
 *
 *  Capping: when aggregate days-of-cover is thin you can't profitably spend the
 *  full seasonal uplift — there isn't stock to sell — so each *upcoming* month
 *  (relative to `currentMonth`, when supplied) is capped at the flat budget once
 *  the cumulative horizon runs past `daysOfCover`. Past months and the no-stock
 *  case are left at the raw seasonal figure.
 *
 *  @param baselineMonthlyBudget flat monthly spend (CZK)
 *  @param season               12 seasonality rows (see {@link monthlySeasonality})
 *  @param opts.daysOfCover     aggregate days of stock cover (Infinity / omit = no cap)
 *  @param opts.currentMonth    0–11; only months after it are eligible for capping
 */
export function seasonalBudgetPlan(
  baselineMonthlyBudget: number,
  season: SeasonMonth[],
  opts: { daysOfCover?: number; currentMonth?: number } = {}
): SeasonalBudgetPlan {
  const flatBudget = Math.max(0, baselineMonthlyBudget);
  const cover = opts.daysOfCover ?? Infinity;
  const currentMonth = opts.currentMonth;

  // Peak = the highest-index month (first wins on ties for stability).
  const peakMonth = season.reduce((best, m) => (m.index > best.index ? m : best), season[0]!).month;

  // How many whole upcoming months the current cover can sustain. Beyond that,
  // upcoming months are capped to the flat budget (don't overspend into thin air).
  const sustainableMonths = Number.isFinite(cover) ? Math.floor(cover / 30) : Infinity;

  const rows: BudgetPlanMonth[] = season.map((m) => {
    const raw = flatBudget * m.index;

    // Months ahead of "now" in calendar order (1 = next month, …).
    const monthsAhead = currentMonth === undefined ? null : (m.month - currentMonth + 12) % 12;
    const isUpcoming = monthsAhead !== null && monthsAhead >= 1;
    const beyondCover = isUpcoming && monthsAhead! > sustainableMonths;
    const capped = beyondCover && raw > flatBudget;
    const plannedBudget = capped ? flatBudget : raw;

    return {
      month: m.month,
      label: m.label,
      index: m.index,
      plannedBudget,
      deltaVsFlat: plannedBudget - flatBudget,
      isPeak: m.month === peakMonth,
      capped,
    };
  });

  const totalPlanned = rows.reduce((s, r) => s + r.plannedBudget, 0);
  return { flatBudget, rows, totalPlanned, totalFlat: flatBudget * 12 };
}

// ---------------------------------------------------------------------------
// #1 Per-SKU budget change-set ("Navrhnout přesun rozpočtu")
// ---------------------------------------------------------------------------

export interface BudgetMove {
  /** SKU losing spend (a pause/low item) */
  fromSku: string;
  fromTitle: string;
  /** SKU gaining spend (an ok item, same category, ranked by velocity) */
  toSku: string;
  toTitle: string;
  category: string;
  /** CZK proposed to move from donor → recipient */
  amountCzk: number;
}

export interface BudgetChangeSet {
  moves: BudgetMove[];
  /** total CZK reallocated across all moves */
  totalShifted: number;
}

/** Per-SKU current ad spend used as the basis for the proposed shift. Illustrative:
 *  spend ≈ price × dailyVelocity (revenue run-rate) scaled by a notional ad ratio. */
const AD_SPEND_RATIO = 0.15;
function adSpendOf(product: Product): number {
  return product.price * product.dailyVelocity * AD_SPEND_RATIO;
}

/** Propose a per-SKU budget change-set: cut `shiftFraction` of each donor's spend
 *  (donors = pause/low/resuming SKUs that shouldn't keep burning budget) and route
 *  it to the best `ok` recipient in the *same category*, ranked by daily velocity.
 *
 *  PURE recommendation only — produces a proposal table, mutates nothing. A donor
 *  with no `ok` recipient in its category is skipped (nowhere safe to move spend).
 *
 *  @param shiftFraction 0–1 share of each donor's spend to reallocate (default 0.5)
 */
export function budgetChangeSet(rows: StockRow[], shiftFraction = 0.5): BudgetChangeSet {
  const frac = Math.min(1, Math.max(0, shiftFraction));

  // Best ok recipient per category = highest daily velocity (most able to absorb spend).
  const recipientByCategory = new Map<string, StockRow>();
  for (const r of rows) {
    if (r.status !== "ok") continue;
    const cur = recipientByCategory.get(r.product.category);
    if (!cur || r.product.dailyVelocity > cur.product.dailyVelocity) {
      recipientByCategory.set(r.product.category, r);
    }
  }

  const donorStatuses: StockStatus[] = ["pause", "resuming", "low"];
  const moves: BudgetMove[] = [];
  for (const donor of rows) {
    if (!donorStatuses.includes(donor.status)) continue;
    const recipient = recipientByCategory.get(donor.product.category);
    if (!recipient || recipient.product.sku === donor.product.sku) continue;
    const amountCzk = Math.round(adSpendOf(donor.product) * frac);
    if (amountCzk <= 0) continue;
    moves.push({
      fromSku: donor.product.sku,
      fromTitle: donor.product.title,
      toSku: recipient.product.sku,
      toTitle: recipient.product.title,
      category: donor.product.category,
      amountCzk,
    });
  }

  // Largest reallocation first.
  moves.sort((a, b) => b.amountCzk - a.amountCzk);
  return { moves, totalShifted: moves.reduce((s, m) => s + m.amountCzk, 0) };
}
