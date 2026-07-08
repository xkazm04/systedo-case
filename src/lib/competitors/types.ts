/** C3 — a project's optional competitor set. User-entered (never invented): names
 *  the tenant actually competes with, so the recap + social narrative can be
 *  comparative ("vs. the market") instead of only period-over-period on own data. */
export interface Competitor {
  name: string;
  /** short freeform note — positioning, price stance, a URL, whatever grounds a comparison */
  note?: string;
}

export interface CompetitorSet {
  competitors: Competitor[];
  updatedAt: string;
}

/** Coerce arbitrary request JSON into a clean set (≤8 named rivals), or null when
 *  there's not a single usable name. Names/notes are trimmed and length-capped. */
export function sanitizeCompetitors(raw: unknown): Omit<CompetitorSet, "updatedAt"> | null {
  const arr = Array.isArray((raw as { competitors?: unknown })?.competitors)
    ? (raw as { competitors: unknown[] }).competitors
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  const competitors: Competitor[] = [];
  for (const item of arr) {
    const o = (item ?? {}) as Record<string, unknown>;
    const name = (typeof o.name === "string" ? o.name : "").trim().slice(0, 80);
    if (!name) continue;
    const note = (typeof o.note === "string" ? o.note : "").trim().slice(0, 160);
    competitors.push(note ? { name, note } : { name });
    if (competitors.length >= 8) break;
  }
  return competitors.length ? { competitors } : null;
}
