/** Connected social accounts for the signed-in user (demo connect until real
 *  Meta/LinkedIn OAuth credentials exist). GET list / POST connect / DELETE. */
import { auth } from "@/auth";
import {
  connectAccount,
  disconnectAccount,
  listAccounts,
  socialConfigured,
} from "@/lib/social/connection";
import { isSocialPlatform } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function userId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return Response.json({ configured: socialConfigured(), accounts: [] });
  return Response.json({ configured: socialConfigured(), accounts: await listAccounts(uid) });
}

export async function POST(request: Request) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const platform = (await request.json().catch(() => ({})))?.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  await connectAccount(uid, platform);
  return Response.json({ accounts: await listAccounts(uid) });
}

export async function DELETE(request: Request) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const platform = (await request.json().catch(() => ({})))?.platform;
  if (!isSocialPlatform(platform)) return Response.json({ error: "Neplatná platforma." }, { status: 422 });
  await disconnectAccount(uid, platform);
  return Response.json({ accounts: await listAccounts(uid) });
}
