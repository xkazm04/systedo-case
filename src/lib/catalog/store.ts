/** Project catalog store — backend dispatcher. Resolves to the local node:sqlite
 *  store when LOCAL_DB is on, else Firestore. The backend is imported LAZILY so the
 *  LOCAL_DB path never evaluates `store.firestore` (never pulls firebase-admin in).
 *  Both backends export an identical interface. Server-only.
 *
 *  SIZE ENVELOPE: both backends persist the WHOLE catalog as one JSON blob, so
 *  the Firestore backend hits its hard 1 MiB document cap while the sqlite dev
 *  backend has none — an oversized catalog would 500 only in production. To make
 *  both backends fail identically, saveOfferings asserts a serialized-byte budget
 *  BELOW the Firestore cap and throws CatalogTooLargeError past it (mirrors the
 *  project-state store's PROJECT_STATE_MAX_BYTES / ProjectStateTooLargeError). */
import { LOCAL_DB } from "@/lib/local-mode";
import type { Offering } from "./offering";

/** Serialized-catalog budget, kept under Firestore's 1 MiB (1048576 B) document cap
 *  with headroom for the doc's other fields + Firestore's own overhead. */
export const CATALOG_MAX_BYTES = 900 * 1024;

/** Thrown by saveOfferings when the catalog serializes past the budget — a typed
 *  error so callers can distinguish "too big" from a backend/network failure. */
export class CatalogTooLargeError extends Error {
  readonly bytes: number;
  constructor(bytes: number) {
    super(
      `catalog payload is ${bytes} bytes, over the ${CATALOG_MAX_BYTES}-byte budget — drop offerings before saving`
    );
    this.name = "CatalogTooLargeError";
    this.bytes = bytes;
  }
}

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved offerings, or null if it has never been saved. */
export async function listOfferings(userId: string, projectId: string): Promise<Offering[] | null> {
  return (await backend()).listOfferings(userId, projectId);
}

/** Replace the project's whole catalog. Throws CatalogTooLargeError if the
 *  serialized catalog exceeds CATALOG_MAX_BYTES, so both backends reject an
 *  oversized catalog identically instead of only Firestore failing at its
 *  1 MiB cap (and routes can surface a 4xx instead of an opaque 500). */
export async function saveOfferings(userId: string, projectId: string, offerings: Offering[]): Promise<void> {
  const bytes = Buffer.byteLength(JSON.stringify(offerings), "utf8");
  if (bytes > CATALOG_MAX_BYTES) throw new CatalogTooLargeError(bytes);
  return (await backend()).saveOfferings(userId, projectId, offerings);
}

/** Drop the project's whole catalog (→ modules fall back to the seed). */
export async function deleteCatalog(userId: string, projectId: string): Promise<void> {
  return (await backend()).deleteCatalog(userId, projectId);
}
