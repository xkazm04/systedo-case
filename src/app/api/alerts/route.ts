/** In-app alert inbox for the signed-in user's tenant:
 *   GET  → newest alerts + unread count
 *   POST → mark one alert (by id) or all as read */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listAlerts, markAlertsRead } from "@/lib/campaigns/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return Response.json({ alerts: [], unread: 0 });

  const tenant = await resolveTenant(userId);
  const alerts = await listAlerts(tenant);
  const unread = alerts.filter((a) => !a.read).length;
  return Response.json({ alerts, unread });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let id: string | undefined;
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id === "string") id = body.id;
  } catch {
    /* no body → mark all read */
  }

  const tenant = await resolveTenant(userId);
  await markAlertsRead(tenant, id);
  return Response.json({ ok: true });
}
