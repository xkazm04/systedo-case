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

/** Add a variant to the experiment with this name (created if absent), so two
 *  ads saved under the same name land in one A/B test. Returns the experiment. */
export async function upsertExperimentVariant(
  tenant: string,
  name: string,
  variant: { label?: string; ad: AdResult; strength: number }
): Promise<Experiment> {
  const now = new Date().toISOString();
  const existing = await findByName(tenant, name);

  const makeVariant = (count: number): AdVariant => ({
    id: `v_${now.replace(/\D/g, "").slice(-10)}_${count}`,
    label: variant.label?.trim() || `Varianta ${count + 1}`,
    ad: variant.ad,
    strength: Math.max(0, Math.min(100, Math.round(variant.strength))),
    metrics: null,
  });

  if (existing) {
    const variants = [...existing.variants, makeVariant(existing.variants.length)];
    const updated: Experiment = { ...existing, variants, updatedAt: now };
    await expCol(tenant).doc(existing.id).set(persist(updated), { merge: true });
    return { ...updated, winnerVariantId: pickWinner(updated) };
  }

  const draft: Experiment = {
    id: "",
    name: name.trim() || "A/B test",
    createdAt: now,
    updatedAt: now,
    variants: [makeVariant(0)],
    winnerVariantId: null,
  };
  const ref = await expCol(tenant).add(persist(draft));
  return { ...draft, id: ref.id, winnerVariantId: pickWinner(draft) };
}

/** Set/replace one variant's measured performance and recompute the winner. */
export async function updateVariantMetrics(
  tenant: string,
  experimentId: string,
  variantId: string,
  metrics: AdVariantMetrics
): Promise<Experiment | null> {
  const ref = expCol(tenant).doc(experimentId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const exp = { id: experimentId, ...(snap.data() as Omit<Experiment, "id">) };
  const variants = exp.variants.map((v) => (v.id === variantId ? { ...v, metrics } : v));
  const updated: Experiment = { ...exp, variants, updatedAt: new Date().toISOString() };
  await ref.set(persist(updated), { merge: true });
  return { ...updated, winnerVariantId: pickWinner(updated) };
}

export async function deleteExperiment(tenant: string, experimentId: string): Promise<void> {
  await expCol(tenant).doc(experimentId).delete();
}
