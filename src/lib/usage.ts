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
import { PLANS, type Plan, type UsageKind, type UsageStatus } from "@/lib/plans";

export { PLANS };
export type { Plan, UsageKind, UsageStatus, PlanLimits } from "@/lib/plans";

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
    used: { aiEval: d.aiEval ?? 0, sync: d.sync ?? 0 },
    day,
  };
}

/** Current usage + limits for a user (no increment). */
export async function getUsage(userId: string): Promise<UsageStatus> {
  const snap = await firestore.collection("usage").doc(userId).get();
  return statusFrom((snap.data() as UsageDoc) ?? {}, dayKey());
}

/**
 * Atomically check the day's quota for `kind` and increment if room remains.
 * Returns `{ ok: false }` (without incrementing) when the limit is reached.
 * Map-merge keeps the two counters independent within the day.
 */
export async function consume(
  userId: string,
  kind: UsageKind
): Promise<{ ok: boolean; status: UsageStatus }> {
  const ref = firestore.collection("usage").doc(userId);
  const day = dayKey();

  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() as UsageDoc) ?? {};
    const plan = data.plan ?? "free";
    const current = data.days?.[day]?.[kind] ?? 0;

    if (current >= PLANS[plan][kind]) {
      return { ok: false, status: statusFrom(data, day) };
    }

    tx.set(ref, { plan, days: { [day]: { [kind]: current + 1 } } }, { merge: true });

    const next: UsageDoc = {
      ...data,
      plan,
      days: { ...data.days, [day]: { ...data.days?.[day], [kind]: current + 1 } },
    };
    return { ok: true, status: statusFrom(next, day) };
  });
}
