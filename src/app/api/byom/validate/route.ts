/** BYOM "test connection" — re-test a stored vendor key (e.g. after changing the
 *  model) and record the outcome. Body: `{ vendor }`. Per-user. Server-only. */
import { getPublicByomConfig, markByomValidation, resolveByomKey } from "@/lib/llm/keys/store";
import { isByomVendor } from "@/lib/llm/keys/types";
import { validateVendorKey } from "@/lib/llm/keys/validate";
import { requireByomUser } from "../guard";

export async function POST(request: Request) {
  const u = await requireByomUser();
  if (u instanceof Response) return u;

  const body = (await request.json().catch(() => null)) as { vendor?: unknown } | null;
  const vendor = body?.vendor;
  if (!isByomVendor(vendor)) {
    return Response.json({ error: "Neznámý poskytovatel.", code: "invalid" }, { status: 400 });
  }

  const resolved = await resolveByomKey(u.userId, vendor);
  if (!resolved) {
    return Response.json(
      { error: "Pro tohoto poskytovatele není uložen žádný klíč.", code: "invalid" },
      { status: 400 }
    );
  }

  const check = await validateVendorKey(vendor, resolved.apiKey, resolved.model, resolved.fastModel);
  await markByomValidation(u.userId, vendor, check);
  return Response.json({ config: await getPublicByomConfig(u.userId), validation: check });
}
