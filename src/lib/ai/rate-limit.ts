/** Per-IP abuse guards for the public, paid LLM endpoints (server-only).
 *
 *  Every AI route (`/api/ai`, `/api/campaigns/analyze`) shells out to a *paid*
 *  provider — the Claude subscription in dev, metered Gemini in prod — and is
 *  unauthenticated by design (it's a public case-study demo anyone can open).
 *  Without a throttle a single looping visitor can drain the provider budget or
 *  pin the box on a 90 s spawn. These guards close that gap with:
 *
 *    • a fixed-window counter per `bucket`+IP, persisted in the same zero-dep
 *      `node:sqlite` store as the rest of the app (no new dependency), and
 *    • a process-level in-flight concurrency cap so slow spawns can't stack up.
 *
 *  Everything is tunable via env so a deploy can tighten/loosen without a code
 *  change; the defaults are conservative enough to protect a demo budget.
 *
 *  NOTE: on Vercel's ephemeral serverless filesystem this sqlite counter is
 *  effectively per-instance, so the paid routes front it with the Firestore-backed
 *  `durableGuard` (./durable-limit) for a cross-instance cap + a global daily spend
 *  ceiling; this module remains the in-process fallback when Firestore is
 *  unreachable, and the source of the shared RateRule/RateResult contract.
 */
import { getDb } from "../db";
import { envInt } from "@/lib/env";

export interface RateRule {
  /** logical bucket so different endpoints don't share one budget */
  bucket: string;
  /** max requests allowed within the window */
  limit: number;
  /** window length in milliseconds */
  windowMs: number;
}

/** WHICH limit refused. Four layers guard the paid paths and they call for
 *  different caller behaviour: a per-IP refusal is "you are limited" (back off,
 *  retry later, or sign in), a global-ceiling refusal is "EVERYONE is limited"
 *  (retrying from another IP changes nothing and the wall lasts until UTC
 *  midnight), and a plan-quota refusal is "upgrade or wait for tomorrow". One
 *  indistinguishable 429 across all four left the client guessing.
 *
 *  `per-user-minute` is the fifth, non-AI layer: the workspace write throttle in
 *  src/lib/api/route-utils.ts is keyed by user id, not by IP. */
export type LimitLayer =
  | "per-ip-minute"
  | "per-ip-day"
  | "per-user-minute"
  | "global-ceiling"
  | "plan-quota";

/** The refusal contract's two missing halves: the RULE that was enforced and the
 *  caller's CURRENT STANDING against it. Publishing the rule in the refusal is
 *  what stops the enforced number and any advertised number from drifting; the
 *  standing is what lets a client say "3 of 8 left this minute" instead of a bare
 *  "later". Every field is optional at the wire — see {@link tooManyRequests}. */
export interface RefusalDetail {
  /** which layer said no */
  layer: LimitLayer;
  /** the enforced allowance for that layer */
  limit: number;
  /** the window the allowance applies to, in seconds */
  windowSeconds: number;
  /** how much of the allowance is spent (when known) */
  used?: number;
  /** how much is left (0 on the layer that refused) */
  remaining?: number;
  /** the logical counter bucket, for support/telemetry correlation */
  bucket?: string;
}

export interface RateResult {
  ok: boolean;
  /** seconds until the caller may retry (only meaningful when !ok) */
  retryAfter: number;
  /** ADDITIVE: which rule refused and where the caller stands against it. Absent
   *  when the refusing path could not determine it (a Firestore peek failure must
   *  never turn a 429 into a 500), so every consumer must treat it as optional. */
  refusal?: RefusalDetail;
}

/** Classify a fixed-window rule by its window. The per-IP rules are minute- or
 *  day-shaped; anything else is reported by its window rather than guessed at. */
export function layerForRule(rule: RateRule, keyedBy: "ip" | "user" = "ip"): LimitLayer {
  if (keyedBy === "user") return "per-user-minute";
  return rule.windowMs <= MIN ? "per-ip-minute" : "per-ip-day";
}

const MIN = 60_000;
const DAY = 86_400_000;

/** Max bytes we'll accept in a request body before parsing it. */
export const MAX_BODY_BYTES = envInt("AI_MAX_BODY_BYTES", 16_384);
/** Max concurrent in-flight provider calls across the whole process. */
export const MAX_CONCURRENT = envInt("AI_MAX_CONCURRENT", 4);

