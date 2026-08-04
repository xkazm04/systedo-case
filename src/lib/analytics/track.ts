/** First-party analytics emitters (server-only). Best-effort by contract — a
 *  recording failure must NEVER break the surface it instruments (mirrors
 *  activity/emit + llm/telemetry): each helper awaits its write (so it completes
 *  in a serverless invocation) but swallows every error into a console line.
 *
 *  Privacy posture: only an aggregated (metric, UTC-day) counter is ever
 *  incremented. No IP, no user agent, no cookie, no session id, no per-user row.
 *  That is why these are called from SERVER components / callbacks only — there
 *  is deliberately no client beacon to strip identifiers from. */
import "server-only";
import { bumpDailyMetric } from "./store";
import { METRIC_ACTIVATION, METRIC_SIGNUP, pageViewMetric } from "./funnel";

/** Today as a UTC calendar day ("YYYY-MM-DD"). */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function bump(metric: string): Promise<void> {
  try {
    await bumpDailyMetric(metric, utcDay());
  } catch (err) {
    console.error(`[analytics] bump ${metric} failed (non-fatal):`, err);
  }
}

/** One anonymous server-rendered view of a public route (e.g. "/dashboard",
 *  "/app-gate"). Call from the route's SERVER component — only request-time
 *  (dynamic) routes can record honestly; a statically prerendered page must not
 *  call this (it would count builds, not visitors). */
export function recordPageView(route: string): Promise<void> {
  return bump(pageViewMetric(route));
}

/** A user's FIRST sign-in — fired from the NextAuth adapter's createUser event,
 *  which runs exactly once per account. */
export function recordSignup(): Promise<void> {
  return bump(METRIC_SIGNUP);
}

/** A project's onboarding checklist first reached "all steps done" (the one-shot
 *  transition is deduped by the durable `activatedAt` marker in the onboarding
 *  state — see onboarding/progress). */
export function recordOnboardingActivation(): Promise<void> {
  return bump(METRIC_ACTIVATION);
}
