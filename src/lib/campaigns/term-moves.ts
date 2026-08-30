/** WP S1b — the QUERY-LEVEL recommender. Turns a period's stored search terms into
 *  `BudgetMove`s of two new kinds, so a wasted or a proven query rides the exact same
 *  governance envelope a budget shift does (simulate → guardrail → human approval →
 *  reversible ledger) instead of being a second, ungoverned way to change an account.
 *
 *  Pure: no I/O, no AI, no clock. The whole file is a filter, a sort and a cap.
 *
 *  THE ONE INVARIANT THAT MATTERS. A term with ANY conversions is never eligible as a
 *  negative. A negative keyword is permanent, silent and account-wide: blocking a
 *  query that converts destroys revenue the operator will not attribute to us for
 *  weeks. So the negative gate reads `conversions === 0` on a number the mapper
 *  deliberately does NOT round — Google reports fractional conversions, and rounding
 *  0.4 to 0 would turn a converting query into a blocked one. It is pinned twice: as
 *  a table of hand-written cases, and as a property loop over a 200-term random
 *  fixture asserting no emitted negative has conversions > 0.
 *
 *  WHY THE TWO KINDS ARE MUTUALLY EXCLUSIVE BY CONSTRUCTION. The thresholds already
 *  make them disjoint (a negative needs 0 conversions, a promote needs ≥ 2), but the
 *  emitter still records every term it has spoken for and refuses to speak for it
 *  twice. A future threshold change must not be able to produce a change-set that
 *  blocks and promotes the same query in one approval.
 *
 *  WHAT THE NUMBERS MEAN, stated rather than implied:
 *   - `amount` is the term's own period COST. For a negative that is what stops being
 *     spent on it; for a promote it is what the query already costs, which is what
 *     makes it worth its own keyword. It is NOT budget being moved anywhere — these
 *     kinds move no budget at all, which is why `simulateBudgetShift` skips them and
 *     the projection is deliberately an identity.
 *   - `estValueGain` is 0 for a negative. Saved cost is not value: blocking a query
 *     recovers spend, it does not create conversion value, and claiming otherwise
 *     would inflate every projection the moment a negative entered a set.
 *   - `estValueGain` for a promote is the value the query ALREADY produced. It is not
 *     a forecast of extra value; it is the value that is at stake, i.e. the honest
 *     reading is "keep this", not "gain this". */
import type { SearchTermRow } from "./store/search-terms";
import type { BudgetMove } from "./simulate";

/** Minimum period spend (account currency) before a zero-converting query is worth a
 *  permanent negative. Below this the criterion costs more attention than it saves. */
export const TERM_MIN_SPEND_CZK = 500;

/** Minimum clicks before "zero conversions" means anything. A query with 3 clicks and
 *  no conversion has not been given a chance to convert — blocking it is inference
 *  from noise, and this threshold is what stops the recommender doing that. */
export const TERM_MIN_CLICKS = 10;

/** Minimum conversions before a non-exact query earns its own EXACT keyword. Two, not
 *  one: a single conversion on a broad match is regularly a coincidence, and a promote
 *  is also a permanent account change. */
export const PROMOTE_MIN_CONVERSIONS = 2;

/** Default blast radius, matching `DEFAULT_POLICY.maxMoves`. `createChangeSet` passes
 *  the tenant's actual policy, so this default only applies to a direct caller. */
export const DEFAULT_TERM_MAX_MOVES = 3;

export interface TermMoveOptions {
  /** hard cap on emitted moves (the guardrail's blast radius) */
  maxMoves?: number;
  /** override {@link TERM_MIN_SPEND_CZK} */
  minSpend?: number;
  /** override {@link TERM_MIN_CLICKS} */
  minClicks?: number;
  /** override {@link PROMOTE_MIN_CONVERSIONS} */
  minConversions?: number;
}

/** Is this term a candidate NEGATIVE? Spent real money, was clicked enough for the
 *  absence of a conversion to be evidence, and converted exactly nothing. */
export function isWastedTerm(t: SearchTermRow, minSpend: number, minClicks: number): boolean {
  return t.conversions === 0 && t.cost >= minSpend && t.clicks >= minClicks;
}

/** Is this term a candidate PROMOTE? It converts, and it is not already an exact
 *  keyword (promoting an EXACT query would create a duplicate criterion — Google
 *  rejects it, and even if it did not, there is nothing to gain). */
