/** Single source of truth for the agreed *paid* Google Ads PNO / ROAS target.
 *
 *  The blended, whole-business goal (all channels, incl. free/organic/direct) is a
 *  separate concept the performance dashboard (/vykon) reads from the per-project
 *  dataset `goals.pno` — it is NOT defined here. This module defines only the paid
 *  Google Ads portfolio target, shown on the campaign console (/kampane), which the
 *  campaign domain imports. Every surface MUST label its scope so the two targets
 *  never read as a contradiction. */

/** Paid Google Ads portfolio PNO target (looser than blended; carries prospecting). */
export const PAID_PORTFOLIO_TARGET_PNO = 0.18;

/** Equivalent paid-portfolio target ROAS (≈ 5.6×). */
export const PAID_PORTFOLIO_TARGET_ROAS = 1 / PAID_PORTFOLIO_TARGET_PNO;
