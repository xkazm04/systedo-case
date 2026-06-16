/** Current per-user usage + plan limits for the signed-in user. */
import { auth } from "@/auth";
import { getUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  return Response.json(await getUsage(userId));
}
