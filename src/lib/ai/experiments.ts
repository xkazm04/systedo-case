/** Persist A/B ad experiments per tenant (tenants/{tenant}/experiments/{id}).
 *  Server-only — the pure model + scoring live in ./experiment-types so client
 *  code can import them without firebase-admin. The winner is recomputed
 *  (pickWinner) on every mutation so it never drifts from the variants. */
import { firestore } from "@/lib/firebase";
import type { AdResult } from "@/lib/ai-types";
import {
  pickWinner,
  type AdVariant,
  type AdVariantMetrics,
  type Experiment,
} from "./experiment-types";

function expCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("experiments");
}

/** Strip undefined so Firestore (which rejects it) always gets a clean doc. */
function persist(exp: Experiment): Omit<Experiment, "id"> {
  const { id: _id, ...rest } = exp;
  void _id;
  return { ...rest, winnerVariantId: pickWinner(exp) };
}

export async function listExperiments(tenant: string): Promise<Experiment[]> {
  const snap = await expCol(tenant).orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Experiment, "id">) }));
}

async function findByName(tenant: string, name: string): Promise<Experiment | null> {
  const target = name.trim().toLowerCase();
  const all = await listExperiments(tenant);
  return all.find((e) => e.name.trim().toLowerCase() === target) ?? null;
}

/** Deterministic doc id for an experiment name — injective with findByName's
 *  trim+lowercase equivalence (so two names that findByName treats as the same map
 *  to the same id, and distinct names never collide). Lets two concurrent first-saves
 *  of one name transact on the SAME ref and collapse into one doc, instead of forking
 *  via `.add()`. Firestore-safe (encodeURIComponent escapes `/`). */
function expIdForName(name: string): string {
  return encodeURIComponent(name.trim().toLowerCase() || "a/b test");
}

/** Add a variant to the experiment with this name (created if absent), so two
 *  ads saved under the same name land in one A/B test. Returns the experiment.
 *  Atomic: the read-append-write runs in a transaction so concurrent saves compose
 *  instead of the last writer clobbering the whole variants array. */
export async function upsertExperimentVariant(
  tenant: string,
  name: string,
  variant: { label?: string; ad: AdResult; strength: number }
): Promise<Experiment> {
  const now = new Date().toISOString();

  const makeVariant = (count: number): AdVariant => ({
    id: `v_${now.replace(/\D/g, "").slice(-10)}_${count}`,
    label: variant.label?.trim() || `Varianta ${count + 1}`,
    ad: variant.ad,
    strength: Math.max(0, Math.min(100, Math.round(variant.strength))),
    metrics: null,
  });

  // Prefer an existing doc (any id scheme — legacy random `.add()` ids stay findable);
  // otherwise target the deterministic name-derived id so a concurrent create collapses.
  const existing = await findByName(tenant, name);
  const ref = expCol(tenant).doc(existing?.id ?? expIdForName(name));

  const saved = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const cur = { id: ref.id, ...(snap.data() as Omit<Experiment, "id">) };
      const variants = [...cur.variants, makeVariant(cur.variants.length)];
      const updated: Experiment = { ...cur, variants, updatedAt: now };
      tx.set(ref, persist(updated), { merge: true });
      return updated;
    }
    const draft: Experiment = {
      id: ref.id,
      name: name.trim() || "A/B test",
      createdAt: now,
      updatedAt: now,
      variants: [makeVariant(0)],
      winnerVariantId: null,
    };
    tx.set(ref, persist(draft));
    return draft;
  });

  return { ...saved, winnerVariantId: pickWinner(saved) };
}

/** Set/replace one variant's measured performance and recompute the winner.
 *  Returns null when the experiment is missing OR the variantId matches no variant
 *  (so the route can 404 instead of reporting a silent no-op success). Transactional
 *  so a concurrent variant add/metrics write can't clobber the array. */
export async function updateVariantMetrics(
  tenant: string,
  experimentId: string,
  variantId: string,
  metrics: AdVariantMetrics
): Promise<Experiment | null> {
  const ref = expCol(tenant).doc(experimentId);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const exp = { id: experimentId, ...(snap.data() as Omit<Experiment, "id">) };
    if (!exp.variants.some((v) => v.id === variantId)) return null;
    const variants = exp.variants.map((v) => (v.id === variantId ? { ...v, metrics } : v));
    const updated: Experiment = { ...exp, variants, updatedAt: new Date().toISOString() };
    tx.set(ref, persist(updated), { merge: true });
    return { ...updated, winnerVariantId: pickWinner(updated) };
  });
}

export async function deleteExperiment(tenant: string, experimentId: string): Promise<void> {
  await expCol(tenant).doc(experimentId).delete();
}