/** Rule presets, built lazily so env overrides are read at call time. */
export const RATE_RULES = {
  /** AI assistant generations — per minute and per day, per IP. */
  aiPerMin: (): RateRule => ({ bucket: "ai:min", limit: envInt("AI_RATE_PER_MIN", 8), windowMs: MIN }),
  aiPerDay: (): RateRule => ({ bucket: "ai:day", limit: envInt("AI_RATE_PER_DAY", 80), windowMs: DAY }),
  /** Campaign evaluation — also a paid LLM call. */
  evalPerMin: (): RateRule => ({ bucket: "eval:min", limit: envInt("AI_RATE_PER_MIN", 8), windowMs: MIN }),
  evalPerDay: (): RateRule => ({ bucket: "eval:day", limit: envInt("AI_RATE_PER_DAY", 80), windowMs: DAY }),
  /** Campaign sync — cheaper (connector only), so a looser per-minute cap. */
  syncPerMin: (): RateRule => ({ bucket: "sync:min", limit: envInt("SYNC_RATE_PER_MIN", 20), windowMs: MIN }),
  /** Reference-image upload — a real presigned-S3 upload per call. It omits the
   *  spend ceiling (no generation), so a per-minute throttle alone left the daily
   *  volume uncapped; this daily rule bounds sustained upload abuse the same way
   *  aiPerDay bounds the paid routes. Per-IP: upload-ref is anonymous-capable (like
   *  its sibling paid routes), so the IP is the actor key. */
  uploadRefPerDay: (): RateRule => ({ bucket: "upload-ref:day", limit: envInt("UPLOAD_REF_PER_DAY", 40), windowMs: DAY }),
};

/** Number of trusted reverse-proxy hops in front of the app (1 on Vercel). The
 *  real client IP sits that many entries from the RIGHT of x-forwarded-for;
 *  anything further left is client-supplied and must not be trusted. */
const TRUSTED_PROXY_HOPS = envInt("TRUSTED_PROXY_HOPS", 1);

/** Is the platform connecting-IP header (x-real-ip / x-vercel-forwarded-for)
 *  trustworthy on THIS deployment? Only when a proxy in front of the app strips /
 *  overwrites those headers — true on Vercel (the platform sets VERCEL=1 and its
 *  edge overwrites them), or when the operator explicitly attests to it with
 *  TRUSTED_PROXY=true|1. Anywhere else (bare Node, Docker, a pass-through proxy)
 *  a client can forge x-real-ip, so it must be ignored. FAIL-SAFE: default is
 *  untrusted. Read at call time so tests / runtime config changes apply. */
function platformIpHeaderTrusted(): boolean {
  if (process.env.VERCEL) return true;
  const flag = process.env.TRUSTED_PROXY?.trim().toLowerCase();
  return flag === "true" || flag === "1";
}

/** Best-effort client IP, resistant to x-forwarded-for spoofing.
 *
 *  A client can prepend arbitrary `x-forwarded-for` entries, so the *leftmost*
 *  value is attacker-controlled — taking it (the previous behaviour) let a caller
 *  rotate the header to land in a fresh rate-limit bucket on every request,
 *  defeating the per-IP caps that are the only budget guard for anonymous users.
 *  The platform's connecting-IP header (x-real-ip / x-vercel-forwarded-for) is
 *  preferred ONLY when the deployment attests that a proxy overwrites it (Vercel,
 *  or TRUSTED_PROXY=true — see platformIpHeaderTrusted): off-platform those
 *  headers are client-forgeable and previously bypassed every per-IP cap.
 *  Otherwise we read XFF from the RIGHT, stepping in by the configured
 *  trusted-hop count. Falls back to a shared "unknown" bucket so a missing
 *  header still counts toward *some* limit. */
export function clientIp(request: Request): string {
  if (platformIpHeaderTrusted()) {
    const trusted =
      request.headers.get("x-real-ip")?.trim() ||
      request.headers.get("x-vercel-forwarded-for")?.trim();
    if (trusted) return trusted;
  }

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length > 0) {
      const idx = Math.max(0, hops.length - TRUSTED_PROXY_HOPS);
      return hops[idx] || "unknown";
    }
  }
  return "unknown";
}

/** Reject obviously oversized bodies via the content-length header before we
 *  ever read/parse them. */
export function tooLarge(request: Request, maxBytes: number = MAX_BODY_BYTES): boolean {
  const len = Number(request.headers.get("content-length"));
  return Number.isFinite(len) && len > maxBytes;
}

/** Fixed-window check across one or more rules. Returns the first rule that is
 *  exceeded (with its retry-after in seconds), or { ok: true } when all pass.
 *  Counters are only incremented when *every* rule passes, so a rejected request
 *  doesn't consume budget. */
