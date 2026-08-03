/** C3 — a project's optional competitor set. User-entered (never invented): names
 *  the tenant actually competes with, so the recap + social narrative can be
 *  comparative ("vs. the market") instead of only period-over-period on own data.
 *
 *  PROVENANCE (Direction "competitors get provenance"): every entry records HOW it got
 *  here. A `manual` entry was typed by the user; a `scan` entry is an unreviewed guess
 *  the website scan produced during onboarding. Only CURATED entries (manual, or a scan
 *  suggestion the user confirmed) reach the LLM grounding line — an unconfirmed guess
 *  must never be asserted to a model as "this is who you compete with".
 *
 *  MIGRATION: `source` is OPTIONAL on the wire and in storage. Records written before
 *  this change have no `source`, and they were all user-entered, so an absent value
 *  reads as "manual" ({@link competitorSource}) — legacy sets keep grounding exactly as
 *  they did, with no store migration and no backfill. */

/** How a competitor entered the set. */
export type CompetitorSource = "manual" | "scan";

/** Advertised (and enforced) cap on named rivals. Single source of truth: the
 *  sanitiser, the merge and the editor's "max N" copy all derive from this, so what
 *  the UI promises and what the API keeps cannot drift. */
export const MAX_COMPETITORS = 8;

export interface Competitor {
  name: string;
  /** short freeform note — positioning, price stance, a URL, whatever grounds a comparison */
  note?: string;
  /** how the entry got here. ABSENT = legacy record = "manual" (see file header). */
  source?: CompetitorSource;
  /** a `scan` suggestion the user reviewed and kept. Meaningless for `manual`
   *  entries (they are curated by definition). */
  confirmed?: boolean;
}

export interface CompetitorSet {
  competitors: Competitor[];
  updatedAt: string;
}

/** The entry's provenance, legacy-tolerant: an absent/unknown `source` is "manual",
 *  because every record written before provenance existed was typed by a user. */
export function competitorSource(c: Competitor): CompetitorSource {
  return c.source === "scan" ? "scan" : "manual";
}

/** Is this entry CURATED — i.e. may it ground an LLM prompt? Manual entries always;
 *  scan suggestions only once explicitly confirmed. */
export function isCurated(c: Competitor): boolean {
  return competitorSource(c) === "manual" || c.confirmed === true;
}

/** The grounding-eligible subset (order preserved). Unconfirmed scan guesses are
 *  dropped — they still live in the set so the UI can offer them for confirmation. */
export function curatedCompetitors(list: Competitor[] | null | undefined): Competitor[] {
  return (list ?? []).filter(isCurated);
}

/** Case/diacritic-insensitive fold, so "Alza"/"alza" and accented duplicates collapse
 *  to one competitor. The ONE key used for competitor identity — the merge, the
 *  sanitiser's de-dupe and the seo-compare slate all fold names the same way, so a
 *  scan suggestion can never re-add a rival the user already typed under a different
 *  casing. */
export function foldCompetitorName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** A sanitised payload plus what the cap cost. `dropped > 0` means usable names were
 *  NOT kept — the route surfaces that as a coded warning rather than dropping them
 *  silently behind an `{ok:true}`. */
export interface SanitizedCompetitors {
  competitors: Competitor[];
  /** usable names discarded by {@link MAX_COMPETITORS} (0 = nothing lost) */
  dropped: number;
}

function readSource(v: unknown): CompetitorSource | undefined {
  return v === "scan" ? "scan" : v === "manual" ? "manual" : undefined;
}

/** Coerce arbitrary request JSON into a clean set (≤ MAX_COMPETITORS named rivals), or
 *  null when there's not a single usable name. Names/notes are trimmed and
 *  length-capped, duplicates folded away, and `source`/`confirmed` carried through
 *  (an absent source defaults to `manual` — see the file header's migration note).
 *
 *  Truncation order is NOT "first 8 wins": CURATED entries (what the user typed or
 *  confirmed) fill the slots first, and only then unconfirmed scan suggestions. So an
 *  over-cap payload can never cost the user a name they entered themselves. Relative
 *  order inside each class is preserved. */
export function sanitizeCompetitors(
  raw: unknown,
  opts: { defaultSource?: CompetitorSource } = {}
): SanitizedCompetitors | null {
  const arr = Array.isArray((raw as { competitors?: unknown })?.competitors)
    ? (raw as { competitors: unknown[] }).competitors
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  const parsed: Competitor[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const o = (item ?? {}) as Record<string, unknown>;
    const name = (typeof o.name === "string" ? o.name : "").trim().slice(0, 80);
    if (!name) continue;
    const key = foldCompetitorName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const note = (typeof o.note === "string" ? o.note : "").trim().slice(0, 160);
    const source = readSource(o.source) ?? opts.defaultSource ?? "manual";
    const entry: Competitor = { name, source };
    if (note) entry.note = note;
    if (source === "scan" && o.confirmed === true) entry.confirmed = true;
    parsed.push(entry);
  }
  if (parsed.length === 0) return null;
  if (parsed.length <= MAX_COMPETITORS) return { competitors: parsed, dropped: 0 };

  const curated = parsed.filter(isCurated);
  const rest = parsed.filter((c) => !isCurated(c));
  const competitors = [...curated, ...rest].slice(0, MAX_COMPETITORS);
  return { competitors, dropped: parsed.length - competitors.length };
}
