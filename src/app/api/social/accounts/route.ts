/** Connected social accounts for the signed-in user (demo connect until real
 *  Meta/LinkedIn OAuth credentials exist). GET list / POST connect / DELETE.
 *  Writes are authed-only and per-user rate-limited. */
import { currentUserId } from "@/lib/session";
import { enforceUserRate } from "@/lib/api/route-utils";
import { SOCIAL_RATE } from "@/lib/social/rails";
import {
  connectAccount,
  disconnectAccount,
  listAccounts,
  socialConfigured,
} from "@/lib/social/connection";
import { isSocialPlatform } from "@/lib/social/types";


export async function GET() {
  const uid = await currentUserId();
  if (!uid) return Response.json({ configured: socialConfigured(), accounts: [] });
  return Response.json({ configured: socialConfigured(), accounts: await listAccounts(uid) });
}

export async function POST(request: Request) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  // Per-user write rail — connect touches token crypto + the connection store.
  const limited = enforceUserRate(uid, SOCIAL_RATE.accountsPerMin(), "Příliš mnoho požadavků. Zkuste to prosím za chvíli.");
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { platform?: unknown; token?: unknown };
  const platform = body?.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  // Optional OAuth token (additive): when supplied with configured credentials the
  // connection becomes real and the token is encrypted at rest; absent → a demo connect.
  const token = typeof body?.token === "string" ? body.token : undefined;
  await connectAccount(uid, platform, token ? { token } : {});
  return Response.json({ accounts: await listAccounts(uid) });
}

export async function DELETE(request: Request) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  // Same per-user write rail as POST.
  const limited = enforceUserRate(uid, SOCIAL_RATE.accountsPerMin(), "Příliš mnoho požadavků. Zkuste to prosím za chvíli.");
  if (limited) return limited;
  const platform = (await request.json().catch(() => ({})))?.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  await disconnectAccount(uid, platform);
  return Response.json({ accounts: await listAccounts(uid) });
}
