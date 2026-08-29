/** POST /api/sken/claim — park an anonymous visitor's own scan under a token.
 *
 *  DELIBERATELY ANONYMOUS, and the ONLY route in the app that is. It exists because
 *  of one unavoidable gap in the public `/sken` flow: the visitor has a result they
 *  want to keep, no account to keep it on, and an OAuth round-trip about to destroy
 *  every piece of client state. So the SANITIZED profile is parked server-side, the
 *  128-bit token rides the `callbackUrl`, and /api/sken/redeem — which DOES demand a
 *  signed-in session — turns it into a project the SIGNED-IN caller owns (ADR-0002:
 *  the identity comes from the session there, never from anything stored here).
 *
 *  What that means for the sast `route-auth` rule (allowlisted with this reason):
 *  there is no caller identity to establish, and nothing here reads or writes tenant
 *  data. The blob is the visitor's own scan output, addressable only by a token they
 *  alone hold. What bounds it instead:
 *   - a 32 KB body cap checked BEFORE the body is read (SCAN_CLAIM_MAX_BODY);
 *   - the same per-IP daily allowance the scan itself gets (RATE_RULES.skenPerDay
 *     via durableGuard), so a caller cannot mint more claims than they can scan;
 *   - no AI spend, no provider call, no `spendUnits` charge;
 *   - `sanitizeScanProfile`, so only bounded, known fields are ever persisted — the
 *     raw fetched page text never reaches the store.
 *  Rows self-expire after SCAN_CLAIM_TTL_DAYS and are pruned opportunistically. */
import { createScanClaim } from "@/lib/onboarding/claim-store";
import { SCAN_CLAIM_MAX_BODY } from "@/lib/onboarding/claim-token";
import { sanitizeScanProfile } from "@/lib/onboarding/types";
import { clientIp, payloadTooLarge, tooLarge } from "@/lib/ai/rate-limit";
import { guardSkenDaily } from "@/lib/onboarding/sken-guard";
import { readJson, unprocessable } from "@/lib/api/route-utils";

export async function POST(request: Request) {
  if (tooLarge(request, SCAN_CLAIM_MAX_BODY)) {
    return payloadTooLarge("Výsledek skenu je příliš velký.");
  }

  const limited = await guardSkenDaily({ ip: clientIp(request) });
  if (limited) return limited;

  const body = await readJson<{ scan?: unknown; scannedUrl?: unknown }>(request);
  const scannedUrl = typeof body?.scannedUrl === "string" ? body.scannedUrl : "";
  // The URL the visitor scanned is part of the profile (types.ts keeps it inside),
  // so it goes through the SAME sanitizer as everything else rather than being
  // appended afterwards — one bounded object, one place that bounds it.
  const profile = sanitizeScanProfile(
    body?.scan && typeof body.scan === "object"
      ? { ...(body.scan as Record<string, unknown>), ...(scannedUrl ? { scannedUrl } : {}) }
      : body?.scan
  );
  if (!profile) return unprocessable("Neplatný profil ze skenu.", "invalid-scan");

  const claim = await createScanClaim(profile, profile.suggestedType);
  return Response.json({ token: claim.token }, { status: 201 });
}
