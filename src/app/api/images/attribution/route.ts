/** Creative-to-revenue attribution for the signed-in user's tenant:
 *   GET    → links + per-style leaderboard + the active style prior
 *   POST   → record a link {style, format, prompt, visionScore?, creativeId?, campaignName?, metrics?}
 *   PATCH  → set a link's metrics {linkId, metrics}
 *   DELETE → remove a link {linkId}
 *  Requires an account. Node runtime. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import {
  listCreativeLinks,
  recordCreativeLink,
  updateCreativeMetrics,
  deleteCreativeLink,
} from "@/lib/images/attribution";
import {
  styleLeaderboard,
  deriveStylePrior,
  parseMetrics,
} from "@/lib/images/attribution-types";
import { isImageStyle } from "@/lib/images/types";

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ links: [], leaderboard: [], prior: { style: null, hint: "" } });
  const projectId = new URL(request.url).searchParams.get("projectId") || undefined;
  const tenant = await resolveTenant(userId, projectId);
  const links = await listCreativeLinks(tenant);
  const leaderboard = styleLeaderboard(links);
  return Response.json({ links, leaderboard, prior: deriveStylePrior(leaderboard) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Pro uložení se přihlaste." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  if (!isImageStyle(body.style)) return Response.json({ error: "Neplatný styl." }, { status: 422 });

  const parsedMetrics = parseMetrics(body.metrics);
  if (parsedMetrics && "invalidField" in parsedMetrics)
    return Response.json({ error: "Neplatná hodnota metriky." }, { status: 422 });

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  const link = await recordCreativeLink(tenant, {
    style: body.style,
    format: typeof body.format === "string" ? body.format : "square",
    prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 500) : "",
    visionScore: Number.isFinite(Number(body.visionScore)) ? Number(body.visionScore) : null,
    creativeId: typeof body.creativeId === "string" ? body.creativeId : null,
    campaignName: typeof body.campaignName === "string" ? body.campaignName.trim() || null : null,
    metrics: parsedMetrics ? parsedMetrics.metrics : null,
  });
  return Response.json({ link });
}

export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: { linkId?: unknown; metrics?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const linkId = typeof body.linkId === "string" ? body.linkId : "";
  const parsed = parseMetrics(body.metrics);
  if (!linkId || !parsed) return Response.json({ error: "Chybí data." }, { status: 422 });
  if ("invalidField" in parsed)
    return Response.json({ error: "Neplatná hodnota metriky." }, { status: 422 });

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  // 404 (not a silent 200) when the link is gone — set(merge) would otherwise
  // upsert a phantom, style-less row that poisons the style prior.
  const ok = await updateCreativeMetrics(tenant, linkId, parsed.metrics);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let linkId = "";
  let projectId: string | undefined;
  try {
    const body = (await request.json()) as { linkId?: unknown; projectId?: unknown };
    if (typeof body.linkId === "string") linkId = body.linkId;
    if (typeof body.projectId === "string") projectId = body.projectId;
  } catch {
    /* no body */
  }
  if (!linkId) return Response.json({ error: "Chybí ID." }, { status: 422 });

  const tenant = await resolveTenant(userId, projectId);
  await deleteCreativeLink(tenant, linkId);
  return Response.json({ ok: true });
}
