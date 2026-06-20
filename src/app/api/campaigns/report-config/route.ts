/** Read/update the signed-in tenant's client-report configuration (white-label
 *  branding + recipients + cadence). Drives the branded report page and the daily
 *  report cron. */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import {
  REPORT_CADENCES,
  getReportConfig,
  setReportConfig,
  type ReportCadence,
} from "@/lib/campaigns/report-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  return Response.json(await getReportConfig(await resolveTenant(userId, projectId)));
}

export async function PUT(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const cadence = REPORT_CADENCES.includes(body.cadence as ReportCadence)
    ? (body.cadence as ReportCadence)
    : "off";
  const accentColor = str(body.accentColor);
  if (accentColor && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(accentColor)) {
    return Response.json({ error: "Neplatná barva (použijte hex, např. #0e9c97)." }, { status: 422 });
  }
  // recipients accepts an array or a comma/newline-separated string.
  const rawRecipients = Array.isArray(body.recipients)
    ? body.recipients.map(str)
    : str(body.recipients).split(/[\s,;]+/);
  const recipients = [...new Set(rawRecipients.filter((e) => EMAIL_RE.test(e)))].slice(0, 10);

  const patch = {
    brandName: str(body.brandName).slice(0, 60),
    accentColor,
    recipients,
    cadence,
  };
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  await setReportConfig(tenant, patch);
  return Response.json({ ...(await getReportConfig(tenant)) });
}
