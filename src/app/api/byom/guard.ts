/** Shared auth + entitlement gate for the BYOM settings routes. Not a route file
 *  (app router only mounts `route.ts`), just a helper the sibling routes import.
 *  Server-only.
 *
 *  Machine-readable `code` envelope shared by all BYOM routes, so a client can
 *  switch on it instead of string-matching Czech error copy:
 *    unauthenticated  401 — sign in again
 *    forbidden        403 — signed in but not entitled (upgrade)
 *    invalid          400 — the caller's request is malformed / references bad data
 *    server_error     500 — our fault (missing crypto config, store failure) */
import { currentUserId } from "@/lib/session";
import { byomUnlocked, getUserPlan } from "@/lib/usage";

/** The signed-in user's id, or a 401 Response to return. */
export async function requireUser(): Promise<{ userId: string } | Response> {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno.", code: "unauthenticated" }, { status: 401 });
  return { userId };
}

/** A signed-in user on the BYOM plan, or a 401/403 Response. Managing keys
 *  requires the entitlement; reads and deletes do not (see the individual routes).
 *
 *  DEV BYPASS: in NON-production environments the `BYOM_MATRIX=true` env flag
 *  unlocks the entitlement for every signed-in user (byomUnlocked → the pure
 *  devByomUnlockActive gate in plans.ts). It is hard-gated off under
 *  NODE_ENV=production, so it cannot void the paid plan in a real deployment. */
export async function requireByomUser(): Promise<{ userId: string } | Response> {
  const u = await requireUser();
  if (u instanceof Response) return u;
  if (!byomUnlocked(await getUserPlan(u.userId))) {
    return Response.json(
      {
        error: "Vlastní klíče jsou součástí plánu Vlastní klíč. Aktivujte jej v ceníku.",
        code: "forbidden",
        upgradeUrl: "/cena",
      },
      { status: 403 }
    );
  }
  return u;
}
