/** BYOM error classification. When a call is served by the user's own provider
 *  key, we must decide — from the provider's response — whether a failure is the
 *  USER's responsibility (bad/expired key, their account out of credit, an
 *  unavailable model they picked) or OURS (a request we malformed, a provider
 *  outage). User faults surface to the user so they can fix them; our faults fall
 *  through to the app's own provider (the recoverable path in generateStructured).
 *  Server-only concern, but framework-free so it can be unit-tested in isolation. */

export type ByomUserErrorCode = "auth" | "permission" | "quota" | "model" | "invalid";

/** Thrown by a BYOM adapter when the failure is the user's to fix. The wrapper
 *  re-throws it instead of falling back, and the route maps `code` to an AiError
 *  so the client can render an actionable message (fix key / top up / pick a
 *  different model) rather than silently degrading. */
export class ByomUserError extends Error {
  readonly code: ByomUserErrorCode;
  readonly vendor: string;
  readonly status?: number;

  constructor(code: ByomUserErrorCode, vendor: string, message: string, status?: number) {
    super(message);
    this.name = "ByomUserError";
    this.code = code;
    this.vendor = vendor;
    this.status = status;
  }
}

/** Map a BYOM provider's HTTP status (+ optional body text) to a user-fault
 *  error, or `null` when the failure is recoverable and generation should fall
 *  through to the app's own provider. Kept deliberately conservative: only the
 *  statuses that clearly indicate the user's key/account/model choice are user
 *  faults; a bare 400 is treated as our malformed request unless the body names
 *  the model (some vendors reject an unavailable model with 400, not 404). */
export function classifyByomHttp(
  vendor: string,
  status: number,
  bodyText = ""
): ByomUserError | null {
  switch (status) {
    case 401:
      return new ByomUserError("auth", vendor, `Neplatný nebo chybějící API klíč (${vendor}).`, status);
    case 403:
      return new ByomUserError("permission", vendor, `Klíč (${vendor}) nemá oprávnění k tomuto modelu.`, status);
    case 402:
      return new ByomUserError("quota", vendor, `Účet u ${vendor} nemá dostatečný kredit.`, status);
    case 429:
      return new ByomUserError("quota", vendor, `Vyčerpán limit nebo kredit vašeho účtu u ${vendor}.`, status);
    case 404:
      return new ByomUserError("model", vendor, `Zvolený model není u ${vendor} dostupný.`, status);
    case 400:
      if (/\bmodel\b/i.test(bodyText)) {
        return new ByomUserError("model", vendor, `Zvolený model není u ${vendor} dostupný.`, status);
      }
      return null; // otherwise our request/schema — recoverable
    default:
      return null; // 5xx and everything else — recoverable (provider-side / transient)
  }
}
