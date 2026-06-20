/** Deterministic sample campaigns for the Ads connector's keyless mode.
 *
 *  Same philosophy as `scripts/generate-data.mjs`: a seeded PRNG makes the output
 *  reproducible, and the per-campaign profiles are tuned so the advertising-channel
 *  types tell a believable story for the e-shop Mionelo (ořechy, semínka,
 *  superpotraviny) — brand Search is hyper-efficient, Performance Max carries the
 *  volume, while Video / Demand Gen prospecting runs below the target ROAS. That
 *  spread is what makes the per-type comparison and the AI evaluation interesting.
 *
 *  Metrics scale with the requested period, with small deterministic jitter, so a
 *  re-sync of the same period is stable but different periods differ realistically.
 */
import {
  CAMPAIGN_PERIOD_DAYS,
  type Campaign,
  type CampaignPeriod,
  type CampaignStatus,
  type CampaignType,
  type DailyPoint,
} from "./types";
import type { ProjectType } from "@/lib/projects/types";

// --- seeded PRNG (mulberry32), matching the seed script -----------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash → numeric seed (keeps each period reproducible-but-distinct)
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Spec {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  /** impressions per day */
  impr: number;
  /** click-through rate */
  ctr: number;
  /** average cost per click, CZK */
  cpc: number;
  /** conversion rate on clicks */
  convRate: number;
  /** average order value, CZK (→ conversion value) */
  aov: number;
}

// Daily base rates per campaign. Distinct profiles per type drive the spread.
// E-shop (Mionelo baby store) — the original portfolio, kept byte-for-byte.
const ESHOP_SPECS: Spec[] = [
  { id: "1001", name: "Search · Brand — Mionelo", type: "search", status: "enabled", impr: 900, ctr: 0.14, cpc: 4.5, convRate: 0.09, aov: 980 },
  { id: "1002", name: "Search · Ořechy a semínka", type: "search", status: "enabled", impr: 5200, ctr: 0.06, cpc: 9.5, convRate: 0.035, aov: 890 },
  { id: "1003", name: "Performance Max · Celý sortiment", type: "performance_max", status: "enabled", impr: 42000, ctr: 0.012, cpc: 6.0, convRate: 0.03, aov: 1020 },
  { id: "1004", name: "Shopping · Bestsellery", type: "shopping", status: "enabled", impr: 28000, ctr: 0.009, cpc: 5.0, convRate: 0.028, aov: 760 },
  { id: "1005", name: "Display · Remarketing", type: "display", status: "enabled", impr: 120000, ctr: 0.006, cpc: 2.2, convRate: 0.007, aov: 850 },
  { id: "1006", name: "Demand Gen · Akvizice", type: "demand_gen", status: "enabled", impr: 95000, ctr: 0.008, cpc: 3.2, convRate: 0.006, aov: 900 },
  { id: "1007", name: "Video · YouTube povědomí", type: "video", status: "paused", impr: 210000, ctr: 0.004, cpc: 1.1, convRate: 0.002, aov: 820 },
];

// SaaS / app — trials & signups; higher first-year value, lower conversion. No Shopping.
const APP_SPECS: Spec[] = [
  { id: "1001", name: "Search · Brand", type: "search", status: "enabled", impr: 1100, ctr: 0.16, cpc: 6.0, convRate: 0.07, aov: 4200 },
  { id: "1002", name: "Search · Kategorie („software/nástroj“)", type: "search", status: "enabled", impr: 6400, ctr: 0.05, cpc: 22.0, convRate: 0.022, aov: 3800 },
  { id: "1003", name: "Performance Max · Free trial", type: "performance_max", status: "enabled", impr: 38000, ctr: 0.011, cpc: 14.0, convRate: 0.018, aov: 4000 },
  { id: "1004", name: "Demand Gen · Akvizice trialů", type: "demand_gen", status: "enabled", impr: 110000, ctr: 0.007, cpc: 5.5, convRate: 0.004, aov: 3600 },
  { id: "1005", name: "Display · Remarketing (trial→plat)", type: "display", status: "enabled", impr: 140000, ctr: 0.005, cpc: 3.0, convRate: 0.005, aov: 4100 },
  { id: "1006", name: "Video · YouTube povědomí", type: "video", status: "paused", impr: 240000, ctr: 0.004, cpc: 1.4, convRate: 0.001, aov: 3500 },
];

