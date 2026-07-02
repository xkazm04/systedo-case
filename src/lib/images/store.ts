/** Creative Studio asset library — persists generated images to Firebase Storage
 *  (bytes) plus a Firestore doc (the prompt + scoring metadata behind each image),
 *  per tenant. Server-only. Best-effort: a Storage failure is surfaced, never
 *  silently corrupts the library. */
import "server-only";
import { randomBytes } from "node:crypto";
import { firestore, storageBucket } from "@/lib/firebase";
import type { CreativeSummary } from "./types";

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
}

/** Upload the image bytes to Storage and the prompt + metadata to Firestore.
 *  Returns the new creative id. */
export async function saveCreative(tenant: string, input: SaveCreativeInput): Promise<string> {
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
    createdAt: new Date().toISOString(),
  });
  return id;
}

/** Newest creatives for the tenant's library (metadata only, no bytes). */
export async function listCreatives(tenant: string, limit = 40): Promise<CreativeSummary[]> {
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
  const doc = await creativesCol(tenant).doc(id).get();
  if (!doc.exists) return null;
  const { storagePath, mime } = doc.data() as { storagePath?: string; mime?: string };
  if (!storagePath) return null;
  const [buffer] = await storageBucket().file(storagePath).download();
  return { buffer, mime: mime ?? "image/png" };
}

/** Delete a creative the tenant owns (Storage file + Firestore doc). */
export async function deleteCreative(tenant: string, id: string): Promise<boolean> {
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
