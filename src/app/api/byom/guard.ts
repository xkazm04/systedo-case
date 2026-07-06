/** Shared auth + entitlement gate for the BYOM settings routes. Not a route file
 *  (app router only mounts `route.ts`), just a helper the sibling routes import.
 *  Server-only. */
import { auth } from "@/auth";
import { byomUnlocked, getUserPlan } from "@/lib/usage";

async function currentUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

/** The signed-in user's id, or a 401 Response to return. */
export async function requireUser(): Promise<{ userId: string } | Response> {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno.", code: "invalid" }, { status: 401 });
  return { userId };
}

/** A signed-in user on the BYOM plan, or a 401/403 Response. Managing keys
 *  requires the entitlement; reads and deletes do not (see the individual routes). */
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
