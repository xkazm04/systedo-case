/** THE UNIFICATION PROOF: real contacts → the SAME `LeadSource[]` shape the funnel
 *  math already consumes.
 *
 *  The single largest modelling risk in adding a lead entity is ending up with two
 *  stage vocabularies and two funnels that disagree — the pipeline board saying one
 *  thing and Kvalita leadů another. This module is the guard against that: it
 *  projects `PipelineStage` back onto `LeadStage` (`toLeadStage`), rolls the counts
 *  up cumulatively at the SAME ranks `lead-quality/import.ts` uses, and hands back
 *  rows that `lead-quality/compute.ts` consumes with ZERO changes. `lead-signals`
 *  therefore keeps grounding the recap from one funnel, whichever tier fed it.
 *
 *  PURE — no store reads, no clock. Everything it needs (timelines, spend) is
 *  passed in, so the caller decides how much it is willing to load. */
import type { LeadSource } from "@/lib/lead-quality/sample";
import { STAGE_RANK } from "@/lib/lead-quality/types";
import { isErased, toLeadStage, type Activity, type Attribution, type Contact, type Deal } from "./types";

const DAY_MS = 86_400_000;

/** Human display labels for the normalised source keys. The label is DERIVED here,
 *  never stored on the contact — storing it twice is how a rename desyncs a funnel.
 *  Unknown keys pass through as-is (an imported CSV's own channel names are already
 *  human-readable and must not be mangled). */
export const SOURCE_LABELS: Record<string, string> = {
  "google-ads": "Google Ads",
  sklik: "Sklik",
  "meta-lead-form": "Meta lead formuláře",
  meta: "Meta",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  email: "E-mail",
  gmail: "E-mail",
  organic: "Organic & doporučení",
  referral: "Doporučení",
  direct: "Přímý kontakt",
  import: "Import",
  manual: "Ručně zadané",
  csv: "Import",
  gsheet: "Google Sheets",
  unknown: "Neurčeno",
};

/** The funnel row a contact belongs to: `(source, campaign)` → one display label.
 *  Pure and stable — the same attribution always yields the same row. */
export function sourceLabel(attribution: Attribution | undefined): string {
  const key = (attribution?.source ?? "").trim() || "unknown";
  const base = SOURCE_LABELS[key.toLowerCase()] ?? key;
  const campaign = attribution?.campaign?.trim();
  return campaign ? `${base} – ${campaign}` : base;
}

export interface AggregateOptions {
  /** Per-contact timelines. Only `stage_change` entries are read, and only to
   *  compute REAL daysToQualify / daysToClose — the two fields the sample has always
   *  had to invent. Absent ⇒ velocity is omitted (withMetrics renders "—"). */
  timelines?: ReadonlyMap<string, readonly Activity[]>;
  /** Ad spend per DISPLAY LABEL, joined by the caller from the campaigns store when
   *  the source maps to a linked ad account. Absent ⇒ 0, honestly: a CRM has no ad
   *  spend, and a fabricated one would silently invent a CPL. */
  spendByLabel?: Readonly<Record<string, number>>;
  /** Count `lost` / `disqualified` contacts as having entered the funnel. True by
   *  default — they DID arrive, and excluding them would flatter every win rate. */
  countTerminal?: boolean;
  /** Include GDPR-tombstoned contacts in the counts. True by default: Art. 17 does
   *  not require destroying anonymous statistics, and dropping them would silently
   *  rewrite historic funnel numbers. */
  includeErased?: boolean;
}

interface Acc {
  label: string;
  leads: number;
  qualified: number;
  opportunities: number;
  won: number;
  revenue: number;
  sawOpportunity: boolean;
  qualifySpans: number[];
  closeSpans: number[];
}

/** Contacts (+ optional deals) → the funnel's `LeadSource[]`. Grouped by derived
 *  label, cumulative stage counts at `STAGE_RANK`, revenue from WON deals, velocity
 *  from `stage_change` activities. Sorted by lead volume desc — the same ordering
 *  `aggregateLeads` produces, so the two tiers render identically. */
