/** WP S1b — how ONE change-set move reads on a row, as a pure function.
 *
 *  This lives in `lib` rather than inside the console component for one reason: it is
 *  the sentence an operator approves a real account change on, and a sentence that
 *  matters has to be assertable in a unit test without rendering React. The console
 *  row is now a call to this plus formatting.
 *
 *  It also FIXES a dishonest row. Before S1b every move rendered as
 *  `{fromName} → {toName}`, which for a PAUSE printed the campaign name, an arrow,
 *  and nothing — a move that removes spend was drawn as a transfer to an unnamed
 *  destination. Four kinds now get four visibly different shapes, so the operator can
 *  tell at a glance which of them the click is about:
 *
 *    shift     `Kampaň A → Kampaň B`
 *    pause     `⏸ Kampaň A`
 *    negative  `− „levné boty“ (Kampaň A)`
 *    promote   `+ „boty na běh“ [exact] (Sestava B)`
 *
 *  Language-neutral by construction — names, the query in quotes, and symbols — so it
 *  needs no `T` table and reads identically in cs and en. The quotes are the Czech
 *  pair (the app's source locale for this surface) and `[exact]` is Google's own term
 *  for the match type, which is what an ads operator recognises. */
import type { BudgetMove } from "./simulate";

/** The row label for one move. Pure; never throws on a partial/legacy move — a move
 *  with no `kind` reads as a shift, exactly as {@link BudgetMove.kind} documents. */
export function moveRowLabel(m: BudgetMove): string {
  switch (m.kind) {
    case "pause":
      return `⏸ ${m.fromName}`;
    case "negative":
      // The campaign is named because a negative is CAMPAIGN-level: the operator is
      // agreeing to block this query across that whole campaign, not one ad group.
      return `− „${m.criterion?.term ?? ""}“ (${m.fromName})`;
    case "promote":
      // The AD GROUP is named because that is where the keyword lands. `toName` holds
      // it (never `toId`, which is a campaign id everywhere else in the model).
      return `+ „${m.criterion?.term ?? ""}“ [exact] (${m.toName || m.fromName})`;
    default:
      return `${m.fromName} → ${m.toName}`;
  }
}

/** Whether a move's row should show the estimated-value figure the shift rows carry.
 *  A negative's `estValueGain` is 0 BY DEFINITION (saved cost is not value), so
 *  printing "+0 Kč" beside it would read as "this move is worth nothing" rather than
 *  "this move is not measured in conversion value". The row omits it instead. */
export function moveShowsValueGain(m: BudgetMove): boolean {
  return m.kind !== "negative";
}
