/** A/B ad experiments for the signed-in user's tenant:
 *   GET    → all experiments (with computed winners)
 *   POST   → add a variant {name, label?, ad, strength} (upsert by name)
 *   PATCH  → set a variant's metrics {experimentId, variantId, metrics}
 *   DELETE → remove an experiment {experimentId}
 *  Requires an account (anonymous generation stays transient). Node runtime. */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { recordActivity } from "@/lib/campaigns/activity";
import {
  listExperiments,
  upsertExperimentVariant,
  updateVariantMetrics,
  deleteExperiment,
} from "@/lib/ai/experiments";
import type { AdResult } from "@/lib/ai-types";
import type { AdVariantMetrics } from "@/lib/ai/experiment-types";


async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Coerce untrusted JSON into an AdResult (the generator's own shape). */
function toAdResult(raw: unknown): AdResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const headlines = strArr(r.headlines);
  if (headlines.length === 0) return null;
  return {
    headlines,
    descriptions: strArr(r.descriptions),
    callouts: strArr(r.callouts),
    keywords: strArr(r.keywords),
    longHeadline: typeof r.longHeadline === "string" ? r.longHeadline : "",
    rationale: typeof r.rationale === "string" ? r.rationale : "",
  };
}

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ experiments: [] });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId);
  return Response.json({ experiments: await listExperiments(tenant) });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Pro uložení varianty se přihlaste." }, { status: 401 });

  let body: { name?: unknown; label?: unknown; ad?: unknown; strength?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "Zadejte název A/B testu." }, { status: 422 });
  const ad = toAdResult(body.ad);
  if (!ad) return Response.json({ error: "Chybí inzerát k uložení." }, { status: 422 });

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  const experiment = await upsertExperimentVariant(tenant, name, {
    label: typeof body.label === "string" ? body.label : undefined,
    ad,
    strength: num(body.strength),
  });
  await recordActivity(tenant, {
    kind: "update",
    module: "experimenty-lp",
    severity: "info",
    title: "A/B varianta uložena",
    detail: name,
    actor: "Vy",
  });
  return Response.json({ experiment });
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: { experimentId?: unknown; variantId?: unknown; metrics?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const experimentId = typeof body.experimentId === "string" ? body.experimentId : "";
  const variantId = typeof body.variantId === "string" ? body.variantId : "";
  if (!experimentId || !variantId) {
    return Response.json({ error: "Chybí ID experimentu nebo varianty." }, { status: 422 });
  }
  const m = (body.metrics ?? {}) as Record<string, unknown>;
  const metrics: AdVariantMetrics = {
    impressions: num(m.impressions),
    clicks: num(m.clicks),
    conversions: num(m.conversions),
    cost: num(m.cost),
    convValue: num(m.convValue),
  };

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  const experiment = await updateVariantMetrics(tenant, experimentId, variantId, metrics);
  if (!experiment) return Response.json({ error: "Experiment nenalezen." }, { status: 404 });
  return Response.json({ experiment });
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let id = "";
  let projectId: string | undefined;
  try {
    const body = (await request.json()) as { experimentId?: unknown; projectId?: unknown };
    if (typeof body.experimentId === "string") id = body.experimentId;
    if (typeof body.projectId === "string") projectId = body.projectId;
  } catch {
    /* no body */
  }
  if (!id) return Response.json({ error: "Chybí ID experimentu." }, { status: 422 });

  const tenant = await resolveTenant(userId, projectId);
  await deleteExperiment(tenant, id);
  return Response.json({ ok: true });
}
