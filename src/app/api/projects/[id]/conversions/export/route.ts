/** GET /api/projects/[id]/conversions/export?format=google|sklik&kind=qualified|won&days=30
 *
 *  Downloads the project's conversion ledger in one of the registered export formats
 *  (src/lib/conversions/registry.ts). Ownership-checked through the shared guard, so
 *  the ledger of a project that is not the caller's is a 404, never a file.
 *
 *  A PLAIN `<a href>` from the Kvalita leadů strip is the whole client side: the
 *  request carries the session cookie, the response carries
 *  `Content-Disposition: attachment`, and the browser saves it. No fetch, no blob,
 *  no object URL — which also means the download works with JS disabled and cannot
 *  leak the file into a client-side variable.
 *
 *  NO PII LEAVES HERE. The rows the exporters read carry a contact id, an
 *  attribution triple, a click id and an optional value — never a name, e-mail or
 *  phone number (see conversion-events.ts). Server-only; no LLM call in this
 *  namespace. Cache Components: a plain handler, no `export const dynamic`. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { apiError } from "@/lib/api/route-utils";
import { conversionExporter } from "@/lib/conversions/registry";
import { listConversionEvents } from "@/lib/leads/conversion-store";
import {
  CONVERSION_RETENTION_DAYS,
  isConversionKind,
  windowStartDay,
  type ConversionKind,
} from "@/lib/leads/conversion-events";

/** Rows read per export. The ledger is capped at CONVERSION_EVENT_CAP per project,
 *  so this is the whole retained set for every realistic tenant. */
const EXPORT_LIMIT = 5000;
const DEFAULT_DAYS = 30;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project } = g;

  const url = new URL(req.url);
  const exporter = conversionExporter(url.searchParams.get("format"));
  if (!exporter) {
    return apiError(400, "Neznámý formát exportu.", "bad-request", { envelope: "ok" });
  }
  const kindParam = url.searchParams.get("kind") ?? "won";
  if (!isConversionKind(kindParam)) {
    return apiError(400, "Neznámý typ konverze.", "bad-request", { envelope: "ok" });
  }
  const kind: ConversionKind = kindParam;
  const days = clampDays(url.searchParams.get("days"));

  const now = new Date();
  const events = await listConversionEvents(project.id, {
    kind,
    sinceDay: windowStartDay(now, days),
    limit: EXPORT_LIMIT,
  });
  const file = exporter.build(events, { kind, now });

  return new Response(file.body, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      // The ledger changes on every stage move; a cached export would hand the
      // operator yesterday's file under today's name.
      "Cache-Control": "no-store",
      // How many rows the format could not carry (Google drops gclid-less rows), so
      // the number is inspectable without opening the file.
      "X-Adamant-Rows": String(file.rows),
      "X-Adamant-Dropped": String(file.dropped),
    },
  });
}

function clampDays(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(CONVERSION_RETENTION_DAYS, Math.trunc(n)));
}
