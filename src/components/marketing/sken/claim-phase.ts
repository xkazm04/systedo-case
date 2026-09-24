/** The /sken claim's response-to-phase map — pure, so the state machine that decides
 *  what the visitor sees after a redeem is testable without React or a router.
 *
 *  No runtime imports (the one import is type-only), so this module can never drag a
 *  server-only store into the client bundle. */
import type { RedeemCandidate } from "@/lib/onboarding/redeem-plan";

/** Every state of the claim, including the ones that are not success:
 *   - `needs-signin` — returned with a token but no session; the token is still good.
 *   - `expired` — the token is unknown, spent or past its TTL; run the scan again.
 *   - `redeem-retry` — the redeem failed before anything was written (or the chosen
 *     project vanished); the claim is still parked, so "try again" re-uses it.
 *   - `choosing` — the caller already owns a project for the scanned site; they pick
 *     "add to it" or "create a new one" before the token is spent. */
export type SkenClaimPhase =
  | "idle"
  | "claiming"
  | "redeeming"
  | "choosing"
  | "needs-signin"
  | "expired"
  | "redeem-retry"
  | "failed";

export type RedeemVerdict =
  | { phase: "done"; href: string }
  | { phase: "choosing"; candidates: RedeemCandidate[] }
  | { phase: Exclude<SkenClaimPhase, "done" | "choosing"> };

function candidatesOf(json: unknown): RedeemCandidate[] {
  const list = (json as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (c): c is RedeemCandidate =>
      !!c && typeof c.id === "string" && typeof c.name === "string" && typeof c.domain === "string"
  );
}

/** What a redeem answer means for the visitor. */
export function phaseForRedeemResponse(status: number, json: unknown): RedeemVerdict {
  const code = (json as { code?: unknown } | null)?.code;
  if (status === 401) return { phase: "needs-signin" };
  if (status === 503) return { phase: "redeem-retry" };
  if (status === 409 && code === "choose-target") {
    const candidates = candidatesOf(json);
    return candidates.length > 0 ? { phase: "choosing", candidates } : { phase: "failed" };
  }
  // The chosen project is gone, but the claim is not: a retry re-asks.
  if (status === 404 && code === "unknown-target") return { phase: "redeem-retry" };
  if (status === 404) return { phase: "expired" };
  const projectId = (json as { projectId?: unknown } | null)?.projectId;
  if (status >= 200 && status < 300 && typeof projectId === "string" && projectId) {
    return { phase: "done", href: `/app/${encodeURIComponent(projectId)}/start` };
  }
  return { phase: "failed" };
}

/** The claim leg's first move after the scan is parked. It tries the redeem BEFORE
 *  signing in — an anonymous redeem is a 401 that never spends the token — so a
 *  visitor who is already signed in never leaves the page. */
export function claimNextStep(status: number): "sign-in" | "navigate" | "stay" {
  if (status === 401) return "sign-in";
  return status >= 200 && status < 300 ? "navigate" : "stay";
}
