/** Read/update the signed-in tenant's client-report configuration (white-label
 *  branding + recipients + cadence). Drives the branded report page and the daily
 *  report cron. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import {
  REPORT_CADENCES,
  getReportConfig,
  setReportConfig,
  type ClientProfile,
  type ReportCadence,
} from "@/lib/campaigns/report-config";
import { rejectUnknownProject } from "@/lib/projects/api-guard";


const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Validate + sanitize the submitted client profile for a REAL (signed-in) tenant.
 *  Every PUT here belongs to a real tenant whose profile drives the client-facing
 *  branded report and the daily cron, so a blank required field or an out-of-range
 *  PNO goal is REJECTED (422) — never silently back-filled with the seeded Mionelo
 *  demo identity, which would ship a real customer's report branded for the wrong
 *  company and grade it against the demo's PNO target. Returns a discriminated
 *  result: `{ profile }` on success, `{ error }` (surfaced as 422) otherwise. The
 *  demo defaults live only in the read path (getReportConfig) for an unset tenant. */
function parseClientProfile(raw: unknown): { profile: ClientProfile } | { error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const name = str(o.name).slice(0, 80);
  const domain = str(o.domain).slice(0, 120);
  const businessLine = str(o.businessLine).slice(0, 200);
  if (!name) return { error: "Název klienta je povinný." };
  if (!domain) return { error: "Doména klienta je povinná." };
  if (!businessLine) return { error: "Obor podnikání je povinný." };
  const goal = Number(o.pnoGoal);
  if (!(Number.isFinite(goal) && goal > 0 && goal <= 1)) {
    return { error: "Cílové PNO musí být podíl mezi 0 a 1 (např. 0.2)." };
  }
  return { profile: { name, domain, businessLine, pnoGoal: goal } };
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  // Prove the wire projectId before it composes a tenant key: an unverified id mints
  // a fresh empty tenant, and for THIS resource an unset tenant reads back the seeded
  // demo identity — a typo would hand the caller the wrong company's report branding.
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  return Response.json(await getReportConfig(await resolveTenant(userId, projectId)));
}

export async function PUT(request: Request) {
  const userId = await currentUserId();
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

  const parsed = parseClientProfile(body.clientProfile);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 422 });

  const patch = {
    brandName: str(body.brandName).slice(0, 60),
    accentColor,
    recipients,
    cadence,
    clientProfile: parsed.profile,
  };
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId);
  await setReportConfig(tenant, patch);
  return Response.json({ ...(await getReportConfig(tenant)) });
}
