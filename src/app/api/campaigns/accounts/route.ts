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
    // Token expiry is the most common degraded state. PATCH/DELETE need no Google
    // token, so pass the connected list + active id through (like the other two
    // degraded branches) — the switcher stays usable with a re-login prompt,
    // instead of reading as "your accounts are gone".
    return Response.json(
      {
        error: "Chybí Google autorizace (přihlaste se znovu).",
        configured: true,
        accounts: [],
        connected,
        active: activeCustomerId,
      },
      { status: 403 }
    );
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
  // Client-supplied name is only a fallback (capped like report-config's fields) —
  // when the Ads API is available the authoritative name is derived server-side.
  let customerName =
    (typeof body.customerName === "string" ? body.customerName.trim().slice(0, 80) : "") ||
    customerId;

  // Connecting an account makes it ACTIVE, and the active customerId keys the
  // tenant (resolveTenant/resolveCampaignContext) — so a phantom/foreign id flips
  // the user's whole tenant view. Verify against the same authoritative
  // accessible-ids list GET builds before persisting anything.
  if (adsConfigured()) {
    const token = await getUserAccessToken(userId);
    if (!token) {
      return Response.json({ error: "Chybí Google autorizace (přihlaste se znovu)." }, { status: 403 });
    }
    let ids: string[];
    try {
      ids = await listAccessibleCustomers(token);
    } catch (err) {
      console.error("[campaigns] connect: listAccessibleCustomers failed:", err);
      return Response.json({ error: "Nepodařilo se ověřit Google Ads účet." }, { status: 502 });
    }
    if (!ids.includes(customerId)) {
      return Response.json(
        { error: "Tento Google Ads účet není dostupný pro vaše přihlášení." },
        { status: 422 }
      );
    }
    try {
      customerName = (await getAccountName(token, customerId)).name || customerName;
    } catch {
      /* name lookup is cosmetic — keep the capped fallback */
    }
  }

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
