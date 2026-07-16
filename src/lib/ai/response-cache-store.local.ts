/** Durable L2 response cache — LOCAL node:sqlite backend. One row per entry in
 *  `.data/systedo.db` (table `ai_response_cache`, DDL + migration v15 in src/lib/db.ts):
 *  cache_key PK, tool (for the per-tool cap), data (the JSON AiResponse), expires +
 *  created_at (epoch ms). Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface + the twin_archive oldest-first eviction pattern. */
import { getDb } from "@/lib/db";
import { L2_MAX_PER_TOOL, type CacheEntry } from "./response-cache-store";
import type { AiResponse } from "@/lib/ai-types";

interface Row {
  data: string;
  expires: number;
}

export async function readDurable(key: string): Promise<CacheEntry | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT data, expires FROM ai_response_cache WHERE cache_key = ?")
    .get(key) as Row | undefined;
  if (!row) return null;
  if (row.expires < Date.now()) {
    // Lazy purge of the expired entry on read (keeps the table from accreting stale rows).
    db.prepare("DELETE FROM ai_response_cache WHERE cache_key = ?").run(key);
    return null;
  }
  try {
    return { value: JSON.parse(row.data) as AiResponse<unknown>, expires: row.expires };
  } catch {
    return null; // corrupt blob → miss, never break the read
  }
}

export async function writeDurable(tool: string, key: string, entry: CacheEntry): Promise<void> {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO ai_response_cache (cache_key, tool, data, expires, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (cache_key)
     DO UPDATE SET tool = excluded.tool, data = excluded.data,
                   expires = excluded.expires, created_at = excluded.created_at`
  ).run(key, tool, JSON.stringify(entry.value), entry.expires, now);

  // Eviction: keep only the newest L2_MAX_PER_TOOL entries for this tool.
  const total =
    (
      db.prepare("SELECT COUNT(*) AS n FROM ai_response_cache WHERE tool = ?").get(tool) as
        | { n: number }
        | undefined
    )?.n ?? 0;
  const evicted = total - L2_MAX_PER_TOOL;
  if (evicted > 0) {
    db.prepare(
      `DELETE FROM ai_response_cache
       WHERE cache_key IN (
         SELECT cache_key FROM ai_response_cache WHERE tool = ?
         ORDER BY created_at ASC, cache_key ASC
         LIMIT ?
       )`
    ).run(tool, evicted);
    console.warn(
      `[ai-cache] L2 cap ${L2_MAX_PER_TOOL} reached for tool ${tool}: evicted ${evicted} oldest entr${
        evicted === 1 ? "y" : "ies"
      }`
    );
  }
}
