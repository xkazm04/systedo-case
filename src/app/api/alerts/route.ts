/** In-app alert inbox for the signed-in user's tenant:
 *   GET  → newest alerts + unread count
 *   POST → an explicit {action}: "read" (+id) marks one alert read, "readAll"
 *          marks the whole inbox read, "acknowledge" (+id) advances one alert's
 *          workflow status. Unknown/absent actions are rejected (400) — they must
 *          NOT fall through to the destructive bulk mark-all.
 *  Staging a change-set from an alert (and the resolution back-reference) goes
 *  through /api/campaigns/control-plane, which owns change-set creation. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listAlerts, markAlertsRead, acknowledgeAlert } from "@/lib/campaigns/alerts";
import { planAlertAction } from "@/lib/campaigns/alert-actions";
import { rejectUnknownProject } from "@/lib/projects/api-guard";


export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ alerts: [], unread: 0 });

  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  // Prove the wire projectId is the caller's BEFORE it composes a tenant key — an
  // unverified id mints a fresh empty tenant rather than failing, so the inbox would
  // read "no alerts" for a typo instead of saying the project is unknown.
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId);
  const alerts = await listAlerts(tenant);
  const unread = alerts.filter((a) => !a.read).length;
  return Response.json({ alerts, unread });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let id: unknown;
  let projectId: string | undefined;
  let action: unknown;
  try {
    const body = (await request.json()) as {
      id?: unknown;
      projectId?: unknown;
      action?: unknown;
    };
    id = body.id;
    action = body.action;
    if (typeof body.projectId === "string") projectId = body.projectId;
  } catch {
    /* unreadable body → planAlertAction rejects it below (no destructive default) */
  }

  const plan = planAlertAction({ action, id });
  if ("error" in plan) return Response.json({ error: plan.error }, { status: plan.status });

  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId);

  switch (plan.kind) {
    case "acknowledge":
      await acknowledgeAlert(tenant, plan.id);
      return Response.json({ ok: true });
    case "read":
      await markAlertsRead(tenant, plan.id);
      return Response.json({ ok: true });
    case "readAll":
      await markAlertsRead(tenant);
      return Response.json({ ok: true });
  }
}
