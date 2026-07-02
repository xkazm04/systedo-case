/** Operator (admin) allowlist. There is no role system — admin status is a
 *  comma-separated ADMIN_EMAILS env allowlist, matched case-insensitively.
 *  Fails CLOSED: with no ADMIN_EMAILS set (or an empty caller email) nobody is
 *  an admin, so any operator-only surface stays locked by default. Server-only. */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** True only when `email` is non-empty and present in the ADMIN_EMAILS allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}
