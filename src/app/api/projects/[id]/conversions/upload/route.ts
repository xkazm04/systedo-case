/** GET/POST /api/projects/[id]/conversions/upload — the conversion-upload MAPPING:
 *  the operator's control over whether, and into what, this project's ledger rows are
 *  sent to Google Ads.
 *
 *  THIS ROUTE MINTS AN AUTHORISATION, and that is the only reason it exists as its own
 *  surface rather than as a `project_state` PUT. The blob is `http: false` precisely
 *  so a browser cannot write itself an approval: `approve` is granted HERE, by
 *  {@link approveMapping}, only when a dry run the operator actually looked at is on
 *  the record and less than 24 h old. Everything downstream — the hourly drain, the
 *  irreversible POST — rests on that check, so it lives on the server side of the
 *  wire and nowhere else.
 *
 *  The DRY RUN is deliberately double: it builds the exact payload the drain would
 *  build (the same `drainCandidates` + `buildGoogleUploadRows` the step calls, so the
 *  table cannot show one thing and the upload send another), AND, when a live account
 *  is reachable, asks Google to `validateOnly` it. The second half is best-effort: a
 *  probe that fails records `dryRunValidated: null` — "we could not ask" — and never
 *  blocks the dry run, because the rows the operator needs to inspect are already
 *  computed and a transport hiccup is not a reason to hide them.
 *
 *  ADR-0002: keyed by `requireOwnedProject`, so another owner's mapping is a 404 and
 *  never an approval. No PII crosses this wire — the rows carry a click id, a time and
 *  a value (see google-upload.ts). Cache Components: a plain handler, with no route
 *  segment config at all (rubric A2) — nothing here un-caches the segment. */
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { apiError, readJson } from "@/lib/api/route-utils";
import { emitProjectActivity } from "@/lib/activity/emit";
import { getAdsConnection } from "@/lib/campaigns/connection";
import { getUserAccessToken } from "@/lib/google/token";
import {
  adsConfigured,
  listConversionActions,
  uploadClickConversions,
  type ConversionActionRow,
} from "@/lib/google/ads";
import { listConversionEvents } from "@/lib/leads/conversion-store";
import { buildGoogleUploadRows } from "@/lib/conversions/google-upload";
import { drainCandidates, DRAIN_ROW_SCAN } from "@/lib/conversions/drain-step";
import {
  approveMapping,
  type ApproveRefusal,
  DRY_RUN_MAX_ROWS,
  emptyConversionUploadMapping,
  getConversionUploadMapping,
  mutateConversionUploadMapping,
  pauseMapping,
  recordDryRun,
  selectConversionAction,
  setConversionKinds,
  type ConversionUploadMapping,
} from "@/lib/conversions/mapping";

/** How many rows the response hands back for the dry-run table. The COUNT is exact;
 *  the sample is bounded so an approval screen cannot become a 500-row download. */
const DRY_RUN_SAMPLE = 20;

/** Why the live account could not be reached — surfaced so the card can say which of
 *  "not configured", "not connected" and "not authorised" is true instead of an
 *  undifferentiated "no actions". */
type LiveReason = "not-configured" | "not-connected" | "no-token" | "unreachable";

interface LiveActor {
  customerId: string;
  token: string;
}

async function resolveLiveActor(
  userId: string
): Promise<{ actor: LiveActor } | { reason: LiveReason }> {
  if (!adsConfigured()) return { reason: "not-configured" };
  const connection = await getAdsConnection(userId).catch(() => null);
  if (!connection) return { reason: "not-connected" };
  const token = await getUserAccessToken(userId).catch(() => null);
  if (!token) return { reason: "no-token" };
  return { actor: { customerId: connection.customerId, token } };
}

/** GET — the mapping plus the account's ENABLED conversion actions. A live read that
 *  fails degrades to `actions: []` WITH a reason: the mapping is still editable, and
 *  a card that silently showed an empty picker would read as "this account has no
 *  conversion actions", which is a different and possibly false claim. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  const mapping =
    (await getConversionUploadMapping(uid, project.id)) ?? emptyConversionUploadMapping(new Date());

  const live = await resolveLiveActor(uid);
  let actions: ConversionActionRow[] = [];
  let reason: LiveReason | null = "reason" in live ? live.reason : null;
  if ("actor" in live) {
    try {
      actions = await listConversionActions(live.actor.token, live.actor.customerId);
    } catch {
      reason = "unreachable";
    }
  }
  return Response.json({ ok: true, mapping, actions, reason });
}

interface UploadBody {
  action?: unknown;
  resourceName?: unknown;
  name?: unknown;
  kinds?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Both 4xx builders here answer in the `{ ok:false, code, error }` envelope the
 *  guard above uses, so one route never mixes two error shapes. */
