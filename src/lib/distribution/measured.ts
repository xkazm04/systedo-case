/** The bridge from the ORGANIC OUTCOME LEDGER to Distribuce's attribution shape
 *  (WP W2-A). Pure — no React, no I/O — so the module, the page and the tests all
 *  derive the same rows.
 *
 *  `ChannelPerf` was designed for the illustrative fixture, whose two numbers are
 *  `reach` (impressions) and `clicks`. The ledger cannot know reach: it counts what
 *  happened on the tenant's own links and has no window onto how many people SAW the
 *  post those links sat in. Rather than invent a reach — the one thing this WP must
 *  not do — the field carries the number the ledger genuinely has, the count of
 *  MINTED LINKS, and the rendering side relabels the column ("Odkazy") and drops the
 *  CTR column entirely, because clicks-per-link is not a click-through rate and a
 *  percentage in a CTR column would be read as one.
 *
 *  Keeping the shape rather than widening `ChannelPerf` is deliberate: `rollupLearnings`
 *  is a pure function OF these rows and stays byte-identical for the fixture path,
 *  so the Insights panel gains live data without a second code path to keep honest. */
import type { ChannelPerf } from "./sample";
import type { ChannelOutcome } from "@/lib/organic-channels/outcomes";

/** Measured channel outcomes as attribution rows. Only channels with a counted
 *  click survive: a minted-but-unclicked channel is an absence of data, and listing
 *  it as a 0 row would read as "this channel produced nothing", which is a claim the
 *  ledger has not earned. */
export function measuredAttribution(outcomes: readonly ChannelOutcome[]): ChannelPerf[] {
  return outcomes
    .filter((o) => o.clicks30d > 0)
    .map((o) => ({ channel: o.channel, reach: o.links, clicks: o.clicks30d }));
}
