/** Two-axis lead scoring — FIT × ENGAGEMENT, never one number.
 *
 *  The industry consensus (Marketo/HubSpot demographic+behavioural) exists for a
 *  concrete reason: a 70 built from "great fit, no engagement" demands the opposite
 *  action from "poor fit, very engaged". Collapsing them destroys exactly the
 *  information the work queue needs, so this module returns both and a grade.
 *
 *   - FIT (0–100): firmographic/demographic, deterministic, computable at creation.
 *     Grounded in the catalog Offering spine when the project has one, so "does this
 *     enquiry match what we actually sell" is answered from real data, not a guess.
 *   - ENGAGEMENT (0–100): the BANT half REUSES `qualificationScore()` from
 *     speed-lead/qualification.ts verbatim (it is done and unit-tested — forking it
 *     would desync the three qualification surfaces), plus message volume, whether
 *     we replied, and a RECENCY DECAY that halves every 30 days.
 *
 *  PURE: no I/O, no store reads, no clock reads (`now` is always passed in). No LLM
 *  — the optional `lead-triage` proposal layer is a separate, later phase and must
 *  never auto-write a score. */
import { qualificationScore, type Qualification } from "@/lib/speed-lead/qualification";
import type { Offering } from "@/lib/catalog/offering";
import { normalizeForSearch } from "@/lib/nav";
import type { Activity, Contact, LeadGrade, LeadScore } from "./types";

/** Engagement halves every 30 days of silence. */
export const RECENCY_HALF_LIFE_DAYS = 30;
const DAY_MS = 86_400_000;

/** The A/B/C/D cell boundary — one threshold on each axis, so the grade is a plain
 *  2×2 and a user can predict it. */
export const GRADE_THRESHOLD = 60;

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/* ── fit ─────────────────────────────────────────────────────────────────────── */

export interface FitInput {
  /** the contact being scored (identity completeness + attribution) */
  contact: Pick<Contact, "email" | "phone" | "companyName" | "companyId" | "notes" | "attribution" | "tags">;
  /** the project's catalog spine, when it has one. Empty ⇒ the service-match
   *  component is SKIPPED (its weight is redistributed), never guessed. */
  offerings?: readonly Offering[];
  /** free text the person actually wrote (the enquiry) — matched against the
   *  catalog. Falls back to `contact.notes` when absent. */
  enquiry?: string;
  /** the project's own localities/regions, for a region match. Empty ⇒ skipped. */
  regions?: readonly string[];
  /** Czech IČO on the contact's company, when known — a strong B2B fit signal. */
  ico?: string;
}

interface Component {
  /** relative weight; components that cannot be evaluated are dropped and the rest
   *  are re-normalised, so an unconfigured project is not punished with a low score */
  weight: number;
  /** 0..1 */
  value: number;
}

/** Deterministic firmographic/demographic fit, 0–100. Pure.
 *
 *  Components (each dropped when it cannot be evaluated at all):
 *   - reachability: do we have a way to answer this person (email/phone)
 *   - service match: does the enquiry text hit the catalog's offerings
 *   - business signal: company name / IČO present (B2B weight)
 *   - region match: does the enquiry mention a locality we serve
 *   - channel quality: an intent-bearing source outranks a cold list import */
export function fitScore(input: FitInput): number {
  const comps: Component[] = [];

  // Reachability — always evaluable.
  const reach = (input.contact.email ? 0.6 : 0) + (input.contact.phone ? 0.4 : 0);
  comps.push({ weight: 25, value: Math.min(1, reach) });

  // Service match against the catalog Offering spine.
  const text = normalizeForSearch(`${input.enquiry ?? ""} ${input.contact.notes ?? ""} ${input.contact.tags.join(" ")}`);
  const offerings = input.offerings ?? [];
  if (offerings.length > 0 && text.trim()) {
    comps.push({ weight: 30, value: offeringMatch(text, offerings) });
  }

  // Business signal.
  const hasCompany = Boolean(input.contact.companyName || input.contact.companyId);
  const hasIco = Boolean(input.ico);
  comps.push({ weight: 20, value: hasIco ? 1 : hasCompany ? 0.6 : 0 });

  // Region match.
  const regions = input.regions ?? [];
  if (regions.length > 0 && text.trim()) {
    const hit = regions.some((r) => {
      const k = normalizeForSearch(r).trim();
      return k.length >= 3 && text.includes(k);
    });
    comps.push({ weight: 10, value: hit ? 1 : 0 });
  }

  // Channel quality — intent-bearing sources score higher than a bulk import.
  comps.push({ weight: 15, value: sourceQuality(input.contact.attribution.source) });

  const totalWeight = comps.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return 0;
  return clamp((comps.reduce((s, c) => s + c.weight * c.value, 0) / totalWeight) * 100);
}

/** Fraction of catalog offerings whose name/category/tags are echoed in the text,
 *  saturating at 2 hits (one clear match is already a strong signal; ten is not
 *  ten times stronger). */
