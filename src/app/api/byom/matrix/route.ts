/** BYOM matrix — assign an operation (LLM call site) to a vendor + model +
 *  reasoning, or clear it (falls back to the global active vendor). Per-user,
 *  byom-entitled (plan or the BYOM_MATRIX dev flag). Server-only. */
import { clearByomOperation, getPublicByomConfig, setByomOperation } from "@/lib/llm/keys/store";
import {
  BYOM_MODEL_CATALOG,
  BYOM_OPERATIONS,
  isByomVendor,
  isReasoningLevel,
} from "@/lib/llm/keys/types";
import { requireByomUser } from "../guard";

const OPERATION_IDS = new Set(BYOM_OPERATIONS.map((o) => o.id));

function bad(error: string) {
  return Response.json({ error, code: "invalid" }, { status: 400 });
}

/** Set one operation's assignment. Body: `{ toolId, vendor, model, reasoning }`. */
export async function POST(request: Request) {
  const u = await requireByomUser();
  if (u instanceof Response) return u;

  const body = (await request.json().catch(() => null)) as {
    toolId?: unknown;
    vendor?: unknown;
    model?: unknown;
    reasoning?: unknown;
  } | null;
  const toolId = typeof body?.toolId === "string" ? body.toolId : "";
  const vendor = body?.vendor;
  const model = typeof body?.model === "string" ? body.model : "";
  const reasoning = body?.reasoning;

  if (!OPERATION_IDS.has(toolId)) return bad("Neznámá operace.");
  if (!isByomVendor(vendor)) return bad("Neznámý poskytovatel.");
  if (!model || !BYOM_MODEL_CATALOG[vendor].models.some((m) => m.id === model)) {
    return bad("Model není v nabídce pro tohoto poskytovatele.");
  }
  if (!isReasoningLevel(reasoning)) return bad("Neplatná úroveň uvažování.");

  try {
    await setByomOperation(u.userId, toolId, { vendor, model, reasoning });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Uložení se nezdařilo.";
    // "No BYOM key stored" is a caller error (they assigned a vendor with no key) →
    // 400/invalid. Any other throw is a store/Firestore failure — a 500, not the
    // caller's fault; the old blanket 400 blamed the client for server-side errors.
    const isValidation = /No BYOM key stored/.test(msg);
    return Response.json(
      { error: msg, code: isValidation ? "invalid" : "server_error" },
      { status: isValidation ? 400 : 500 }
    );
  }
  return Response.json({ config: await getPublicByomConfig(u.userId) });
}

/** Clear one operation's assignment (`?toolId=`). */
export async function DELETE(request: Request) {
  const u = await requireByomUser();
  if (u instanceof Response) return u;

  const toolId = new URL(request.url).searchParams.get("toolId") ?? "";
  if (!OPERATION_IDS.has(toolId)) return bad("Neznámá operace.");
  await clearByomOperation(u.userId, toolId);
  return Response.json({ config: await getPublicByomConfig(u.userId) });
}
