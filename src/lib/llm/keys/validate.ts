/** "Test connection" for a BYOM key: run one tiny structured generation through
 *  the vendor adapter and report whether it worked. A user fault (bad key / their
 *  account / an unavailable model) comes back with the specific message from the
 *  classifier; anything else is a generic failure. Never throws. Server-only. */
import "server-only";
import { runByom } from "../byom/adapters";
import { ByomUserError, LlmCallError } from "../errors";
import type { ByomVendor } from "./types";

/** The outcome of a probe. `transient: true` marks an INCONCLUSIVE failure (provider
 *  outage / throttle / timeout / transport / unusable response) — it proves nothing
 *  about the key, so callers must NOT sticky-disable the key on it. Only a real
 *  user-fault (`ByomUserError`) is a definitive "this key/account/model is bad". */
export interface ProbeOutcome {
  ok: boolean;
  error?: string;
  transient?: boolean;
}

/** Classify a "test connection" failure. A ByomUserError (bad key / no permission /
 *  exhausted account / unavailable model) is the ONLY signal worth sticking to the
 *  key so generation skips it. Everything else — a provider 5xx, a 429 throttle, a
 *  timeout, a fetch reject, an unusable probe response — is inconclusive: benching a
 *  healthy key over a momentary blip is exactly the sticky-failure bug. Pure/testable. */
export function classifyProbeError(e: unknown): ProbeOutcome {
  if (e instanceof ByomUserError) return { ok: false, error: e.message };
  if (e instanceof LlmCallError) return { ok: false, error: e.message, transient: true };
  return { ok: false, error: e instanceof Error ? e.message : "Test spojení se nezdařil.", transient: true };
}

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
): Promise<ProbeOutcome> {
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
    return classifyProbeError(e);
  }
}
