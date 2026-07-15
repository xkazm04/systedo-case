/** Direction 1 — the owner's finance inputs, given a server-side home. The /zisk
 *  (ProfitModule) surface used to scatter its state across the browser: margin
 *  scenarios and the per-period real-numbers override in localStorage, the live
 *  per-channel margins in ephemeral React state that never survived a reload. This
 *  is the single persisted blob for all three — {realNumbers?, scenarios[],
 *  channelMargins?} — so the same owner sees the same numbers on any device, and the
 *  apply-to-report seam (which still publishes only the blended margin to the cost
 *  model) is unaffected. Framework-free: the pure sanitizers/coercers live here
 *  (mirrors annotations/diagnoses/types), safe to import from the client module (for
 *  the one-time localStorage migration read) AND the server route (wire sanitize). */
import type { ChannelMargin, MarginScenario } from "@/lib/profit/types";

/** A single period's real revenue + ad spend the owner entered, so the whole profit
 *  view reflects their books, not just the margin lens. Keyed by period ("30"/"90"/
 *  "365") in {@link FinanceInputs.realNumbers}. */
export interface RealOverride {
  revenue: number;
  spend: number;
}

/** The persisted per-project finance-inputs blob. All three input surfaces of the
 *  profit module, plus a save stamp. Mirrors the other single-blob stores. */
export interface FinanceInputs {
  /** per-period ("30"/"90"/"365") real revenue/spend override; absent when unused */
  realNumbers?: Record<string, RealOverride>;
  /** saved, named margin scenarios (newest kept; capped at FINANCE_SCENARIO_CAP) */
  scenarios: MarginScenario[];
  /** the live per-channel margins the owner last edited; absent when never touched */
  channelMargins?: ChannelMargin[];
  /** ISO timestamp of the last save */
  updatedAt: string;
}

/** Honest cap — a working set of margin scenarios, not an unbounded archive. Past the
 *  cap the OLDEST (by savedAt) are dropped on sanitize. */
export const FINANCE_SCENARIO_CAP = 20;

/** Defensive cap on the per-channel margin list, so a malformed/hostile wire blob
 *  can't balloon the stored doc. A channel mix is a handful of entries. */
export const FINANCE_CHANNEL_MARGIN_CAP = 40;

/** Coerce an unknown blob into a clean per-channel margin list, dropping anything
 *  malformed. Mirrors the scenario-margin coercion so the two paths agree. */
export function coerceChannelMargins(raw: unknown): ChannelMargin[] {
  if (!Array.isArray(raw)) return [];
  const out: ChannelMargin[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const mo = m as Record<string, unknown>;
    if (typeof mo.channel === "string" && typeof mo.marginPct === "number" && Number.isFinite(mo.marginPct)) {
      out.push({ channel: mo.channel, marginPct: mo.marginPct });
    }
    if (out.length >= FINANCE_CHANNEL_MARGIN_CAP) break;
  }
  return out;
}

/** Coerce an unknown blob into a clean scenario list, dropping anything malformed so a
 *  corrupt store degrades to "no saved scenarios". Capped to `cap`, keeping the most
 *  recently saved (highest savedAt). Extracted from ProfitModule so the client (legacy
 *  localStorage migration) and the server route sanitize identically. */
export function coerceScenarios(raw: unknown, cap = FINANCE_SCENARIO_CAP): MarginScenario[] {
  if (!Array.isArray(raw)) return [];
  const out: MarginScenario[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") continue;
    if (!Array.isArray(o.margins)) continue;
    out.push({
      id: o.id,
      name: o.name,
      margins: coerceChannelMargins(o.margins),
      savedAt: typeof o.savedAt === "number" && Number.isFinite(o.savedAt) ? o.savedAt : 0,
    });
  }
  if (out.length <= cap) return out;
  // Keep the most recently saved `cap`, preserving their original order.
  const keep = new Set(
    [...out].sort((a, b) => b.savedAt - a.savedAt).slice(0, cap).map((s) => s.id)
  );
  return out.filter((s) => keep.has(s.id));
}

/** Coerce an unknown blob into a clean per-period real-numbers override, keeping only
 *  finite, non-negative revenue/spend (matching the old localStorage loader). */
export function coerceRealNumbers(raw: unknown): Record<string, RealOverride> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, RealOverride> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const r = Number((v as Record<string, unknown>).revenue);
      const s = Number((v as Record<string, unknown>).spend);
      out[k] = {
        revenue: Number.isFinite(r) && r > 0 ? r : 0,
        spend: Number.isFinite(s) && s > 0 ? s : 0,
      };
    }
  }
  return out;
}

/** Wire-sanitize an arbitrary client body into a clean finance-inputs blob (without
 *  the store's `updatedAt` stamp). Never trusts the wire; always returns a clean
 *  object (an empty blob is valid — it clears the inputs). `realNumbers` /
 *  `channelMargins` are omitted when empty so the stored doc stays minimal. Returns
 *  null only when the body is not an object at all (→ the route answers 400). */
export function sanitizeFinanceInputs(raw: unknown): Omit<FinanceInputs, "updatedAt"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const scenarios = coerceScenarios(o.scenarios);
  const realNumbers = coerceRealNumbers(o.realNumbers);
  const channelMargins = coerceChannelMargins(o.channelMargins);
  const clean: Omit<FinanceInputs, "updatedAt"> = { scenarios };
  if (Object.keys(realNumbers).length > 0) clean.realNumbers = realNumbers;
  if (channelMargins.length > 0) clean.channelMargins = channelMargins;
  return clean;
}
