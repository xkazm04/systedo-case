/** Winning-patterns library API:
 *   GET    → auto-derived + saved patterns for the tenant
 *   POST   → save (pin / hand-write) a pattern  (signed-in)
 *   DELETE → remove a saved pattern by id        (signed-in) */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import { deletePattern, getLibrary, savePattern } from "@/lib/patterns/store";
import { isPatternCategory } from "@/lib/patterns/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

async function userId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function GET() {
  const tenant = await resolveTenant(await userId());
  try {
    return Response.json(await getLibrary(tenant));
  } catch (err) {
    console.error("[patterns] library failed:", err);
    return Response.json({ auto: [], saved: [] });
  }
}

export async function POST(request: Request) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const title = str(body.title);
  const insight = str(body.insight);
  if (title.length < 3) return Response.json({ error: "Zadejte název vzoru (min. 3 znaky)." }, { status: 422 });
  if (insight.length < 3) return Response.json({ error: "Zadejte popis vzoru." }, { status: 422 });

  const pattern = await savePattern(await resolveTenant(uid), {
    title,
    category: isPatternCategory(body.category) ? body.category : "structure",
    insight,
    evidence: str(body.evidence),
  });
  return Response.json({ pattern });
}

export async function DELETE(request: Request) {
  const uid = await userId();
  if (!uid) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  let id = "";
  try {
    id = str(((await request.json()) as { id?: unknown }).id);
  } catch {
    /* fall through */
  }
  if (!id) return Response.json({ error: "Chybí ID." }, { status: 422 });
  const ok = await deletePattern(await resolveTenant(uid), id);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
