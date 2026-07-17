/** BYOM settings — read the caller's config (+ entitlement) and update the active
 *  vendor / per-vendor model choice. Per-user (keys apply across all projects).
 *  Adding/removing keys lives in ./keys; testing a key lives in ./validate. */
import { byomUnlocked, getUserPlan } from "@/lib/usage";
import { getPublicByomConfig, setActiveByomVendor, setByomKeyModels } from "@/lib/llm/keys/store";
import { isByomVendor, type ByomVendor } from "@/lib/llm/keys/types";
import { requireByomUser, requireUser } from "./guard";

/** Read: the caller's public config (no key bytes) + whether they're entitled.
 *  Available to any signed-in user so the settings UI can show an upsell. */
export async function GET() {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const [plan, config] = await Promise.all([getUserPlan(u.userId), getPublicByomConfig(u.userId)]);
  return Response.json({ entitled: byomUnlocked(plan), config });
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
    if (body.models !== undefined) {
      const m = body.models;
      // Reject an unknown vendor instead of silently skipping the update (the
      // activeVendor branch above already 400s — mirror it here so a typo'd vendor
      // doesn't return 200 with the change quietly dropped).
      if (!isByomVendor(m.vendor)) {
        return Response.json({ error: "Neznámý poskytovatel.", code: "invalid" }, { status: 400 });
      }
      // Runtime type checks at the JSON boundary — a cast is not a check, and the
      // store's truthiness test would otherwise persist e.g. a number as a model tag.
      const okField = (v: unknown) => v === undefined || v === null || typeof v === "string";
      if (!okField(m.model) || !okField(m.fastModel)) {
        return Response.json({ error: "Model musí být řetězec nebo null.", code: "invalid" }, { status: 400 });
      }
      await setByomKeyModels(u.userId, m.vendor, {
        model: m.model as string | null | undefined,
        fastModel: m.fastModel as string | null | undefined,
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
