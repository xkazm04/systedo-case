/** Google Ads account management for the signed-in user:
 *   GET    → accounts their Google login can access + the ones they've connected + active
 *   POST   → connect an account (and make it active)
 *   PATCH  → switch which connected account is active
 *   DELETE → disconnect one account
 *  Stored per-user in Firestore; the active account drives the connector + tenant. */
import { currentUserId } from "@/lib/session";
import { getUserAccessToken } from "@/lib/google/token";
import {
  adsConfigured,
  getAccountName,
  listAccessibleCustomers,
  type AdsAccount,
} from "@/lib/google/ads";
import {
  addAccount,
  listConnectedAccounts,
  removeAccount,
  setActiveAccount,
} from "@/lib/campaigns/connection";


async function readBody(request: Request): Promise<{ customerId?: unknown; customerName?: unknown }> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const { accounts: connected, activeCustomerId } = await listConnectedAccounts(userId);

  // Without a developer token the Ads API can't list accessible accounts; still
  // return what the user already connected so the UI can manage / switch them.
  if (!adsConfigured()) {
    return Response.json({ configured: false, accounts: [], connected, active: activeCustomerId });
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
    return Response.json({ configured: true, accounts, connected, active: activeCustomerId });
  } catch (err) {
    console.error("[campaigns] listAccessibleCustomers failed:", err);
    return Response.json(
      { error: "Nepodařilo se načíst Google Ads účty.", connected, active: activeCustomerId },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const body = await readBody(request);
  const customerId = typeof body.customerId === "string" ? body.customerId.replace(/\D/g, "") : "";
  if (!customerId) return Response.json({ error: "Chybí ID účtu." }, { status: 422 });
  const customerName = typeof body.customerName === "string" ? body.customerName : customerId;

  await addAccount(userId, customerId, customerName);
  return Response.json({ ok: true, active: customerId });
}

export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const body = await readBody(request);
  const customerId = typeof body.customerId === "string" ? body.customerId.replace(/\D/g, "") : "";
  if (!customerId) return Response.json({ error: "Chybí ID účtu." }, { status: 422 });

  await setActiveAccount(userId, customerId);
  return Response.json({ ok: true, active: customerId });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  const body = await readBody(request);
  const customerId = typeof body.customerId === "string" ? body.customerId.replace(/\D/g, "") : "";
  if (!customerId) return Response.json({ error: "Chybí ID účtu." }, { status: 422 });

  await removeAccount(userId, customerId);
  return Response.json({ ok: true });
}
