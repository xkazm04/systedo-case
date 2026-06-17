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
}

const DAYS_PAUSE = 7;
const DAYS_LOW = 21;

/** Per-product days-of-cover + a budget action, worst cover first. */
export function stockRows(products: Product[]): StockRow[] {
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
      return { product, daysOfCover, status, action };
    })
    .sort((a, b) => a.daysOfCover - b.daysOfCover);
}
