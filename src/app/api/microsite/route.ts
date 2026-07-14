/** Manage the signed-in user's client microsite:
 *   GET    → the tenant's microsite config (or null)
 *   POST   → publish/update {periodDays?, segment?} — white-label identity
 *            (client/brand name + accent) is NOT collected here anymore; it is
 *            resolved from the report config (with the existing microsite's own
 *            persisted values winning first). Explicit {clientName, brandName,
 *            accentColor} in the body still override, for back-compat.
 *   DELETE → take it offline
 *  The slug is derived from the resolved client name; a slug already owned by
 *  another tenant is rejected. Node runtime. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { recordActivity } from "@/lib/campaigns/activity";
import { slugify } from "@/lib/nav";
import { getReportConfig } from "@/lib/campaigns/report-config";
import { resolveMicrositeIdentity } from "@/lib/microsite-identity";
import {
  getMicrosite,
  getMicrositeForTenant,
  enableMicrosite,
  disableMicrosite,
} from "@/lib/microsite";


export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ microsite: null });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  return Response.json({ microsite: await getMicrositeForTenant(tenant) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Pro publikování se přihlaste." }, { status: 401 });

  let body: {
    clientName?: unknown;
    segment?: unknown;
    brandName?: unknown;
    accentColor?: unknown;
    periodDays?: unknown;
    projectId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });

  // Resolve the white-label identity ONCE: an explicit body override wins (back-
  // compat), then the microsite's own previously-persisted values (so an existing
  // site keeps its name/colour), then the report config (the single white-label
  // source), then the demo default. getMicrositeForTenant returns even a disabled
  // site, so a take-offline → re-publish keeps its prior identity and slug.
  const [reportConfig, ownSite] = await Promise.all([
    getReportConfig(tenant),
    getMicrositeForTenant(tenant),
  ]);
  const identity = resolveMicrositeIdentity(
    {
      clientName: typeof body.clientName === "string" ? body.clientName : undefined,
      accentColor: typeof body.accentColor === "string" ? body.accentColor : undefined,
      brandName: typeof body.brandName === "string" ? body.brandName : undefined,
    },
    ownSite ?? undefined,
    {
      clientName: reportConfig.clientProfile.name,
      accentColor: reportConfig.accentColor,
      brandName: reportConfig.brandName,
    }
  );

  const slug = slugify(identity.clientName);
  if (!slug) return Response.json({ error: "Z názvu nelze vytvořit URL." }, { status: 422 });

  // Don't let one tenant hijack another's public slug.
  const other = await getMicrosite(slug);
  if (other && other.tenant !== tenant) {
    return Response.json({ error: "Tato adresa je už obsazená, zvolte jiný název." }, { status: 409 });
  }

  const periodDays = Number(body.periodDays);
  const microsite = await enableMicrosite(tenant, {
    slug,
    clientName: identity.clientName,
    segment: typeof body.segment === "string" ? body.segment : ownSite?.segment,
    brandName: identity.brandName,
    accentColor: identity.accentColor,
    periodDays: Number.isFinite(periodDays) ? periodDays : ownSite?.periodDays,
  });
  await recordActivity(tenant, {
    kind: "update", module: "reporty", severity: "success",
    title: "Klientská microsite publikována", detail: identity.clientName, actor: "Vy",
  });
  return Response.json({ microsite });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  await disableMicrosite(tenant);
  await recordActivity(tenant, {
    kind: "update", module: "reporty", severity: "warning",
    title: "Klientská microsite vypnuta", detail: "", actor: "Vy",
  });
  return Response.json({ ok: true });
}
