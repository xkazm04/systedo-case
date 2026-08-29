/** The shared cross-module signal model. Every module emits `Recommendation`s
 *  from its data; the Overview command center and (later) an alerts inbox consume
 *  them. This is the connective tissue that turns isolated modules into one
 *  product. Framework-free. */

export type Severity = "critical" | "warning" | "opportunity" | "info";

/** Render + sort order (most urgent first). */
export const SEVERITY_ORDER: Severity[] = ["critical", "warning", "opportunity", "info"];

/** WP W3-A — the LOCALE-FREE, entity-scoped identity of the SUBJECT a
 *  recommendation is about. `id` is the React key (it embeds the localized title,
 *  so it differs between cs and en and is therefore useless as a ledger key); this
 *  is what the advice ledger keys on, so the same signal seen in Czech on Monday and
 *  in English on Friday is ONE tracked subject.
 *
 *  Shape: `{moduleKey}:{signal}:{entity}` — the entity part is slugified and
 *  diacritic-folded through {@link subjectSlug}, multi-part entities joined by `|`
 *  (`lokalni:coverage-gap:beleni-zubu|praha`). Signals with a single global subject
 *  carry no entity part (`ltv:ltv-cac-below-target`).
 *
 *  THE RULE FOR PRODUCERS: never interpolate a localized string. Interpolate the
 *  entity's own identifier — a SKU, a channel key, a keyword, a month index — which
 *  reads the same in every locale. `test-unit/insights-subject-keys.test.mjs`
 *  enumerates every producer in both locales and fails if the two sets differ. */
export type SubjectKey = string;

/** The snapshot metric a recommendation carries when a real number underlies it.
 *  The ledger captures `value` at FIRST sight and again on every sighting, and scores
 *  first-vs-last when the signal disappears. `key` names the metric so the direction
 *  can be judged (see ADVICE_INVERSE_KEYS in @/lib/advice/ledger).
 *
 *  THE REGISTERED KEYS — chosen once, here, so two producers can never mean two
 *  different things by the same name. All of these read HIGHER IS BETTER:
 *   • `poas`               — margin-aware profit on ad spend of a channel (zisk)
 *   • `ltvCac`             — LTV:CAC ratio (ltv)
 *   • `qualRate`           — lead qualification rate 0–1 (kvalita-leadu)
 *   • `daysOfCover`        — days of stock left for a SKU (sklad-sezonnost)
 *   • `trafficChangePct`   — YoY traffic change of a post, signed (obsahovy-engine)
 *  A signal whose honest direction is "lower is better" and which is NOT in the
 *  ledger's inverse set emits NO snapshot rather than a mis-signed one — an absent
 *  outcome is honest, an inverted one is not. */
export interface RecommendationSnapshot {
  key: string;
  value: number;
}

/** Diacritic-folding slug for the entity half of a {@link SubjectKey} — the same
 *  NFD-strip fold `coverageKey`/`slugify` use, kept local so this framework-free
 *  module pulls in no nav/i18n graph. "Bělení zubů" → "beleni-zubu". */
export function subjectSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface Recommendation {
  id: string;
  /** LOCALE-FREE identity of the subject — the advice ledger's key. See {@link SubjectKey}. */
  subjectKey: SubjectKey;
  /** the metric behind this rec, when one exists. See {@link RecommendationSnapshot}. */
  snapshot?: RecommendationSnapshot;
  /** module key the signal came from — links to /app/[projectId]/[module] */
  module: string;
  /** module label for display */
  moduleLabel: string;
  severity: Severity;
  title: string;
  detail: string;
  /** optional headline metric for context */
  metric?: string;
  /** estimated money at stake (CZK), when a producer can quantify it — drives the
   *  impact ranking so a big leak outranks a small one of the same severity. */
  impactCzk?: number;
  /** PROVENANCE. True when the recommendation was derived from illustrative SAMPLE
   *  data rather than the project's own imported/synced signals — so the surface that
   *  renders it can disclose that, exactly as the module pages it links to already do
   *  (ModulePage's `sample` gutter / LocalSourcePanel's live strip). Absent/false = the
   *  producing signal is live. Never affects ranking: an honest sample rec is still the
   *  most useful thing to show a project that has not connected anything yet — it is
   *  labelled, not demoted. */
  sample?: boolean;
}

/** Impact ranking: severity bucket first (a blocker beats an opportunity), then
 *  money at stake within the bucket, so two same-severity items no longer tie —
 *  the 200k Kč leak sorts above the 200 Kč one. Unknown impact sorts last. */
export function byImpact(a: Recommendation, b: Recommendation): number {
  const sev = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  if (sev !== 0) return sev;
  return (b.impactCzk ?? -1) - (a.impactCzk ?? -1);
}