export function rateLimit(ip: string, rules: RateRule[]): RateResult {
  const db = getDb();
  const now = Date.now();

  // Opportunistic cleanup so the table can't grow unbounded.
  db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(now - DAY);

  const read = db.prepare("SELECT window_start, count FROM rate_limits WHERE bucket = ? AND ip = ?");

  // First pass: would any rule be exceeded? (read-only)
  const plans: { rule: RateRule; windowStart: number; nextCount: number }[] = [];
  for (const rule of rules) {
    const windowStart = now - (now % rule.windowMs);
    const row = read.get(rule.bucket, ip) as { window_start: number; count: number } | undefined;
    const current = row && row.window_start >= windowStart ? row.count : 0;
    if (current >= rule.limit) {
      const retryAfter = Math.ceil((windowStart + rule.windowMs - now) / 1000);
      return {
        ok: false,
        retryAfter: Math.max(1, retryAfter),
        refusal: {
          layer: layerForRule(rule, ip.startsWith("user:") ? "user" : "ip"),
          limit: rule.limit,
          windowSeconds: Math.round(rule.windowMs / 1000),
          used: current,
          remaining: 0,
          bucket: rule.bucket,
        },
      };
    }
    plans.push({ rule, windowStart, nextCount: current + 1 });
  }

  // Second pass: commit the increments.
  const write = db.prepare(
    `INSERT INTO rate_limits (bucket, ip, window_start, count) VALUES (?, ?, ?, ?)
     ON CONFLICT(bucket, ip) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`
  );
  for (const p of plans) write.run(p.rule.bucket, ip, p.windowStart, p.nextCount);

  return { ok: true, retryAfter: 0 };
}

/** Read-only view of the fixed-window counters: how many requests remain per
 *  rule for `ip`, WITHOUT incrementing anything. Backs the preflight
 *  /api/ai/status endpoint, so a status check can never consume the very budget
 *  it reports. Same window math as rateLimit(). */
export function peekRateLimit(ip: string, rules: RateRule[]): number[] {
  const db = getDb();
  const now = Date.now();
  const read = db.prepare("SELECT window_start, count FROM rate_limits WHERE bucket = ? AND ip = ?");
  return rules.map((rule) => {
    const windowStart = now - (now % rule.windowMs);
    const row = read.get(rule.bucket, ip) as { window_start: number; count: number } | undefined;
    const current = row && row.window_start >= windowStart ? row.count : 0;
    return Math.max(0, rule.limit - current);
  });
}

// --- process-level concurrency cap -----------------------------------------
// Survives Next.js dev hot-reload on globalThis (same pattern as the db handle).
const g = globalThis as unknown as { __aiInflight?: number };

/** Try to take an in-flight slot; returns false when the process is already at
 *  `max` concurrent provider calls. Pair every `true` with `releaseSlot()`. */
export function acquireSlot(max: number = MAX_CONCURRENT): boolean {
  const n = g.__aiInflight ?? 0;
  if (n >= max) return false;
  g.__aiInflight = n + 1;
  return true;
}

export function releaseSlot(): void {
  g.__aiInflight = Math.max(0, (g.__aiInflight ?? 1) - 1);
}

// --- response helpers ------------------------------------------------------

/** 429 with a `Retry-After` header.
 *
 *  `detail` completes the refusal contract: the RULE that was enforced (`limit` +
 *  `windowSeconds`), the caller's CURRENT STANDING against it (`used` /
 *  `remaining`) and WHICH of the layers refused (`layer`). All of it is ADDITIVE —
 *  the historical `{ error, code, retryAfter }` fields and the header are
 *  unchanged, and omitting `detail` reproduces the previous body byte for byte, so
 *  a client that renders only `error`/`retryAfter` is unaffected.
 *
 *  Standard `RateLimit-*` headers are deliberately NOT emitted: the retry-after
 *  header is the one the browser/client stack already understands, and inventing a
 *  second header family here would be a contract nobody reads. */
export function tooManyRequests(
  retryAfter: number,
  message: string,
  detail?: RefusalDetail
): Response {
  return Response.json(
    {
      error: message,
      code: "rate_limited",
      retryAfter,
      ...(detail
        ? {
            layer: detail.layer,
            limit: detail.limit,
            windowSeconds: detail.windowSeconds,
            ...(detail.used === undefined ? {} : { used: detail.used }),
            ...(detail.remaining === undefined ? {} : { remaining: detail.remaining }),
            ...(detail.bucket === undefined ? {} : { bucket: detail.bucket }),
          }
        : {}),
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/** 413 Payload Too Large. */
export function payloadTooLarge(message: string): Response {
  return Response.json({ error: message, code: "too_large" }, { status: 413 });
}
