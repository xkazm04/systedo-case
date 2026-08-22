/** Shared, PURE list-filtering for both lead-store backends, so a sqlite list and a
 *  Firestore list can never disagree about what "search=nov" matches. Diacritic
 *  folding matters here: a Czech operator types "novak" and must find "Novák". */
import { normalizeForSearch } from "@/lib/nav";
import { sourceLabel } from "./aggregate";
import { isErased, type Contact, type PipelineStage } from "./types";

/** List filter. `search` is matched in memory against name/email/phone/company
 *  (the fields are short and the per-project set is bounded) — deliberately NOT a
 *  SQL LIKE over the JSON blob, which would be neither indexable nor
 *  diacritic-correct for Czech. Lives here (not in store.ts) so both backends can
 *  import it without a cycle through the dispatcher. */
export interface ContactQuery {
  stage?: PipelineStage;
  /** exact DISPLAY label of the attribution source (`aggregate.ts#sourceLabel`),
   *  which is what every aggregate groups by — filtering on the raw `source` key
   *  would silently merge two campaigns the segment map shows as two rows.
   *  Matched in memory over the bounded scan, like `search`: there is no source
   *  column/index on either backend and adding one would be a migration, not a
   *  filter. */
  source?: string;
  /** free text — folded, matched against name/email/phone/company/tags */
  search?: string;
  /** page size (default DEFAULT_LIST_LIMIT) */
  limit?: number;
  /** rows to skip after filtering */
  offset?: number;
  /** include GDPR-tombstoned contacts (default false — they are not people) */
  includeErased?: boolean;
}

export const DEFAULT_LIST_LIMIT = 100;

/** How many rows a filtered list may scan before it stops. Bounds the worst case on
 *  a 20k-contact project without pretending a JSON blob is queryable. */
export const LIST_SCAN_CAP = 2_000;

/** Does this contact match the free-text needle? Matches name, email, phone,
 *  company and tags — the fields a person actually searches by. */
export function contactMatches(c: Contact, foldedNeedle: string): boolean {
  if (!foldedNeedle) return true;
  // The NORMALISED email is searched alongside the raw one: an operator who
  // remembers "jannovak" must still find "Jan.Novak+adamant@gmail.com".
  const hay = normalizeForSearch(
    [c.name, c.email, c.emailKey, c.phone, c.companyName, ...(c.tags ?? [])].filter(Boolean).join(" ")
  );
  if (hay.includes(foldedNeedle)) return true;
  // A phone search is typed with spaces the stored value may not have.
  const digits = foldedNeedle.replace(/\D/g, "");
  if (digits.length >= 4) {
    const phoneHay = `${c.phone ?? ""}${c.phoneKey ?? ""}`.replace(/\D/g, "");
    if (phoneHay.includes(digits)) return true;
  }
  return false;
}

/** Apply the in-memory half of a ContactQuery (search + source + erased visibility) and the
 *  page window. Stage filtering is pushed into the backend query (it is columned /
 *  indexed), so it is NOT re-applied here. */
export function applyContactQuery(rows: Contact[], query: ContactQuery): Contact[] {
  const needle = normalizeForSearch(query.search ?? "").trim();
  const source = query.source?.trim();
  const filtered = rows.filter((c) => {
    if (!query.includeErased && isErased(c)) return false;
    if (source && sourceLabel(c.attribution) !== source) return false;
    return contactMatches(c, needle);
  });
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.max(1, query.limit ?? DEFAULT_LIST_LIMIT);
  return filtered.slice(offset, offset + limit);
}
