/** Social comms inbox: list inbound comments/DMs (sample-seeded) and send an
 *  (approved) reply. Per-tenant; replies are simulated in demo mode. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { rejectUnknownProject } from "@/lib/projects/api-guard";
import { listMessages, markReplied } from "@/lib/social/store";
import { publishReply } from "@/lib/social/publish";
import { getAccount, getAccountToken } from "@/lib/social/connection";
import { draftReply } from "@/lib/social/draft";
import { isSocialPlatform } from "@/lib/social/types";


const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

async function tenantOf(projectId?: string | null): Promise<string> {
  const uid = await currentUserId();
  // Account-agnostic (comms inbox) — key without the Ads customerId (see social/posts).
  return resolveTenant(uid, projectId, { accountScoped: false });
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  const unknown = await rejectUnknownProject(await currentUserId(), projectId);
  if (unknown) return unknown;
  const messages = await listMessages(await tenantOf(projectId));
  // Attach a deterministic suggested reply for each open message.
  const withSuggestions = messages.map((m) => ({
    ...m,
    suggestedReply: m.status === "open" ? draftReply(m) : undefined,
  }));
  return Response.json({ messages: withSuggestions });
}

export async function POST(request: Request) {
  let body: { id?: unknown; reply?: unknown; platform?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const id = str(body.id);
  const reply = str(body.reply);
  if (!id || !reply) return Response.json({ error: "Chybí zpráva nebo odpověď." }, { status: 422 });

  const projectId = str(body.projectId) || null;
  const unknown = await rejectUnknownProject(await currentUserId(), projectId);
  if (unknown) return unknown;
  const tenant = await tenantOf(projectId);
  // Nothing has left the app unless a real adapter delivered it — so the recorded
  // reply defaults to simulated (the Inbox labels it honestly, like PostsList's
  // "Simulované publikování" for posts).
  let simulated = true;
  if (isSocialPlatform(body.platform)) {
    // Same seam as post publishing: real when the account is connected with a token,
    // an honest no-op simulation otherwise.
    const uid = await currentUserId();
    const account = uid ? await getAccount(uid, body.platform) : null;
    const token = uid && account && !account.demo ? await getAccountToken(uid, body.platform) : null;
    const result = await publishReply(body.platform, id, reply, { account, token });
    // A REAL delivery that failed must not be recorded as replied — nothing was
    // sent. (Unreachable today: no adapter implements reply, so every path is a
    // successful simulation; the guard is for the first real adapter.)
    if (!result.ok) {
      return Response.json({ error: result.error ?? "Odpověď se nepodařilo odeslat." }, { status: 502 });
    }
    simulated = result.simulated;
  }
  const ok = await markReplied(tenant, id, reply, { simulated });
  return Response.json({ ok, simulated }, { status: ok ? 200 : 404 });
}
