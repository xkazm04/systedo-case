/** "Test connection" for a BYOM key: run one tiny structured generation through
 *  the vendor adapter and report whether it worked. A user fault (bad key / their
 *  account / an unavailable model) comes back with the specific message from the
 *  classifier; anything else is a generic failure. Never throws. Server-only.
 *
 *  THE SEAM AT THE BOTTOM OF THIS FILE IS THE POINT. `validateVendorKey` takes a
 *  plaintext key, so every caller of it had to hold one — and both callers were
 *  route handlers under src/app/api, one `Response.json()` away from returning a
 *  user's provider credential. That is what `plaintext-key-in-route`
 *  (scripts/sast.mjs) fires on, and .github/contract-ledger.json recorded the way
 *  out: "when validation moves behind a lib-side seam that takes the user and
 *  returns a verdict, so no module under src/app/api imports the decrypted key at
 *  all". `probeStoredByomKey` and `storeAndProbeByomKey` are that seam: they take a
 *  userId, they return a {@link ProbeOutcome}, and the decrypted key exists only
 *  inside this module's frame. */
import "server-only";
import { runByom } from "../byom/adapters";
import { ByomUserError, LlmCallError } from "../errors";
import {
  getPublicByomConfig,
  markByomValidation,
  putByomKey,
  resolveByomKey,
  setActiveByomVendor,
} from "./store";
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

// --- the seam: a user id in, a verdict out, the key never leaving this module ---

/** Re-test the key a user has already stored for `vendor`, and record the outcome.
 *  `null` means there is no stored key for that vendor — the caller's 400, not a
 *  failed probe (a failed probe is a `ProbeOutcome` with `ok: false`). */
export async function probeStoredByomKey(userId: string, vendor: ByomVendor): Promise<ProbeOutcome | null> {
  const resolved = await resolveByomKey(userId, vendor);
  if (!resolved) return null;
  const check = await validateVendorKey(vendor, resolved.apiKey, resolved.model, resolved.fastModel);
  await markByomValidation(userId, vendor, check);
  return check;
}

/** Store a vendor's key (encrypted) and immediately test exactly what was persisted.
 *
 *  Store-then-test is deliberate — we test the stored blob, not the request body —
 *  but a key that fails its test must NOT become live routing state: putByomKey
 *  auto-activates the FIRST key, so a failed test on a freshly-activated vendor turns
 *  BYOM back off (restoring the prior active vendor) rather than silently routing
 *  every generation through a known-bad key. Re-keying an already-active vendor is
 *  left as-is: the user chose it and sees the failed-test notice.
 *
 *  Throws only what `putByomKey` throws (encryption not configured); the probe itself
 *  never throws. */
export async function storeAndProbeByomKey(
  userId: string,
  vendor: ByomVendor,
  apiKey: string
): Promise<ProbeOutcome> {
  // Read the active vendor BEFORE the write that may auto-activate this one.
  const prevActive = (await getPublicByomConfig(userId)).activeVendor;
  await putByomKey(userId, vendor, apiKey);

  let check = await probeStoredByomKey(userId, vendor);
  if (!check) {
    // Stored, then unreadable (a decryption failure, or the row vanished mid-flight).
    // Record it the same way a definitive probe failure is recorded.
    check = { ok: false, error: "Uložený klíč se nepodařilo načíst." };
    await markByomValidation(userId, vendor, check);
  }
  if (!check.ok && prevActive !== vendor) {
    await setActiveByomVendor(userId, prevActive ?? null);
  }
  return check;
}
