/** Account security checklist — derives an honest readiness state from what the
 *  session actually exposes. dev-auth sessions have no Firestore-backed user /
 *  provider account, so several checks are genuinely "unavailable" rather than
 *  green. Pure & framework-free, tested. */

export type CheckState = "ok" | "action" | "unavailable";

export interface SecurityCheck {
  id: string;
  state: CheckState;
}

export interface AccountFacts {
  hasEmail: boolean;
  /** signed in via a real OAuth provider (Google) */
  oauth: boolean;
  /** synthetic dev-auth session (no real provider/session store) */
  devMode: boolean;
}

export function securityChecklist(f: AccountFacts): SecurityCheck[] {
  return [
    { id: "email", state: f.hasEmail ? "ok" : "action" },
    { id: "sso", state: f.oauth ? "ok" : f.devMode ? "unavailable" : "action" },
    { id: "session", state: f.devMode ? "unavailable" : "ok" },
    // Two-factor is delegated to the identity provider (Google), not managed here.
    { id: "twofa", state: "unavailable" },
  ];
}

/** Obscure the local part of an email for display: "michal@x.com" → "m•••@x.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  return `${local[0]}${"•".repeat(local.length - 1)}${email.slice(at)}`;
}