export function isProvenTerm(t: SearchTermRow, minConversions: number): boolean {
  return t.conversions >= minConversions && t.matchType !== "EXACT";
}

/** The move a wasted query becomes. `toId`/`toName` stay empty — there is no
 *  recipient, exactly as for a pause. */
function negativeMove(t: SearchTermRow): BudgetMove {
  return {
    kind: "negative",
    fromId: t.campaignId,
    fromName: t.campaignName,
    toId: "",
    toName: "",
    amount: t.cost,
    // The query's own return, which is 0 by the gate above — carried so the stored
    // move self-describes the evidence it was made on.
    fromRoas: 0,
    toRoas: 0,
    // Saved cost is not conversion value. See the file header.
    estValueGain: 0,
    criterion: { term: t.term, campaignId: t.campaignId, adGroupId: t.adGroupId, matchType: t.matchType },
    // Search terms exist only on the Google read, so the network is known and stamped
    // (ADR-0010). `toSource` stays absent — there is no recipient to attribute.
    fromSource: "google-ads",
  };
}

/** The move a proven query becomes. The ad group IS the destination of the new
 *  keyword, so it rides in `toName` (and NOT in `toId`: `toId` is read as a CAMPAIGN
 *  id by the realized-impact pass, and an ad-group id there would be a lie). */
function promoteMove(t: SearchTermRow): BudgetMove {
  return {
    kind: "promote",
    fromId: t.campaignId,
    fromName: t.campaignName,
    toId: "",
    toName: t.adGroupName,
    amount: t.cost,
    fromRoas: t.cost > 0 ? t.conversionValue / t.cost : 0,
    toRoas: 0,
    // Already-realized value, not a forecast. See the file header.
    estValueGain: t.conversionValue,
    criterion: { term: t.term, campaignId: t.campaignId, adGroupId: t.adGroupId, matchType: t.matchType },
    fromSource: "google-ads",
  };
}

/** Recommend query-level moves from a period's search terms.
 *
 *  Ordering is deliberate and pinned: NEGATIVES first (costliest waste first), then
 *  PROMOTES (highest realized value first). Two reasons. The blast-radius cap bites at
 *  the end of this list, so ordering decides what survives it — and stopping waste is
 *  the move an operator can judge from the row alone. And the apply loop walks the
 *  moves in order, so the account's spend stops leaking before anything is added to it.
 *
 *  De-duped on term + campaign: `search_term_view` can report the same query under
 *  several ad groups of one campaign, and a campaign-level negative added twice is one
 *  useful criterion plus one API error. */
export function recommendTermMoves(terms: SearchTermRow[], opts: TermMoveOptions = {}): BudgetMove[] {
  const maxMoves = opts.maxMoves ?? DEFAULT_TERM_MAX_MOVES;
  const minSpend = opts.minSpend ?? TERM_MIN_SPEND_CZK;
  const minClicks = opts.minClicks ?? TERM_MIN_CLICKS;
  const minConversions = opts.minConversions ?? PROMOTE_MIN_CONVERSIONS;
  if (maxMoves <= 0) return [];

  // One entry per term+campaign, so the dedupe decides ONCE which side a query is on
  // and the two lists can never both contain it.
  const spokenFor = new Set<string>();
  const negatives: BudgetMove[] = [];
  const promotes: BudgetMove[] = [];

  for (const t of terms) {
    if (!t.term || !t.campaignId || !t.adGroupId) continue;
    // A campaign id is digits, so a space cannot occur in the left half and the two
    // halves can never run together into a colliding key.
    const key = `${t.campaignId} ${t.term}`;
    if (spokenFor.has(key)) continue;
    // Promote is tested FIRST so a converting term can never fall through to the
    // negative branch, even if a future threshold change made both gates true.
    if (isProvenTerm(t, minConversions)) {
      spokenFor.add(key);
      promotes.push(promoteMove(t));
      continue;
    }
    if (isWastedTerm(t, minSpend, minClicks)) {
      spokenFor.add(key);
      negatives.push(negativeMove(t));
    }
  }

  negatives.sort((a, b) => b.amount - a.amount);
  promotes.sort((a, b) => b.estValueGain - a.estValueGain);
  return [...negatives, ...promotes].slice(0, maxMoves);
}
