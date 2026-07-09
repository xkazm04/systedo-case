/** Current per-user usage + plan limits for the signed-in user. */
import { currentUserId } from "@/lib/session";
import { getUsage } from "@/lib/usage";


export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  return Response.json(await getUsage(userId));
}
