/** Creative Studio asset library — persists generated images to Firebase Storage
 *  (bytes) plus a Firestore doc (the prompt + scoring metadata behind each image),
 *  per tenant. Server-only. Best-effort: a Storage failure is surfaced, never
 *  silently corrupts the library.
 *
 *  Offline parity — verdict: BUCKET-DEPENDENT (the image bytes live in Firebase
 *  Storage, an external blob store), so unlike the keyword/pattern/social stores
 *  this gets NO sqlite twin — a local blob store for binaries is out of scope and
 *  the wrong tool. Instead it degrades HONESTLY under LOCAL_DB: the library reads as
 *  empty (never a 500) and the calling surface shows a labeled cs/en offline notice
 *  (see IMAGE_LIBRARY_OFFLINE + IMAGE_LIBRARY_OFFLINE_NOTICE). Generation itself
 *  already needs an external provider (Leonardo) that is absent offline, so nothing
 *  reaches saveCreative in that mode anyway. */
import "server-only";
import { randomBytes } from "node:crypto";
import { firestore, storageBucket } from "@/lib/firebase";
import { LOCAL_DB } from "@/lib/local-mode";
import type { CreativeSummary } from "./types";

/** True when the asset library is unavailable because its cloud blob store can't be
 *  reached in offline (LOCAL_DB) mode — the calling surface labels this honestly
 *  rather than surfacing a 500. */
export const IMAGE_LIBRARY_OFFLINE = LOCAL_DB;

/** The honest cs/en notice a surface shows when IMAGE_LIBRARY_OFFLINE is set. */
export const IMAGE_LIBRARY_OFFLINE_NOTICE = {
  cs: "Knihovna vizuálů běží na cloudovém úložišti (Firebase Storage), které v offline režimu není dostupné. Vygenerované vizuály se zde teď neukládají.",
  en: "The visual library runs on cloud storage (Firebase Storage), which isn't reachable in offline mode. Generated visuals aren't saved here right now.",
} as const;

function creativesCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("creatives");
}

function extFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("webp")) return "webp";
  return "bin";
}

export interface SaveCreativeInput {
  buffer: Buffer;
  mime: string;
  prompt: string;
  style: string;
  format: string;
  score: number | null;
  defects: string;
  /** Leonardo generation this winner came from — persisted so the reaper keeps the
   *  generation alive (a saved winner must stay nobg-re-derivable). Absent for demo
   *  (no real generation). */
  generationId?: string;
}

/** Upload the image bytes to Storage and the prompt + metadata to Firestore.
 *  Returns the new creative id. */
export async function saveCreative(tenant: string, input: SaveCreativeInput): Promise<string> {
  // Offline: the blob store is unreachable. Fail with a clear, labeled reason
  // instead of an opaque Storage 500 — the POST route already treats a save failure
  // as non-fatal (the generated images still return, just unsaved).
  if (IMAGE_LIBRARY_OFFLINE) throw new Error(IMAGE_LIBRARY_OFFLINE_NOTICE.en);
  const id = randomBytes(12).toString("hex");
  const storagePath = `tenants/${tenant}/creatives/${id}.${extFor(input.mime)}`;

  await storageBucket()
    .file(storagePath)
    .save(input.buffer, {
      contentType: input.mime,
      // also stash the prompt as object metadata so the bytes are self-describing
      metadata: { metadata: { prompt: input.prompt.slice(0, 1000), style: input.style, format: input.format } },
    });

  await creativesCol(tenant).doc(id).set({
    prompt: input.prompt,
    style: input.style,
    format: input.format,
    score: input.score,
    defects: input.defects,
    mime: input.mime,
    storagePath,
    // additive field; the reaper reads it (collectionGroup) as its keep-list
    ...(input.generationId ? { generationId: input.generationId } : {}),
    createdAt: new Date().toISOString(),
  });
  return id;
}

function leoImagesCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("leoImages");
}

/** Record the Leonardo image ids a tenant's generation produced, so provider-side
 *  operations that take a raw image id (background removal) can verify the id
 *  belongs to the calling tenant — leonardoImageId values circulate in every
 *  generation response, so without this allowlist any caller could replay another
 *  tenant's id and read its creative back through the provider. Best-effort at the
 *  CALL SITE (a record failure must not fail the generation), strict at the check. */
export async function recordLeonardoImageIds(tenant: string, imageIds: string[]): Promise<void> {
  // Offline: no Firestore — the ownership check below fails open for the same
  // single-operator dev mode, so there is nothing to record.
  if (IMAGE_LIBRARY_OFFLINE) return;
  const createdAt = new Date().toISOString();
  await Promise.all(
    imageIds
      .filter((id) => id && !id.includes("/"))
      .map((id) => leoImagesCol(tenant).doc(id).set({ createdAt }, { merge: true }))
  );
}

/** Whether a Leonardo image id was generated by (and therefore belongs to) the
 *  tenant — see recordLeonardoImageIds. Throws on a Firestore failure so the
 *  caller fails CLOSED (a broken check must never allow a cross-tenant read). */
export async function tenantOwnsLeonardoImage(tenant: string, imageId: string): Promise<boolean> {
  // Offline (LOCAL_DB) is the explicit single-operator dev mode: Firestore is
  // unreachable, generation still works with a Leonardo key, and per-user quotas
  // are granted locally — mirroring that posture, ownership passes here too.
  if (IMAGE_LIBRARY_OFFLINE) return true;
  if (!imageId || imageId.includes("/")) return false;
  const doc = await leoImagesCol(tenant).doc(imageId).get();
  return doc.exists;
}

/** Newest creatives for the tenant's library (metadata only, no bytes). */
export async function listCreatives(tenant: string, limit = 40): Promise<CreativeSummary[]> {
  // Offline: no cloud library to read — degrade to empty (the surface shows the
  // labeled offline notice) rather than 500 on an unreachable Firestore/bucket.
  if (IMAGE_LIBRARY_OFFLINE) return [];
  const snap = await creativesCol(tenant).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id,
      prompt: r.prompt ?? "",
      style: r.style ?? "",
      format: r.format ?? "",
      score: typeof r.score === "number" ? r.score : null,
      createdAt: r.createdAt ?? "",
    };
  });
}

/** Fetch a creative's bytes from Storage (for the authenticated stream route). */
export async function getCreativeFile(
  tenant: string,
  id: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  // Offline: the bytes live in the unreachable bucket → the stream route 404s
  // (honest "not found here") instead of a 500.
  if (IMAGE_LIBRARY_OFFLINE) return null;
  const doc = await creativesCol(tenant).doc(id).get();
  if (!doc.exists) return null;
  const { storagePath, mime } = doc.data() as { storagePath?: string; mime?: string };
  if (!storagePath) return null;
  const [buffer] = await storageBucket().file(storagePath).download();
  return { buffer, mime: mime ?? "image/png" };
}

/** Delete a creative the tenant owns (Storage file + Firestore doc). */
export async function deleteCreative(tenant: string, id: string): Promise<boolean> {
  // Offline: nothing to delete in an unreachable library → not-found, never a 500.
  if (IMAGE_LIBRARY_OFFLINE) return false;
  const ref = creativesCol(tenant).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const { storagePath } = doc.data() as { storagePath?: string };
  if (storagePath) {
    try {
      await storageBucket().file(storagePath).delete();
    } catch {
      /* file may already be gone — still drop the doc */
    }
  }
  await ref.delete();
  return true;
}
