/** Request wiring for the social routes' write rails (the impure half of
 *  src/lib/social/rails.ts): per-actor rate limiting and the tenant resolution
 *  that keeps anonymous demo writes session-scoped instead of landing in the one
 *  shared `sample` tenant every visitor renders. Server-only (session + cookies +
 *  the durable limiter). */
import "server-only";
import { cookies } from "next/headers";
import { resolveTenant } from "@/lib/campaigns/connector";
import { enforceUserRate } from "@/lib/api/route-utils";
import { clientIp, tooManyRequests, type RateRule } from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";
import {
  DEMO_SOCIAL_COOKIE,
  SOCIAL_RATE,
  demoSocialTenantFor,
  isDemoSocialSid,
  newDemoSocialSid,
} from "@/lib/social/rails";

/** The tenant a social route reads/writes. Signed-in → the per-project,
 *  account-agnostic key (unchanged: social content must never carry the volatile
 *  Ads customerId). Anonymous → a SESSION-scoped demo tenant minted into an
 *  httpOnly cookie, so the public demo stays interactive without any visitor's
 *  writes rendering for anyone else. */
export async function socialTenant(uid: string | null, projectId?: string | null): Promise<string> {
  if (uid) return resolveTenant(uid, projectId, { accountScoped: false });
  const store = await cookies();
  const existing = store.get(DEMO_SOCIAL_COOKIE)?.value;
  if (isDemoSocialSid(existing)) return demoSocialTenantFor(existing);
  const sid = newDemoSocialSid();
  try {
    store.set(DEMO_SOCIAL_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // Read-only cookie context: fall back to a per-request tenant — the write
    // won't be visible on the next read, but it still bleeds to no one.
  }
  return demoSocialTenantFor(sid);
}

/** Rate-limit a social write. Authed → per-user fixed window (enforceUserRate,
 *  the WORKSPACE_RATE posture); anonymous → per-IP through the DURABLE guard so
 *  the cap binds across serverless instances (with the sqlite limiter as its
 *  built-in fallback). Returns the ready 429 when over, else null. */
export async function guardSocialWrite(
  request: Request,
  uid: string | null,
  rule: RateRule
): Promise<Response | null> {
  if (uid) return enforceUserRate(uid, rule, "Příliš mnoho požadavků. Zkuste to prosím za chvíli.");
  const limited = await durableGuard(clientIp(request), [SOCIAL_RATE.demoPerMin(), SOCIAL_RATE.demoPerDay()]);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho požadavků. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }
  return null;
}
