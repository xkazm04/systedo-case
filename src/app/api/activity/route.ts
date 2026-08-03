/** In-app activity feed for the signed-in user's tenant:
 *   GET  → newest activity (applied changes, syncs, alerts, reports)
 *   POST → record that an AI-generated asset left the app (export/copy)
 *  Mostly a read-only audit timeline; entries are written from the mutation, sync
 *  and alert paths. Anonymous users get an empty feed (sample tenant has no history).
 *
 *  The POST is the ONE client-writable entry point, deliberately narrow: it accepts
 *  only a {kind, via} pair from a closed union and composes the row text server-side,
 *  so a client can record THAT a publish happened but cannot write arbitrary prose
 *  into a tenant's audit timeline. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { listActivity, recordActivity } from "@/lib/campaigns/activity";
import {
  isPublishAssetKind,
  isPublishVia,
  publishActivityDetail,
  publishActivityTitle,
} from "@/lib/activity/publish";


export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ activity: [] });

  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  const { records } = await listActivity(tenant);
  return Response.json({ activity: records });
}

/** Record one asset-publish event. Anonymous callers are a no-op success rather than
 *  a 401: an unauthenticated export still works, and failing the beacon would make the
 *  caller look broken for an audit write it never depended on. */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ recorded: false });

  let body: { kind?: unknown; via?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const { kind, via } = body;
  if (!isPublishAssetKind(kind)) {
    return Response.json({ error: "Neznámý typ výstupu." }, { status: 400 });
  }
  if (!isPublishVia(via)) {
    return Response.json({ error: "Neznámý způsob publikace." }, { status: 400 });
  }
  const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : undefined;

  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  // recordActivity is best-effort by contract — it swallows its own write failures,
  // so a reported success here means "accepted", not "durably stored".
  await recordActivity(tenant, {
    kind: "update",
    module: "ai",
    severity: "success",
    title: publishActivityTitle(kind, via),
    detail: publishActivityDetail(kind, via),
    actor: "Vy",
    // The structured half of the row: the publish-rate rollup counts on these, not
    // on the prose title, so rewording/localizing the timeline can never silently
    // zero the measure.
    publishKind: kind,
    publishVia: via,
  });
  return Response.json({ recorded: true });
}
