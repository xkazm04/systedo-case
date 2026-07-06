/** "Test connection" for a BYOM key: run one tiny structured generation through
 *  the vendor adapter and report whether it worked. A user fault (bad key / their
 *  account / an unavailable model) comes back with the specific message from the
 *  classifier; anything else is a generic failure. Never throws. Server-only. */
import "server-only";
import { runByom } from "../byom/adapters";
import { ByomUserError } from "../errors";
import type { ByomVendor } from "./types";

/** Minimal schema (Google-`Type` form, as the tools use) for the probe call. */
const PROBE_SCHEMA = {
  type: "OBJECT",
  properties: { ok: { type: "BOOLEAN" } },
  required: ["ok"],
};

export async function validateVendorKey(
  vendor: ByomVendor,
  apiKey: string,
  model?: string,
  fastModel?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await runByom(
      { vendor, apiKey, ...(model ? { model } : {}), ...(fastModel ? { fastModel } : {}) },
      {
        system: "Test spojení. Odpovídej stručně.",
        prompt: 'Vrať přesně tento JSON: {"ok": true}.',
        schema: PROBE_SCHEMA,
      }
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof ByomUserError) return { ok: false, error: e.message };
    return { ok: false, error: e instanceof Error ? e.message : "Test spojení se nezdařil." };
  }
}