const bad = (msg: string) => apiError(400, msg, "bad-request", { envelope: "ok" });
const refuse = (msg: string) => apiError(422, msg, "unprocessable", { envelope: "ok" });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id, { envelope: "ok" });
  if ("error" in g) return g.error;
  const { project, uid } = g;

  const body = await readJson<UploadBody>(req);
  if (!body) return bad("Neplatné tělo požadavku.");
  const action = str(body.action);
  const now = new Date();

  if (action === "select") {
    const resourceName = str(body.resourceName);
    if (!resourceName) return refuse("Vyberte konverzní akci.");
    const kinds = body.kinds as { qualified?: unknown; won?: unknown } | undefined;
    const mapping = await mutateConversionUploadMapping(uid, project.id, now, (m) => {
      const withAction = selectConversionAction(
        m,
        { resourceName, name: str(body.name) || resourceName },
        now
      );
      return kinds
        ? setConversionKinds(
            withAction,
            { qualified: kinds.qualified === true, won: kinds.won === true },
            now
          )
        : withAction;
    });
    return Response.json({ ok: true, mapping });
  }

  if (action === "dry-run") return dryRun(uid, project.id, now);
  if (action === "approve") return approve(uid, project.id, now);

  if (action === "pause") {
    const mapping = await mutateConversionUploadMapping(uid, project.id, now, (m) =>
      pauseMapping(m, now)
    );
    await emitProjectActivity(uid, project.id, {
      kind: "update",
      module: "kvalita-leadu",
      title: "Nahrávání konverzí do Google Ads pozastaveno",
      detail: "Další dávka se neodešle, dokud nahrávání znovu neschválíte.",
    });
    return Response.json({ ok: true, mapping });
  }

  return bad("Neznámá akce.");
}

/** The refusal reasons {@link approveMapping} can return, in the operator's language.
 *  Keyed by the union, so a new reason fails typecheck here rather than rendering a
 *  raw slug to a user. */
const APPROVE_REFUSAL_CS: Record<ApproveRefusal, string> = {
  "no-action": "Nejdřív vyberte konverzní akci v Google Ads.",
  "no-kinds": "Vyberte aspoň jeden typ konverze, který se má odesílat.",
  "no-dry-run": "Nejdřív spusťte zkušební běh — schválit lze jen to, co jste viděli.",
  "stale-dry-run": "Zkušební běh je starší než 24 hodin. Spusťte ho znovu a schvalte pak.",
};

/** Approve = mint the authorisation. The gate is checked TWICE on purpose: once on
 *  the record as read (so the refusal carries a reason the operator can act on), and
 *  once inside the compare-and-swap (so a mapping edited between the two — another
 *  tab changing the action — cannot slip an approval through the race). A CAS that
 *  came back un-approved is reported as a 409, never as a success. */
async function approve(uid: string, projectId: string, now: Date): Promise<Response> {
  const current =
    (await getConversionUploadMapping(uid, projectId)) ?? emptyConversionUploadMapping(now);
  const decision = approveMapping(current, now);
  if (!decision.ok) return refuse(APPROVE_REFUSAL_CS[decision.reason]);

  const mapping = await mutateConversionUploadMapping(uid, projectId, now, (m) => {
    const r = approveMapping(m, now);
    return r.ok ? r.mapping : m;
  });
  if (mapping.status !== "approved") {
    return apiError(409, "Mapování se mezitím změnilo. Spusťte zkušební běh znovu.", "conflict", {
      envelope: "ok",
    });
  }
  await emitProjectActivity(uid, projectId, {
    kind: "update",
    module: "kvalita-leadu",
    title: "Nahrávání konverzí do Google Ads schváleno",
    detail: `Konverzní akce: ${mapping.conversionAction?.name ?? "—"}. Odesílá se ID kliknutí, čas a hodnota.`,
  });
  return Response.json({ ok: true, mapping });
}

/** Build the exact batch a drain would take, show it, and — when a live account is
 *  reachable — let Google check it without applying it. */
async function dryRun(uid: string, projectId: string, now: Date): Promise<Response> {
  const current = await getConversionUploadMapping(uid, projectId);
  if (!current?.conversionAction) return refuse("Nejdřív vyberte konverzní akci v Google Ads.");

  let events;
  try {
    events = await listConversionEvents(projectId, { uploaded: false, limit: DRAIN_ROW_SCAN });
  } catch {
    return apiError(502, "Konverzní ledger se nepodařilo načíst.", "provider-error", { envelope: "ok" });
  }
  // The SAME two functions the drain calls, in the same order — this is what makes
  // "the operator approved what will be sent" true rather than aspirational.
  const batch = drainCandidates(events, current, DRY_RUN_MAX_ROWS);
  const rows = buildGoogleUploadRows(batch, current);

  // Best-effort live check. Never blocks: `validated: null` means "not asked".
  let validated: boolean | null = null;
  const live = await resolveLiveActor(uid);
  if ("actor" in live && rows.length > 0) {
    try {
      const outcome = await uploadClickConversions(live.actor.token, live.actor.customerId, rows, {
        validateOnly: true,
      });
      validated = outcome.failed.length === 0;
    } catch {
      validated = null;
    }
  }

  const mapping: ConversionUploadMapping = await mutateConversionUploadMapping(
    uid,
    projectId,
    now,
    (m) => recordDryRun(m, { rows: rows.length, validated }, now)
  );
  return Response.json({
    ok: true,
    mapping,
    rows: rows.length,
    dropped: batch.length - rows.length,
    validated,
    sample: rows.slice(0, DRY_RUN_SAMPLE),
  });
}
