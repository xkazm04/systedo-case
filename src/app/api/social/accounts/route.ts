/** Connected social accounts for the signed-in user (demo connect until real
 *  Meta/LinkedIn OAuth credentials exist). GET list / POST connect / DELETE. */
import { currentUserId } from "@/lib/session";
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
  const platform = (await request.json().catch(() => ({})))?.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  await connectAccount(uid, platform);
  return Response.json({ accounts: await listAccounts(uid) });
}

export async function DELETE(request: Request) {
  const uid = await currentUserId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const platform = (await request.json().catch(() => ({})))?.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  await disconnectAccount(uid, platform);
  return Response.json({ accounts: await listAccounts(uid) });
}
