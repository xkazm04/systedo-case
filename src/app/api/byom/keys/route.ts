/** BYOM keys — add/replace a vendor's key (encrypted, then tested) and remove one.
 *  Per-user. Server-only. */
import { deleteByomKey, getPublicByomConfig, hasByomCrypto } from "@/lib/llm/keys/store";
import { isByomVendor } from "@/lib/llm/keys/types";
import { storeAndProbeByomKey } from "@/lib/llm/keys/validate";
import { requireByomUser, requireUser } from "../guard";
import { guardByomProbe } from "../probe-guard";

/** Store (encrypted) a vendor's API key, then immediately test it so the UI can
 *  show a validated check or an actionable error. Body: `{ vendor, apiKey }`.
 *  Requires the BYOM entitlement.
 *
 *  Store-then-test, and the undo of the auto-activation when the test fails, are
 *  `storeAndProbeByomKey`'s (src/lib/llm/keys/validate.ts) — the seam exists so that
 *  the decrypted key never enters a request handler. The response stays 200 with
 *  `validation.ok: false` so the settings UI renders the actionable per-vendor error.
 *
 *  Because it ends in a provider call, this route SHARES the per-user probe floor
 *  with /api/byom/validate (../probe-guard): a separate budget here would be a
 *  trivial bypass — re-POSTing the same key drives the identical provider probe.
 *  The check runs BEFORE the key is stored, so a throttled request is a clean no-op
 *  rather than a stored-but-never-tested key. */
export async function POST(request: Request) {
  const u = await requireByomUser();
  if (u instanceof Response) return u;
  const throttled = await guardByomProbe(u.userId);
  if (throttled) return throttled;

  const body = (await request.json().catch(() => null)) as { vendor?: unknown; apiKey?: unknown } | null;
  const vendor = body?.vendor;
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (!isByomVendor(vendor) || !apiKey) {
    return Response.json({ error: "Zadejte poskytovatele a API klíč.", code: "invalid" }, { status: 400 });
  }
  if (!hasByomCrypto()) {
    return Response.json(
      {
        error: "Šifrování klíčů není na serveru nakonfigurováno (nastavte BYOM_KEY_SECRET nebo AUTH_SECRET).",
        code: "server_error",
      },
      { status: 500 }
    );
  }

  // Store-then-test, the auto-activation undo, and the decrypted key all live behind
  // the lib seam (src/lib/llm/keys/validate.ts): this handler sees a verdict, never a
  // key. What comes back is the same 200 with `validation.ok: false` the settings UI
  // renders as an actionable per-vendor error.
  const check = await storeAndProbeByomKey(u.userId, vendor, apiKey);

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
