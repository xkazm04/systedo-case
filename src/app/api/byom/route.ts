/** BYOM settings — read the caller's config (+ entitlement) and update the active
 *  vendor / per-vendor model choice. Per-user (keys apply across all projects).
 *  Adding/removing keys lives in ./keys; testing a key lives in ./validate. */
import { getUserPlan, planHasByom } from "@/lib/usage";
import { getPublicByomConfig, setActiveByomVendor, setByomKeyModels } from "@/lib/llm/keys/store";
import { isByomVendor, type ByomVendor } from "@/lib/llm/keys/types";
import { requireByomUser, requireUser } from "./guard";

/** Read: the caller's public config (no key bytes) + whether they're entitled.
 *  Available to any signed-in user so the settings UI can show an upsell. */
export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const [plan, config] = await Promise.all([getUserPlan(u.userId), getPublicByomConfig(u.userId)]);
  return Response.json({ entitled: planHasByom(plan), config });
}

/** Update the active vendor and/or a vendor's chosen models. Body:
 *  `{ activeVendor?: vendor | null, models?: { vendor, model?, fastModel? } }`.
 *  `activeVendor: null` disables BYOM (falls back to the app's providers). A
 *  model field set to null clears it (back to the vendor default); omitted leaves
 *  it unchanged. Requires the BYOM entitlement. */
export async function PATCH(request: Request) {
  const u = await requireByomUser();
  if (u instanceof Response) return u;

  const body = (await request.json().catch(() => null)) as {
    activeVendor?: unknown;
    models?: { vendor?: unknown; model?: unknown; fastModel?: unknown };
  } | null;
  if (!body) return Response.json({ error: "Neplatný JSON.", code: "invalid" }, { status: 400 });

  try {
    if (body.activeVendor !== undefined) {
      if (body.activeVendor !== null && !isByomVendor(body.activeVendor)) {
        return Response.json({ error: "Neznámý poskytovatel.", code: "invalid" }, { status: 400 });
      }
      await setActiveByomVendor(u.userId, body.activeVendor as ByomVendor | null);
    }
    if (body.models && isByomVendor(body.models.vendor)) {
      await setByomKeyModels(u.userId, body.models.vendor, {
        model: body.models.model as string | null | undefined,
        fastModel: body.models.fastModel as string | null | undefined,
      });
    }
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Změna se nezdařila.", code: "invalid" },
      { status: 400 }
    );
  }

  return Response.json({ config: await getPublicByomConfig(u.userId) });
}
