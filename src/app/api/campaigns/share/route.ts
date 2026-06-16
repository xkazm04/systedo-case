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
import { canonical } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function POST() {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const tenant = await resolveTenant(userId);
  const accountName = (await getAdsConnection(userId))?.customerName ?? "Ukázkový účet";

  const token = await createSharedReport(tenant, accountName);
  if (!token) {
    return Response.json(
      { error: "Nejdřív vyhodnoťte celé portfolio (tlačítko „Vyhodnotit portfolio“)." },
      { status: 409 }
    );
  }

  return Response.json({ token, url: canonical(`/report/${token}`) });
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return Response.json({ reports: [] });

  const tenant = await resolveTenant(userId);
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
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    /* fall through to the 422 below */
  }
  if (!token) return Response.json({ error: "Chybí token odkazu." }, { status: 422 });

  const tenant = await resolveTenant(userId);
  const ok = await revokeSharedReport(tenant, token);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
