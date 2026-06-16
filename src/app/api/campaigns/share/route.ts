/** Create a shareable read-only link for the signed-in user's current portfolio
 *  evaluation. Returns the public URL. */
import { auth } from "@/auth";
import { getAdsConnection } from "@/lib/campaigns/connection";
import { resolveTenant } from "@/lib/campaigns/connector";
import { createSharedReport } from "@/lib/campaigns/shared-report";
import { canonical } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
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
