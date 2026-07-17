/** Persist creative-to-revenue attribution per tenant
 *  (tenants/{tenant}/creativeAttribution/{id}). Server-only — the pure model +
 *  scoring live in ./attribution-types so client code can import them without
 *  firebase-admin. getStylePrior() is the seam the generation route reads to bias
 *  the next image set toward styles that actually earn. */
import { firestore } from "@/lib/firebase";
import {
  styleLeaderboard,
  deriveStylePrior,
  type CreativeLink,
  type CreativeMetrics,
  type StylePrior,
} from "./attribution-types";
import { isImageStyle, type ImageStyle } from "./types";

function attrCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("creativeAttribution");
}

export async function listCreativeLinks(tenant: string): Promise<CreativeLink[]> {
  try {
    const snap = await attrCol(tenant).orderBy("createdAt", "desc").get();
    return (
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<CreativeLink, "id">) }))
        // Defensively drop style-less docs: a stale-linkId PATCH used to upsert a
        // metric-only phantom row (no style/format/prompt); such rows have an
        // `undefined` style bucket and would skew styleLeaderboard/deriveStylePrior.
        .filter((l) => isImageStyle(l.style))
    );
  } catch (err) {
    console.error(`[attribution] list failed for ${tenant}:`, err);
    return [];
  }
}

export async function recordCreativeLink(
  tenant: string,
  input: {
    creativeId?: string | null;
    style: ImageStyle;
    format: string;
    prompt: string;
    visionScore?: number | null;
    campaignId?: string | null;
    campaignName?: string | null;
    metrics?: CreativeMetrics | null;
  }
): Promise<CreativeLink> {
  const doc: Omit<CreativeLink, "id"> = {
    creativeId: input.creativeId ?? null,
    style: input.style,
    format: input.format,
    prompt: input.prompt,
    visionScore: input.visionScore ?? null,
    campaignId: input.campaignId ?? null,
    campaignName: input.campaignName ?? null,
    metrics: input.metrics ?? null,
    createdAt: new Date().toISOString(),
  };
  const ref = await attrCol(tenant).add(doc);
  return { id: ref.id, ...doc };
}

/** Set a link's metrics. Returns false when the link doesn't exist so the route
 *  can 404 instead of silently upserting a phantom, style-less row (Firestore
 *  set(merge) is upsert, not update) that would poison the leaderboard. */
export async function updateCreativeMetrics(
  tenant: string,
  linkId: string,
  metrics: CreativeMetrics
): Promise<boolean> {
  const ref = attrCol(tenant).doc(linkId);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.update({ metrics });
  return true;
}

export async function deleteCreativeLink(tenant: string, linkId: string): Promise<void> {
  await attrCol(tenant).doc(linkId).delete();
}

/** The current style prior for a tenant — read by the generation route to bias
 *  the next prompt toward the best-earning style. Empty when there's no signal. */
export async function getStylePrior(tenant: string): Promise<StylePrior> {
  const links = await listCreativeLinks(tenant);
  if (links.length === 0) return { style: null, hint: "" };
  return deriveStylePrior(styleLeaderboard(links));
}
