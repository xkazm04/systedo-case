/** Deploy-mode seam (framework-free, no imports — the sibling of local-mode.ts).
 *  Design: docs/open-source/self-hosting.md §1.
 *
 *  `SELF_HOSTED=true` is an EXPLICIT operator decision, honoured in production.
 *  It does NOT enable DEV_AUTH (that stays dev-only, forever). It selects a
 *  different, real auth provider (the operator-password Credentials flow in
 *  src/auth.ts), legalises the LOCAL_DB sqlite store in a production build, and
 *  unmeters the install — the metering that exists is cost control on the
 *  operator's own provider bill, and a self-hoster pays that bill themselves.
 *
 *  Deliberately a THIRD mode rather than a loosening of the dev guards: the
 *  `NODE_ENV !== "production"` expressions this mode bypasses elsewhere also
 *  guard DEV_AUTH, and loosening them would risk re-opening a login bypass in
 *  production. Consumers each add `|| SELF_HOSTED` at their own seam instead. */

export type DeployMode = "cloud" | "self-hosted" | "dev";

/** The env keys this seam reads — structural, so pure consumers (readiness.ts,
 *  plans.ts, unit tests) can pass a plain object instead of process.env. */
export type DeployEnv = {
  SELF_HOSTED?: string;
  NODE_ENV?: string;
  ADAMANT_OPERATOR_PASSWORD?: string;
  ALLOW_OPEN?: string;
};

/** Call-time predicate (env injectable for tests; defaults to process.env). */
export function selfHosted(env: DeployEnv = process.env): boolean {
  return env.SELF_HOSTED === "true";
}

/** Module-load snapshot for consumers that are themselves module-level consts
 *  (local-mode.ts's LOCAL_DB, the auth config). */
export const SELF_HOSTED = selfHosted();

export function deployMode(env: DeployEnv = process.env): DeployMode {
  if (selfHosted(env)) return "self-hosted";
  return env.NODE_ENV === "production" ? "cloud" : "dev";
}

/** Fail-closed boot rule (self-hosting.md §1): a production build with
 *  SELF_HOSTED=true and no operator credential must refuse to boot, unless the
 *  operator explicitly opts into an open install with ALLOW_OPEN=1. "I put it on
 *  the internet with no password" has to be a decision, never an accident.
 *  Returns the fatal message, or null when boot may proceed. Pure. */
export function selfHostBootError(env: DeployEnv = process.env): string | null {
  if (!selfHosted(env) || env.NODE_ENV !== "production") return null;
  if (env.ADAMANT_OPERATOR_PASSWORD) return null;
  if (env.ALLOW_OPEN === "1") return null;
  return (
    "SELF_HOSTED=true in production with no ADAMANT_OPERATOR_PASSWORD set — refusing to boot. " +
    "Set ADAMANT_OPERATOR_PASSWORD (the operator sign-in password), or — only if you deliberately " +
    "want an install with NO authentication — set ALLOW_OPEN=1. See docs/open-source/self-hosting.md."
  );
}
