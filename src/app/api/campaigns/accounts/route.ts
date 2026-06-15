/** Google Ads account selection for the signed-in user: list the accounts their
 *  Google login can access (GET), choose one to sync (POST), or disconnect (DELETE).
 *  The selection is stored per-user in Firestore and drives the live connector. */
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getUserAccessToken } from "@/lib/google/token";
import {
  adsConfigured,
  getAccountName,
  listAccessibleCustomers,
  type AdsAccount,
} from "@/lib/google/ads";
import {
  clearAdsConnection,
  getAdsConnection,
  setAdsConnection,
} from "@/lib/campaigns/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function userIdOf(session: Session | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const userId = userIdOf(await auth());
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const connection = await getAdsConnection(userId);

  // Without a developer token the Ads API can't be called at all — report that so
  // the UI can explain it, but still surface any previously-stored selection.
  if (!adsConfigured()) {
    return Response.json({ configured: false, accounts: [], selected: connection?.customerId ?? null });
  }

  const token = await getUserAccessToken(userId);
  if (!token) {
    return Response.json({ error: "Chybí Google autorizace (přihlaste se znovu)." }, { status: 403 });
  }

  try {
    const ids = await listAccessibleCustomers(token);
    const accounts: AdsAccount[] = await Promise.all(
      ids.slice(0, 50).map((id) => getAccountName(token, id))
    );
    return Response.json({ configured: true, accounts, selected: connection?.customerId ?? null });
  } catch (err) {
    console.error("[campaigns] listAccessibleCustomers failed:", err);
    return Response.json({ error: "Nepodařilo se načíst Google Ads účty." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const userId = userIdOf(await auth());
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: { customerId?: unknown; customerName?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const customerId = typeof body.customerId === "string" ? body.customerId.replace(/\D/g, "") : "";
  if (!customerId) return Response.json({ error: "Chybí ID účtu." }, { status: 422 });
  const customerName = typeof body.customerName === "string" ? body.customerName : customerId;

  const connection = await setAdsConnection(userId, customerId, customerName);
  return Response.json({ connection });
}

export async function DELETE() {
  const userId = userIdOf(await auth());
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  await clearAdsConnection(userId);
  return Response.json({ ok: true });
}
