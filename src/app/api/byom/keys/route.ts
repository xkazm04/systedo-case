/** BYOM keys — add/replace a vendor's key (encrypted, then tested) and remove one.
 *  Per-user. Server-only. */
import {
  deleteByomKey,
  getPublicByomConfig,
  hasByomCrypto,
  markByomValidation,
  putByomKey,
  resolveByomKey,
  setActiveByomVendor,
} from "@/lib/llm/keys/store";
import { isByomVendor } from "@/lib/llm/keys/types";
import { validateVendorKey } from "@/lib/llm/keys/validate";
import { requireByomUser, requireUser } from "../guard";
import { guardByomProbe } from "../probe-guard";

/** Store (encrypted) a vendor's API key, then immediately test it so the UI can
 *  show a validated check or an actionable error. Body: `{ vendor, apiKey }`.
 *  Requires the BYOM entitlement.
 *
 *  Store-then-test is deliberate (we test exactly what was persisted), but a key
 *  that fails its test must NOT become live routing state: putByomKey auto-activates
 *  the first key, so a failed test on a freshly-activated vendor turns BYOM back off
 *  (restoring the prior active vendor) rather than silently routing every generation
 *  through a known-bad key. The response stays 200 with `validation.ok: false` so the
 *  settings UI renders the actionable per-vendor error.
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

  // Remember the active vendor BEFORE putByomKey (which auto-activates a first key),
  // so a failed test can undo that auto-activation.
  const prevActive = (await getPublicByomConfig(u.userId)).activeVendor;
  await putByomKey(u.userId, vendor, apiKey);
  // Test the freshly-stored key with its chosen (or default) model.
  const resolved = await resolveByomKey(u.userId, vendor);
  const check = resolved
    ? await validateVendorKey(vendor, resolved.apiKey, resolved.model, resolved.fastModel)
    : { ok: false, error: "Uložený klíč se nepodařilo načíst." };
  await markByomValidation(u.userId, vendor, check);

  // A key that failed its test must not be left as the live routing target. If this
  // vendor was auto-activated as the user's first key, turn BYOM back off (restore the
  // prior active vendor) so generation doesn't silently route through a broken key.
  // Re-keying an already-active vendor is left as-is (the user chose it and sees the
  // failed-test notice).
  if (!check.ok && prevActive !== vendor) {
    await setActiveByomVendor(u.userId, prevActive ?? null);
  }

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