export function contactsToLeadSources(
  contacts: readonly Contact[],
  deals: readonly Deal[] = [],
  opts: AggregateOptions = {}
): LeadSource[] {
  const countTerminal = opts.countTerminal !== false;
  const includeErased = opts.includeErased !== false;

  // Won revenue per contact, so a contact enquiring twice cannot double-count.
  const revenueByContact = new Map<string, number>();
  for (const d of deals) {
    if (d.stage !== "won") continue;
    if (typeof d.value !== "number" || !Number.isFinite(d.value) || d.value < 0) continue;
    revenueByContact.set(d.contactId, (revenueByContact.get(d.contactId) ?? 0) + d.value);
  }

  const by = new Map<string, Acc>();
  for (const c of contacts) {
    if (!includeErased && isErased(c)) continue;
    const label = sourceLabel(c.attribution);
    const key = label.toLowerCase();
    let a = by.get(key);
    if (!a) {
      a = {
        label,
        leads: 0,
        qualified: 0,
        opportunities: 0,
        won: 0,
        revenue: 0,
        sawOpportunity: false,
        qualifySpans: [],
        closeSpans: [],
      };
      by.set(key, a);
    }

    const ls = toLeadStage(c.stage);
    if (ls === null) {
      // Terminal negative: it entered the funnel but progressed nowhere.
      if (countTerminal) a.leads += 1;
      continue;
    }

    const rank = STAGE_RANK[ls];
    a.leads += 1;
    if (rank >= STAGE_RANK.qualified) a.qualified += 1;
    if (rank >= STAGE_RANK.opportunity) a.opportunities += 1;
    if (c.stage === "opportunity") a.sawOpportunity = true;
    if (rank >= STAGE_RANK.won) {
      a.won += 1;
      a.revenue += revenueByContact.get(c.id) ?? 0;
    }

    const timeline = opts.timelines?.get(c.id);
    if (timeline) {
      const v = velocityFor(c, timeline);
      if (v.toQualify !== undefined) a.qualifySpans.push(v.toQualify);
      if (v.toClose !== undefined) a.closeSpans.push(v.toClose);
    }
  }

  return [...by.values()]
    .sort((x, y) => y.leads - x.leads || x.label.localeCompare(y.label))
    .map((a) => {
      const src: LeadSource = {
        source: a.label,
        leads: a.leads,
        qualified: a.qualified,
        won: a.won,
        spend: opts.spendByLabel?.[a.label] ?? 0,
        revenue: a.revenue,
      };
      // Only surface the opportunity stage where the data actually tracks it —
      // otherwise the funnel sprouts a redundant opportunity===won step.
      if (a.sawOpportunity) src.opportunities = a.opportunities;
      if (a.qualifySpans.length > 0) src.daysToQualify = avg(a.qualifySpans);
      if (a.closeSpans.length > 0) src.daysToClose = avg(a.closeSpans);
      return src;
    });
}

/** Real per-lead velocity from the timeline's `stage_change` entries — the thing an
 *  aggregate import could never provide. `refs.to` carries the stage moved into.
 *  Pure; returns `undefined` for a span the timeline cannot evidence. */
export function velocityFor(
  contact: Contact,
  timeline: readonly Activity[]
): { toQualify?: number; toClose?: number } {
  const changes = timeline
    .filter((a) => a.kind === "stage_change" && typeof a.refs?.to === "string")
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const firstAt = (stage: string): string | undefined =>
    changes.find((a) => a.refs?.to === stage)?.at;

  const qualifiedAt = firstAt("qualified");
  const wonAt = firstAt("won");
  const out: { toQualify?: number; toClose?: number } = {};
  if (qualifiedAt) {
    const d = spanDays(contact.firstSeenAt, qualifiedAt);
    if (d !== undefined) out.toQualify = d;
  }
  if (wonAt) {
    const from = qualifiedAt ?? contact.firstSeenAt;
    const d = spanDays(from, wonAt);
    if (d !== undefined) out.toClose = d;
  }
  return out;
}

function spanDays(from: string, to: string): number | undefined {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  const d = (b - a) / DAY_MS;
  return d >= 0 ? d : undefined;
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
