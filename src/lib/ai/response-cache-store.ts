/** Durable L2 for the /api/ai response cache — backend dispatcher. Local node:sqlite
 *  when LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. This is the SECOND tier behind the
 *  process-local L1 (src/lib/ai/response-cache.ts): consulted only on an L1 miss so an
 *  identical request served on another instance (or after a deploy) can reuse a recent
 *  result instead of re-paying a model call.
 *
 *  Best-effort BY CONTRACT: every method here swallows a store error to a safe default
 *  (read → null, write → no-op) so a cache backend hiccup NEVER fails an AI response —
 *  the cache is an optimisation, not a dependency. Mirrors recaps/store.ts +
 *  twin/archive-store.ts. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { AiResponse } from "@/lib/ai-types";

/** Per-tool durable entry cap (oldest-evicted on write). The key space is the sha256
 *  input hash, so this bounds how many distinct recent inputs each tool keeps warm in
 *  the shared store; well above the L1 cap so the durable tier is the wider net. */
export const L2_MAX_PER_TOOL = 500;

/** One durable cache entry: the stored AiResponse + its epoch-ms expiry. */
export interface CacheEntry {
  value: AiResponse<unknown>;
  /** epoch ms after which the entry is stale and must not be served */
  expires: number;
}

function backend() {
  return LOCAL_DB
    ? import("./response-cache-store.local")
    : import("./response-cache-store.firestore");
}

/** Read a durable entry by key, or null (missing / expired / any store error). Never
 *  throws — an L2 read failure degrades to an L1-miss-style cache miss. */
export async function readDurable(key: string): Promise<CacheEntry | null> {
  try {
    return await (await backend()).readDurable(key);
  } catch (err) {
    console.error("[ai-cache] L2 read failed (degrading to miss):", err);
    return null;
  }
}

/** Upsert a durable entry and enforce the per-tool cap. Never throws — an L2 write
 *  failure drops the durable copy silently (L1 already served the value). */
export async function writeDurable(tool: string, key: string, entry: CacheEntry): Promise<void> {
  try {
    await (await backend()).writeDurable(tool, key, entry);
  } catch (err) {
    console.error("[ai-cache] L2 write failed (dropped):", err);
  }
}
