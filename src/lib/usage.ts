/** Per-user usage metering + plan limits (Firestore, server-only). A signed-in
 *  user has a daily quota of paid actions (AI evaluations, Google Ads syncs) by
 *  plan; `consume()` atomically checks + increments. Anonymous traffic isn't
 *  metered here — it's covered by the per-IP rate limiter (src/lib/ai/rate-limit).
 *
 *  Stored at `usage/{userId}` = { plan, days: { 'YYYY-MM-DD': { aiEval, sync } } }.
 *  Monetization (upgrading the `plan` field, e.g. via Stripe) is a thin layer on
 *  top — not included here. The plan catalogue + usage shapes live in the pure
 *  `plans.ts` so the UI can import them without firebase-admin. */
import { firestore } from "@/lib/firebase";
import { LOCAL_DB } from "@/lib/local-mode";
import { PLANS, planHasByom, type Plan, type UsageKind, type UsageStatus } from "@/lib/plans";

interface UsageDoc {
  plan?: Plan;
  days?: Record<string, Partial<Record<UsageKind, number>>>;
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusFrom(data: UsageDoc, day: string): UsageStatus {
  const plan = data.plan ?? "free";
  const d = data.days?.[day] ?? {};
  return {
    plan,
    limits: PLANS[plan],
    used: { aiEval: d.aiEval ?? 0, sync: d.sync ?? 0, image: d.image ?? 0 },
    day,
  };
}

/** Current usage + limits for a user (no increment). */
export async function getUsage(userId: string): Promise<UsageStatus> {
  // Offline dev (LOCAL_DB) has no Firestore/Google ADC — metering would throw and
  // silently drop every AI generation to its template (BM-L2-01). Serve a local
  // free-plan status instead; the per-IP rate limiter still bounds abuse.
  if (LOCAL_DB) return statusFrom({ plan: "free" }, dayKey());
  const snap = await firestore.collection("usage").doc(userId).get();
  return statusFrom((snap.data() as UsageDoc) ?? {}, dayKey());
}

/** Just the user's plan (one read), for entitlement checks that don't need the
 *  full usage status — e.g. gating BYOM on the byom plan. Defaults to "free". */
export async function getUserPlan(userId: string): Promise<Plan> {
  if (LOCAL_DB) return "free";
  const snap = await firestore.collection("usage").doc(userId).get();
  return (snap.data() as UsageDoc)?.plan ?? "free";
}

/** BYOM (and the per-operation matrix) is unlocked for a byom-plan user, OR in any
 *  environment with the `BYOM_MATRIX=true` dev flag set — the "development flag OR
 *  billing plan" gate. Reads env, so server-only (kept out of the pure plans.ts). */
export function byomUnlocked(plan: Plan): boolean {
  return planHasByom(plan) || process.env.BYOM_MATRIX === "true";
}

/**
 * Atomically check the day's quota for `kind` and increment by `amount` if room
 * remains for the whole amount. Returns `{ ok: false }` (without incrementing)
 * when the increment would exceed the plan limit. `amount` lets one request that
 * does N paid units (e.g. an image set of N candidates = N Leonardo gens + N
 * vision calls) charge all N atomically; it defaults to 1, so existing single-unit
 * callers are unchanged (current + 1 > limit ⟺ current >= limit). Map-merge keeps
 * the counters independent within the day.
 */
export async function consume(
  userId: string,
  kind: UsageKind,
  amount = 1
): Promise<{ ok: boolean; status: UsageStatus }> {
  const day = dayKey();
  const charge = Math.max(1, Math.floor(amount));

  // Offline dev (LOCAL_DB): no Firestore transaction — grant the charge so AI
  // surfaces actually generate locally (the per-IP limiter still applies). Without
  // this, the metering read throws on missing ADC and the UI silently keeps its
  // non-AI template, which reads like success (BM-L2-01).
  if (LOCAL_DB) return { ok: true, status: statusFrom({ plan: "free" }, day) };

  const ref = firestore.collection("usage").doc(userId);

  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() as UsageDoc) ?? {};
    const plan = data.plan ?? "free";
    const current = data.days?.[day]?.[kind] ?? 0;

    if (current + charge > PLANS[plan][kind]) {
      return { ok: false, status: statusFrom(data, day) };
    }

    const nextCount = current + charge;
    tx.set(ref, { plan, days: { [day]: { [kind]: nextCount } } }, { merge: true });

    const next: UsageDoc = {
      ...data,
      plan,
      days: { ...data.days, [day]: { ...data.days?.[day], [kind]: nextCount } },
    };
    return { ok: true, status: statusFrom(next, day) };
  });
}

/**
 * Compensating reverse of `consume`: atomically decrement the day's `kind` counter
 * by `amount`, floored at 0. Use it to keep the ledger honest when a charge was
 * taken up front but the paid work then failed or silently degraded to a free
 * deterministic fallback (a provider outage, a demo/no-key result, a placeholder
 * image set) — so a user is never billed daily quota for output that cost the app
 * nothing. Best-effort and never throws to the caller: a refund failing must not
 * turn a already-degraded response into a 500. No-op in LOCAL_DB (consume grants
 * freely there) and when `amount <= 0`.
 */
export async function refund(userId: string, kind: UsageKind, amount = 1): Promise<void> {
  const credit = Math.max(0, Math.floor(amount));
  if (LOCAL_DB || credit === 0) return;
  const day = dayKey();
  const ref = firestore.collection("usage").doc(userId);
  try {
    await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = (snap.data() as UsageDoc) ?? {};
      const current = data.days?.[day]?.[kind] ?? 0;
      const next = Math.max(0, current - credit);
      if (next === current) return;
      tx.set(ref, { days: { [day]: { [kind]: next } } }, { merge: true });
    });
  } catch (err) {
    console.error(`[usage] refund(${kind}, ${credit}) failed for ${userId}:`, err);
  }
}
