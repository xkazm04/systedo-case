/** Manage the signed-in user's client microsite:
 *   GET    → the tenant's microsite config (or null)
 *   POST   → publish/update {clientName, segment?, brandName?, accentColor?, periodDays?}
 *   DELETE → take it offline
 *  The slug is derived from the client name; a slug already owned by another
 *  tenant is rejected. Node runtime. */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { slugify } from "@/lib/nav";
import {
  getMicrosite,
  getMicrositeForTenant,
  enableMicrosite,
  disableMicrosite,
} from "@/lib/microsite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return Response.json({ microsite: null });
  const tenant = await resolveTenant(userId);
  return Response.json({ microsite: await getMicrositeForTenant(tenant) });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Pro publikování se přihlaste." }, { status: 401 });

  let body: {
    clientName?: unknown;
    segment?: unknown;
    brandName?: unknown;
    accentColor?: unknown;
    periodDays?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  if (clientName.length < 2) return Response.json({ error: "Zadejte název klienta." }, { status: 422 });
  const slug = slugify(clientName);
  if (!slug) return Response.json({ error: "Z názvu nelze vytvořit URL." }, { status: 422 });

  const tenant = await resolveTenant(userId);

  // Don't let one tenant hijack another's public slug.
  const existing = await getMicrosite(slug);
  if (existing && existing.tenant !== tenant) {
    return Response.json({ error: "Tato adresa je už obsazená, zvolte jiný název." }, { status: 409 });
  }

  const accentColor = typeof body.accentColor === "string" ? body.accentColor : undefined;
  const periodDays = Number(body.periodDays);
  const microsite = await enableMicrosite(tenant, {
    slug,
    clientName,
    segment: typeof body.segment === "string" ? body.segment : undefined,
    brandName: typeof body.brandName === "string" ? body.brandName : undefined,
    accentColor: accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : undefined,
    periodDays: Number.isFinite(periodDays) ? periodDays : undefined,
  });
  return Response.json({ microsite });
}

export async function DELETE() {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const tenant = await resolveTenant(userId);
  await disableMicrosite(tenant);
  return Response.json({ ok: true });
}
