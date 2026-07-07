/** Manage client-shareable report links for the signed-in user:
 *   POST   → create a link for the current portfolio evaluation (returns URL)
 *   GET    → list the user's links (copy / revoke / expiry / views)
 *   DELETE → revoke one link by token */
import { auth } from "@/auth";
import { getAdsConnection } from "@/lib/campaigns/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import {
  createSharedReport,
  listSharedReports,
  revokeSharedReport,
} from "@/lib/campaigns/shared-report";
import { getProject } from "@/lib/projects/store";
import { canonical } from "@/lib/site";


async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let projectId: string | undefined;
  try {
    const body = (await request.json()) as { projectId?: unknown };
    if (typeof body.projectId === "string") projectId = body.projectId;
  } catch {
    /* empty body is fine — no active project */
  }

  const tenant = await resolveTenant(userId, projectId);
  const project = projectId ? await getProject(userId, projectId) : null;
  const accountName = (await getAdsConnection(userId))?.customerName ?? project?.name ?? "Ukázkový účet";

  // Default the client report's brand to the project (client) brand, not the vendor.
  const token = await createSharedReport(tenant, accountName, {
    name: project?.name,
    accent: project?.accentColor,
    logo: project?.logoUrl,
  });
  if (!token) {
    return Response.json(
      { error: "Nejdřív vyhodnoťte celé portfolio (tlačítko „Vyhodnotit portfolio“)." },
      { status: 409 }
    );
  }

  return Response.json({ token, url: canonical(`/report/${token}`) });
}

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ reports: [] });

  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId);
  const reports = (await listSharedReports(tenant)).map((r) => ({
    ...r,
    url: canonical(`/report/${r.token}`),
  }));
  return Response.json({ reports });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let token = "";
  let projectId: string | undefined;
  try {
    const body = (await request.json()) as { token?: unknown; projectId?: unknown };
    token = typeof body.token === "string" ? body.token : "";
    if (typeof body.projectId === "string") projectId = body.projectId;
  } catch {
    /* fall through to the 422 below */
  }
  if (!token) return Response.json({ error: "Chybí token odkazu." }, { status: 422 });

  const tenant = await resolveTenant(userId, projectId);
  const ok = await revokeSharedReport(tenant, token);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
