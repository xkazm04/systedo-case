/** BYOM keys — add/replace a vendor's key (encrypted, then tested) and remove one.
 *  Per-user. Server-only. */
import {
  deleteByomKey,
  getPublicByomConfig,
  hasByomCrypto,
  markByomValidation,
  putByomKey,
  resolveByomKey,
} from "@/lib/llm/keys/store";
import { isByomVendor } from "@/lib/llm/keys/types";
import { validateVendorKey } from "@/lib/llm/keys/validate";
import { requireByomUser, requireUser } from "../guard";

/** Store (encrypted) a vendor's API key, then immediately test it so the UI can
 *  show a validated check or an actionable error. Body: `{ vendor, apiKey }`.
 *  Requires the BYOM entitlement. */
export async function POST(request: Request) {
  const u = await requireByomUser();
  if (u instanceof Response) return u;

  const body = (await request.json().catch(() => null)) as { vendor?: unknown; apiKey?: unknown } | null;
  const vendor = body?.vendor;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!isByomVendor(vendor) || !apiKey) {
    return Response.json({ error: "Zadejte poskytovatele a API klíč.", code: "invalid" }, { status: 400 });
  }
  if (!hasByomCrypto()) {
    return Response.json(
      { error: "Šifrování klíčů není na serveru nakonfigurováno (chybí BYOM_KEY_SECRET).", code: "failed" },
      { status: 500 }
    );
  }

  await putByomKey(u.userId, vendor, apiKey);
  // Test the freshly-stored key with its chosen (or default) model.
  const resolved = await resolveByomKey(u.userId, vendor);
  const check = resolved
    ? await validateVendorKey(vendor, resolved.apiKey, resolved.model, resolved.fastModel)
    : { ok: false, error: "Uložený klíč se nepodařilo načíst." };
  await markByomValidation(u.userId, vendor, check);

  return Response.json({ config: await getPublicByomConfig(u.userId), validation: check });
}

/** Remove a vendor's key. Allowed for any signed-in user (e.g. cleanup after a
 *  downgrade), not just entitled ones. Vendor in the `?vendor=` query. */
export async function DELETE(request: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;

  const vendor = new URL(request.url).searchParams.get("vendor");
  if (!isByomVendor(vendor)) {
    return Response.json({ error: "Neznámý poskytovatel.", code: "invalid" }, { status: 400 });
  }
  await deleteByomKey(u.userId, vendor);
  return Response.json({ config: await getPublicByomConfig(u.userId) });
}
