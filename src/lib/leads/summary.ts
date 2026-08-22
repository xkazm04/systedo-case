/** Aggregate view of a project's contacts — the counts a module renders ABOVE a
 *  list, so a thousand-row database can be read without paging through it.
 *
 *  PURE (the clock is passed in) and computed over whatever slice the caller loaded,
 *  which is why `scanned` and `capped` are part of the result: a summary that
 *  quietly described the first 2 000 of 9 000 contacts as "the project" would be
 *  the most expensive kind of wrong number. Counts by stage, source, grade and
 *  region, plus the SLA phase tally and the response-time band the queue renders. */
import { PIPELINE_STAGES, type Contact, type LeadGrade, type PipelineStage } from "./types";
import { sourceLabel } from "./aggregate";
import { contactSla, isQueued, queueAnalytics, type QueueAnalytics } from "./sla";

export interface CountRow {
  label: string;
  count: number;
}

export interface ContactSummary {
  /** contacts included in this aggregate */
  scanned: number;
  /** the scan hit its bound — the numbers describe a slice, not the project */
  capped: boolean;
  byStage: Record<PipelineStage, number>;
  bySource: CountRow[];
  /** `none` counts contacts that were never scored */
  byGrade: Record<LeadGrade | "none", number>;
  /** empty when no contact carries a region/city/postcode — never invented */
  byRegion: CountRow[];
  sla: { breached: number; warning: number; ontrack: number; settled: number };
  analytics: QueueAnalytics;
}

/** The coarse location label for a contact: an explicit region wins, then the city,
 *  then the postcode's leading three digits (a Czech PSČ district — the coarsest
 *  honest grouping a bare postcode supports). `null` = not locatable. */
export function regionLabel(c: Contact): string | null {
  const region = c.region?.trim();
  if (region) return region;
  const city = c.city?.trim();
  if (city) return city;
  const psc = (c.postalCode ?? "").replace(/\s/g, "");
  return psc.length >= 3 ? `${psc.slice(0, 3)}xx` : null;
}

export function summarizeContacts(
  contacts: readonly Contact[],
  nowMs: number,
  capped = false
): ContactSummary {
  const byStage = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0])) as Record<PipelineStage, number>;
  const byGrade: Record<LeadGrade | "none", number> = { A: 0, B: 0, C: 0, D: 0, none: 0 };
  const sla = { breached: 0, warning: 0, ontrack: 0, settled: 0 };
  const sources = new Map<string, number>();
  const regions = new Map<string, number>();

  for (const c of contacts) {
    byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
    byGrade[c.score?.grade ?? "none"] += 1;

    const label = sourceLabel(c.attribution);
    sources.set(label, (sources.get(label) ?? 0) + 1);

    const region = regionLabel(c);
    if (region) regions.set(region, (regions.get(region) ?? 0) + 1);

    if (!isQueued(c)) {
      sla.settled += 1;
      continue;
    }
    const phase = contactSla(c, nowMs).phase;
    if (phase === "breached") sla.breached += 1;
    else if (phase === "warning") sla.warning += 1;
    else if (phase === "ontrack") sla.ontrack += 1;
    else sla.settled += 1;
  }

  return {
    scanned: contacts.length,
    capped,
    byStage,
    bySource: toRows(sources),
    byGrade,
    byRegion: toRows(regions),
    sla,
    analytics: queueAnalytics(contacts, nowMs),
  };
}

/** Biggest first, then alphabetical — a stable order two renders cannot disagree on. */
function toRows(m: Map<string, number>): CountRow[] {
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
