/** In-app alert inbox for the signed-in user's tenant:
 *   GET  → newest alerts + unread count
 *   POST → mark one alert (by id) or all as read; or {action:"acknowledge", id}
 *          to advance one alert's workflow status to acknowledged.
 *  Staging a change-set from an alert (and the resolution back-reference) goes
 *  through /api/campaigns/control-plane, which owns change-set creation. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listAlerts, markAlertsRead, acknowledgeAlert } from "@/lib/campaigns/alerts";


export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ alerts: [], unread: 0 });

  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId);
  const alerts = await listAlerts(tenant);
  const unread = alerts.filter((a) => !a.read).length;
  return Response.json({ alerts, unread });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let id: string | undefined;
  let projectId: string | undefined;
  let action: string | undefined;
  try {
    const body = (await request.json()) as {
      id?: unknown;
      projectId?: unknown;
      action?: unknown;
    };
    if (typeof body.id === "string") id = body.id;
    if (typeof body.projectId === "string") projectId = body.projectId;
    if (typeof body.action === "string") action = body.action;
  } catch {
    /* no body → mark all read */
  }

  const tenant = await resolveTenant(userId, projectId);

  if (action === "acknowledge") {
    if (!id) return Response.json({ error: "Chybí ID upozornění." }, { status: 422 });
    await acknowledgeAlert(tenant, id);
    return Response.json({ ok: true });
  }

  await markAlertsRead(tenant, id);
  return Response.json({ ok: true });
}