// Lead-gen — high-intent local/service queries; value = qualified-lead value.
const LEADGEN_SPECS: Spec[] = [
  { id: "1001", name: "Search · Brand", type: "search", status: "enabled", impr: 800, ctr: 0.15, cpc: 7.0, convRate: 0.11, aov: 2600 },
  { id: "1002", name: "Search · Služba + lokalita", type: "search", status: "enabled", impr: 4800, ctr: 0.07, cpc: 28.0, convRate: 0.05, aov: 2400 },
  { id: "1003", name: "Performance Max · Leady", type: "performance_max", status: "enabled", impr: 26000, ctr: 0.013, cpc: 16.0, convRate: 0.03, aov: 2500 },
  { id: "1004", name: "Display · Remarketing", type: "display", status: "enabled", impr: 90000, ctr: 0.006, cpc: 2.6, convRate: 0.008, aov: 2300 },
  { id: "1005", name: "Demand Gen · Akvizice", type: "demand_gen", status: "enabled", impr: 80000, ctr: 0.008, cpc: 4.0, convRate: 0.005, aov: 2400 },
  { id: "1006", name: "Video · Povědomí v regionu", type: "video", status: "paused", impr: 160000, ctr: 0.004, cpc: 1.2, convRate: 0.002, aov: 2200 },
];

// Content / media — audience growth; value = subscriber/lead value (lower AOV).
const CONTENT_SPECS: Spec[] = [
  { id: "1001", name: "Search · Brand", type: "search", status: "enabled", impr: 1400, ctr: 0.13, cpc: 3.2, convRate: 0.08, aov: 320 },
  { id: "1002", name: "Demand Gen · Odběry newsletteru", type: "demand_gen", status: "enabled", impr: 130000, ctr: 0.009, cpc: 2.4, convRate: 0.012, aov: 300 },
  { id: "1003", name: "Performance Max · Růst publika", type: "performance_max", status: "enabled", impr: 60000, ctr: 0.011, cpc: 3.0, convRate: 0.02, aov: 290 },
  { id: "1004", name: "Display · Remarketing obsahu", type: "display", status: "enabled", impr: 150000, ctr: 0.006, cpc: 1.8, convRate: 0.006, aov: 280 },
  { id: "1005", name: "Video · YouTube dosah", type: "video", status: "enabled", impr: 280000, ctr: 0.005, cpc: 0.9, convRate: 0.003, aov: 270 },
  { id: "1006", name: "Video · Povědomí (pauza)", type: "video", status: "paused", impr: 200000, ctr: 0.004, cpc: 1.0, convRate: 0.001, aov: 260 },
];

const SPECS_BY_TYPE: Record<ProjectType, Spec[]> = {
  eshop: ESHOP_SPECS,
  app: APP_SPECS,
  leadgen: LEADGEN_SPECS,
  content: CONTENT_SPECS,
};

/** Default seed key keeps e-shop output byte-for-byte identical to before. */
function specsFor(type?: ProjectType): Spec[] {
  return type ? SPECS_BY_TYPE[type] : ESHOP_SPECS;
}

export function sampleCampaigns(
  period: CampaignPeriod,
  type?: ProjectType,
  seedKey = "mionelo"
): Campaign[] {
  const days = CAMPAIGN_PERIOD_DAYS[period];
  const rnd = mulberry32(hashStr(`${seedKey}:${period}`));
  const j = (scale = 0.05) => 1 + (rnd() * 2 - 1) * scale;

  return specsFor(type).map((s) => {
    const impressions = Math.round(s.impr * days * j());
    const clicks = Math.round(impressions * s.ctr * j());
    const cost = Math.round(clicks * s.cpc * j());
    const conversions = Math.max(0, Math.round(clicks * s.convRate * j()));
    const conversionValue = Math.round(conversions * s.aov * j());
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      status: s.status,
      impressions,
      clicks,
      cost,
      conversions,
      conversionValue,
    };
  });
}

/** Per-day portfolio totals over the period — the date series the live connector
 *  produces from `segments.date`, mirrored here so the trend chart works out of
 *  the box. Sums all campaign specs per day with a weekend dip + small daily
 *  jitter, seeded per (period, date) so a re-sync is stable. */
export function sampleSeries(
  period: CampaignPeriod,
  type?: ProjectType,
  seedKey = "mionelo"
): DailyPoint[] {
  const days = CAMPAIGN_PERIOD_DAYS[period];
  // Anchor on a fixed "today" boundary (UTC midnight) so points land on dates.
  const todayMs = Math.floor(Date.now() / 86_400_000) * 86_400_000;

  // Daily base totals across all specs (one day's worth, no period scaling).
  let baseCost = 0;
  let baseConv = 0;
  let baseValue = 0;
  for (const s of specsFor(type)) {
    const clicks = s.impr * s.ctr;
    baseCost += clicks * s.cpc;
    baseConv += clicks * s.convRate;
    baseValue += clicks * s.convRate * s.aov;
  }

  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayMs - i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    const rnd = mulberry32(hashStr(`${seedKey}-series:${period}:${date}`));
    const j = (scale = 0.1) => 1 + (rnd() * 2 - 1) * scale;
    const dow = d.getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.82 : 1;
    out.push({
      date,
      cost: Math.round(baseCost * weekend * j()),
      conversions: Math.max(0, Math.round(baseConv * weekend * j())),
      conversionValue: Math.round(baseValue * weekend * j()),
    });
  }
  return out;
}