function offeringMatch(foldedText: string, offerings: readonly Offering[]): number {
  let hits = 0;
  for (const o of offerings) {
    const terms = [o.name, o.category, ...o.tags];
    for (const term of terms) {
      const k = normalizeForSearch(String(term)).trim();
      if (k.length >= 4 && foldedText.includes(k)) {
        hits += 1;
        break;
      }
    }
    if (hits >= 2) break;
  }
  return Math.min(1, hits / 2);
}

/** How much buying intent the channel itself implies. Deliberately coarse and
 *  explicit rather than a learned weight — an operator must be able to read it. */
function sourceQuality(source: string): number {
  const s = normalizeForSearch(source ?? "").trim();
  if (!s) return 0.4;
  if (s.includes("referral") || s.includes("doporuc")) return 1;
  if (s.includes("organic") || s.includes("direct")) return 0.85;
  if (s.includes("google-ads") || s.includes("sklik") || s.includes("search")) return 0.8;
  if (s.includes("whatsapp") || s.includes("email") || s.includes("gmail")) return 0.7;
  if (s.includes("linkedin")) return 0.65;
  if (s.includes("meta") || s.includes("facebook") || s.includes("lead-form")) return 0.5;
  if (s.includes("import") || s.includes("csv") || s.includes("manual")) return 0.3;
  return 0.5;
}

/* ── engagement ──────────────────────────────────────────────────────────────── */

export interface EngagementInput {
  /** captured BANT, when the rep filled any of it in. Absent ⇒ that half is 0 and
   *  the behavioural half carries the score alone (an un-worked lead IS low). */
  qualification?: Qualification;
  /** the contact's timeline (or the bounded slice of it the caller loaded) */
  activities?: readonly Activity[];
  /** did we ever answer? A replied-to lead is a live conversation. */
  firstRespondedAt?: string;
  /** ISO timestamp of the newest activity — drives the decay */
  lastActivityAt?: string;
  /** evaluation instant; PASSED IN so the function stays pure/testable */
  now: Date;
}

/** Behavioural + BANT engagement, 0–100, decayed by recency. Pure. */
export function engagementScore(input: EngagementInput): number {
  const bant = input.qualification ? qualificationScore(input.qualification) : 0;

  const acts = input.activities ?? [];
  const inbound = acts.filter((a) => a.kind === "inbound_message" || a.kind === "call").length;
  const meetings = acts.filter((a) => a.kind === "meeting").length;
  // Message volume saturates at 4 — the fifth enquiry is not five times the signal.
  const volume = Math.min(1, inbound / 4);
  const replied = input.firstRespondedAt ? 1 : 0;
  const met = Math.min(1, meetings);

  const behavioural = clamp(volume * 45 + replied * 25 + met * 30);

  // Half BANT, half behaviour — either alone can only reach 50, which is honest:
  // a lead with three messages and no qualification is not an A.
  const base = bant * 0.5 + behavioural * 0.5;
  return clamp(base * recencyFactor(input.lastActivityAt, input.now));
}

/** 1 at "just now", halving every `RECENCY_HALF_LIFE_DAYS`. An unknown or future
 *  timestamp is treated as fresh (never punish missing data). Pure. */
export function recencyFactor(lastActivityAt: string | undefined, now: Date): number {
  if (!lastActivityAt) return 1;
  const t = Date.parse(lastActivityAt);
  if (!Number.isFinite(t)) return 1;
  const days = (now.getTime() - t) / DAY_MS;
  if (days <= 0) return 1;
  return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS);
}

/* ── the 2×2 ─────────────────────────────────────────────────────────────────── */

/** A = good fit & engaged · B = good fit, cold · C = engaged, poor fit ·
 *  D = neither. B before C is deliberate: fit is the half you cannot change. */
export function gradeFor(fit: number, engagement: number): LeadGrade {
  const goodFit = fit >= GRADE_THRESHOLD;
  const engaged = engagement >= GRADE_THRESHOLD;
  if (goodFit && engaged) return "A";
  if (goodFit) return "B";
  if (engaged) return "C";
  return "D";
}

export interface ScoreInput extends FitInput {
  qualification?: Qualification;
  activities?: readonly Activity[];
  firstRespondedAt?: string;
  lastActivityAt?: string;
  now: Date;
}

/** The whole score in one deterministic call. Pure — `now` in, `LeadScore` out. */
export function scoreContact(input: ScoreInput): LeadScore {
  const fit = fitScore(input);
  const engagement = engagementScore({
    qualification: input.qualification,
    activities: input.activities,
    firstRespondedAt: input.firstRespondedAt,
    lastActivityAt: input.lastActivityAt,
    now: input.now,
  });
  return {
    fit,
    engagement,
    grade: gradeFor(fit, engagement),
    computedAt: input.now.toISOString(),
  };
}

/** Work-queue ordering key: A→D, then the stronger score inside a grade. Higher is
 *  more urgent. Pure (the SLA clock is applied by the caller ON TOP of this —
 *  lateness always outranks grade). */
export function scoreRank(score: LeadScore | undefined): number {
  if (!score) return -1;
  const gradeWeight: Record<LeadGrade, number> = { A: 3000, B: 2000, C: 1000, D: 0 };
  return gradeWeight[score.grade] + score.fit + score.engagement;
}
