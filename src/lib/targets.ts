/** Single source of truth for the agreed PNO / ROAS targets.
 *
 *  There are TWO intentional targets for TWO different scopes — they are NOT the
 *  same metric disagreeing, and every surface MUST label its scope so they never
 *  read as a contradiction (a data analyst who sees "15 %" on one screen and
 *  "18 %" on another, both unlabelled, rightly distrusts the whole tool):
 *
 *   - BLENDED_PNO_GOAL — the whole-business goal across *every* channel
 *     (incl. free/organic/direct), shown on the performance dashboard (/vykon).
 *     Tighter, because free revenue dilutes the blended cost share.
 *
 *   - PAID_PORTFOLIO_TARGET_PNO — the *paid* Google Ads portfolio only, shown on
 *     the campaign console (/kampane). Looser, because the paid mix carries
 *     prospecting / upper-funnel that the blended goal doesn't isolate.
 *
 *  The dashboard reads its goal from the (per-project) dataset `goals.pno`, which
 *  is seeded to BLENDED_PNO_GOAL; the campaign domain imports PAID_PORTFOLIO_*
 *  here. Keep `goals.pno` in the seed in sync with BLENDED_PNO_GOAL. */

/** Whole-business blended PNO goal (all channels). Mirrors seed `goals.pno`. */
export const BLENDED_PNO_GOAL = 0.15;

/** Paid Google Ads portfolio PNO target (looser than blended; carries prospecting). */
export const PAID_PORTFOLIO_TARGET_PNO = 0.18;

/** Equivalent paid-portfolio target ROAS (≈ 5.6×). */
export const PAID_PORTFOLIO_TARGET_ROAS = 1 / PAID_PORTFOLIO_TARGET_PNO;

/** Short Czech scope labels so a surface can render the target unambiguously. */
export const TARGET_SCOPE_LABEL = {
  blended: "celý web",
  paid: "placené portfolio",
} as const;
