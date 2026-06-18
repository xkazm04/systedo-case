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

export type StockStatus = "ok" | "low" | "pause";

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
}

const DAYS_PAUSE = 7;
const DAYS_LOW = 21;
/** Days-of-cover below which a SKU is flagged "at risk soon" (early warning). */
export const AT_RISK_DAYS = 14;

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

/** Per-product days-of-cover + a budget action, worst cover first. `now` is the
 *  reference date for the projected stockout (defaults to the current instant —
 *  always pass a server-derived date from a client render to stay deterministic). */
export function stockRows(products: Product[], now: Date = new Date()): StockRow[] {
  return products
    .map((product) => {
      const daysOfCover = product.dailyVelocity > 0 ? product.stock / product.dailyVelocity : Infinity;
      const status: StockStatus = daysOfCover < DAYS_PAUSE ? "pause" : daysOfCover < DAYS_LOW ? "low" : "ok";
      const action =
        status === "pause"
          ? "Pozastavit reklamu — sklad dojde do týdne"
          : status === "low"
            ? "Snížit rozpočet — nízká zásoba"
            : "Jet naplno — zásoba v pořádku";
      const { stockoutDays, stockoutAt, atRisk } = projectStockout(daysOfCover, now);
      return { product, daysOfCover, status, action, stockoutDays, stockoutAt, atRisk };
    })
    .sort((a, b) => a.daysOfCover - b.daysOfCover);
}
