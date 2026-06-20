/** Creative-to-revenue attribution for the signed-in user's tenant:
 *   GET    → links + per-style leaderboard + the active style prior
 *   POST   → record a link {style, format, prompt, visionScore?, creativeId?, campaignName?, metrics?}
 *   PATCH  → set a link's metrics {linkId, metrics}
 *   DELETE → remove a link {linkId}
 *  Requires an account. Node runtime. */
import { auth } from "@/auth";
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
  type CreativeMetrics,
} from "@/lib/images/attribution-types";
import { isImageStyle } from "@/lib/images/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

function toMetrics(raw: unknown): CreativeMetrics | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    impressions: num(m.impressions),
    clicks: num(m.clicks),
    conversions: num(m.conversions),
    cost: num(m.cost),
    convValue: num(m.convValue),
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ links: [], leaderboard: [], prior: { style: null, hint: "" } });
  const projectId = new URL(request.url).searchParams.get("projectId") || undefined;
  const tenant = await resolveTenant(userId, projectId);
  const links = await listCreativeLinks(tenant);
  const leaderboard = styleLeaderboard(links);
  return Response.json({ links, leaderboard, prior: deriveStylePrior(leaderboard) });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Pro uložení se přihlaste." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  if (!isImageStyle(body.style)) return Response.json({ error: "Neplatný styl." }, { status: 422 });

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  const link = await recordCreativeLink(tenant, {
    style: body.style,
    format: typeof body.format === "string" ? body.format : "square",
    prompt: typeof body.prompt === "string" ? body.prompt.slice(0, 500) : "",
    visionScore: Number.isFinite(Number(body.visionScore)) ? Number(body.visionScore) : null,
    creativeId: typeof body.creativeId === "string" ? body.creativeId : null,
    campaignName: typeof body.campaignName === "string" ? body.campaignName.trim() || null : null,
    metrics: toMetrics(body.metrics),
  });
  return Response.json({ link });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: { linkId?: unknown; metrics?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const linkId = typeof body.linkId === "string" ? body.linkId : "";
  const metrics = toMetrics(body.metrics);
  if (!linkId || !metrics) return Response.json({ error: "Chybí data." }, { status: 422 });

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  await updateCreativeMetrics(tenant, linkId, metrics);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
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
