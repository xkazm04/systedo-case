/** Write rails for the social API surface — the PURE half (rate-rule tables +
 *  the anonymous demo-tenant keying), unit-testable with no session/Firestore
 *  imports. The request wiring (cookies, currentUserId, durableGuard) lives in
 *  src/app/api/social/guard.ts.
 *
 *  Rate posture (the feedback-submit precedent): an AUTHED caller is keyed by
 *  user id (an office IP must not share one budget — enforceUserRate /
 *  WORKSPACE_RATE posture); an ANONYMOUS demo visitor is keyed by client IP
 *  through the durable cross-instance guard (durable-limit), because the sqlite
 *  counter barely binds on serverless. Rules are built lazily so env overrides
 *  are read at call time (mirrors WORKSPACE_RATE / RATE_RULES / FEEDBACK_RATE).
 *
 *  Demo-tenant posture: `resolveTenant(null, …)` used to collapse EVERY anonymous
 *  visitor onto the single shared `sample` tenant — any visitor's posts/replies
 *  rendered in every other visitor's PostsList/Inbox, and markReplied on a sample
 *  message was global-once. Anonymous callers now get a SESSION-SCOPED demo
 *  tenant (`sample_{sid}`, sid minted into an httpOnly cookie), so the public
 *  demo stays fully interactive — compose, schedule, reply — while nothing a
 *  visitor writes is ever rendered to anyone else. `sample_{sid}` can never
 *  collide with a signed-in tenant (those are `u_…` — buildTenantKey) nor with
 *  the legacy shared `sample` key. */
import { randomBytes } from "node:crypto";
import { envInt } from "@/lib/env";
import type { RateRule } from "@/lib/ai/rate-limit";

const MIN = 60_000;
const DAY = 86_400_000;

/** Per-actor caps for the social write routes. Authed rules (post/reply/accounts)
 *  are per-user; the demo rules are per-IP and also fixed-window per day, since an
 *  anonymous visitor has no daily quota anywhere else. */
export const SOCIAL_RATE = {
  /** posts POST/DELETE — a store write + (possibly) a provider publish. */
  postPerMin: (): RateRule => ({ bucket: "social:post", limit: envInt("SOCIAL_POST_PER_MIN", 20), windowMs: MIN }),
  /** messages POST — an approved reply (store write + simulated/real send). */
  replyPerMin: (): RateRule => ({ bucket: "social:reply", limit: envInt("SOCIAL_REPLY_PER_MIN", 20), windowMs: MIN }),
  /** accounts POST/DELETE — connect/disconnect (touches token crypto). */
  accountsPerMin: (): RateRule => ({ bucket: "social:accounts", limit: envInt("SOCIAL_ACCOUNTS_PER_MIN", 12), windowMs: MIN }),
  /** anonymous demo writes, per IP — durable (cross-instance) buckets. */
  demoPerMin: (): RateRule => ({ bucket: "social-demo:min", limit: envInt("SOCIAL_DEMO_PER_MIN", 15), windowMs: MIN }),
  demoPerDay: (): RateRule => ({ bucket: "social-demo:day", limit: envInt("SOCIAL_DEMO_PER_DAY", 120), windowMs: DAY }),
};

/** The demo-session cookie carrying the anonymous visitor's tenant sid. */
export const DEMO_SOCIAL_COOKIE = "demo_social_sid";

/** Shape guard for a cookie-supplied sid — hex only, so a tampered cookie can
 *  never smuggle key-structure characters into a tenant key. */
export function isDemoSocialSid(v: unknown): v is string {
  return typeof v === "string" && /^[a-f0-9]{16,48}$/.test(v);
}

/** Mint a fresh demo-session sid (96 bits — unguessable, so one visitor cannot
 *  enumerate another's demo tenant). */
export function newDemoSocialSid(): string {
  return randomBytes(12).toString("hex");
}

/** The session-scoped anonymous tenant for a sid. Distinct from the legacy shared
 *  `sample` tenant and, by prefix, from every signed-in `u_…` tenant. */
export function demoSocialTenantFor(sid: string): string {
  return `sample_${sid}`;
}
