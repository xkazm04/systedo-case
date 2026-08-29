/** Manage the signed-in user's client microsite:
 *   GET    → the tenant's microsite config (or null)
 *   POST   → publish/update {periodDays?, segment?} — white-label identity
 *            (client/brand name + accent) is NOT collected here anymore; it is
 *            resolved from the report config (with the existing microsite's own
 *            persisted values winning first). Explicit {clientName, brandName,
 *            accentColor} in the body still override, for back-compat.
 *   DELETE → take it offline
 *  The slug is derived from the resolved client name; a slug already owned by
 *  another tenant is rejected. Node runtime. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { rejectUnknownProject } from "@/lib/projects/api-guard";
import { recordActivity } from "@/lib/campaigns/activity";
import { slugify } from "@/lib/nav";
import { getReportConfig } from "@/lib/campaigns/report-config";
import { resolveMicrositeIdentity } from "@/lib/microsite-identity";
import {
  getMicrosite,
  getMicrositeForTenant,
  enableMicrosite,
  disableMicrosite,
  disableMicrositeSlug,
  MicrositeSlugError,
  type LocalPagePayload,
  type LpPagePayload,
} from "@/lib/microsite";
// W2-C — the local-landing publish path: wire-door bounds (pure) + the server-side
// re-derivation of every fact the page prints.
import { isOperatorContact, mintLocalSlug, sanitizeLocalPageText } from "@/lib/microsite/local-page";
import { resolveLocalPage } from "@/lib/local-signals/page-grounding";
// W3-B — the hosted LP experiment publish path: the same split (prose on the wire,
// identity from the server) one payload over.
import { isOperatorTarget, mintLpSlug, sanitizeLpArms } from "@/lib/microsite/lp-page";
import { mintArmId } from "@/lib/lp-exp/serve";
import { clearExperimentHosted, listExperiments, setExperimentHosted } from "@/lib/lp-exp/store";


export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ microsite: null });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  return Response.json({ microsite: await getMicrositeForTenant(tenant) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Pro publikování se přihlaste." }, { status: 401 });

  let body: {
    clientName?: unknown;
    segment?: unknown;
    brandName?: unknown;
    accentColor?: unknown;
    periodDays?: unknown;
    projectId?: unknown;
    // W2-C: which renderer to publish, and (for `local-landing`) the generated
    // service×area page. Both optional — an omitted `kind` keeps the historical
    // performance publish byte-identical.
    kind?: unknown;
    local?: unknown;
    // W3-B: the hosted LP experiment's arm copy. Optional on the same terms.
    lp?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });

  // Resolve the white-label identity ONCE: an explicit body override wins (back-
  // compat), then the microsite's own previously-persisted values (so an existing
  // site keeps its name/colour), then the report config (the single white-label
  // source), then the demo default. getMicrositeForTenant returns even a disabled
  // site, so a take-offline → re-publish keeps its prior identity and slug.
  const [reportConfig, ownSite] = await Promise.all([
    getReportConfig(tenant),
    getMicrositeForTenant(tenant),
  ]);
  const identity = resolveMicrositeIdentity(
    {
      clientName: typeof body.clientName === "string" ? body.clientName : undefined,
      accentColor: typeof body.accentColor === "string" ? body.accentColor : undefined,
      brandName: typeof body.brandName === "string" ? body.brandName : undefined,
    },
    ownSite ?? undefined,
    {
      clientName: reportConfig.clientProfile.name,
      accentColor: reportConfig.accentColor,
      brandName: reportConfig.brandName,
    }
  );

  // W2-C — a `local-landing` publish is a different shape: one page per service×area,
  // so the slug carries the combination and the FACTS (service spelling, price, price
  // model, currency) are re-derived server-side from the owned project's catalog. Only
  // the prose the operator previewed rides the wire.
  const kind =
    body.kind === "local-landing" ? "local-landing" : body.kind === "lp" ? "lp" : undefined;
  let local: LocalPagePayload | undefined;
  let lp: LpPagePayload | undefined;
  // W3-B — which experiment the publish binds, resolved server-side and reused after
  // the publish lands to stamp the experiment's `hosted` binding + arm identities.
  let hostedExperimentId: string | undefined;
  let hostedArmIds: string[] = [];
  let slug: string;
  if (kind === "local-landing") {
    const submitted = (body.local ?? {}) as Record<string, unknown>;
    const service = typeof submitted.service === "string" ? submitted.service : "";
    const area = typeof submitted.area === "string" ? submitted.area : "";
    const page = sanitizeLocalPageText(submitted.page);
    if (!service || !area || !page) {
      return Response.json({ error: "Chybí obsah stránky k publikaci." }, { status: 422 });
    }
    const grounded = await resolveLocalPage(projectId, userId, service, area);
    if (!grounded) {
      return Response.json({ error: "Pro tento projekt nelze stránku publikovat." }, { status: 422 });
    }
    const g = grounded.request;
    local = {
      service: g.service,
      area: g.area,
      page,
      ...(g.price !== undefined ? { price: g.price } : {}),
      ...(g.priceModel !== undefined ? { priceModel: g.priceModel } : {}),
      ...(g.currency !== undefined ? { currency: g.currency } : {}),
      ...(isOperatorContact(submitted.contact) ? { contact: submitted.contact } : {}),
      generatedAt: new Date().toISOString(),
    };
    slug = mintLocalSlug(identity.clientName, g.service, g.area);
  } else if (kind === "lp") {
    // W3-B — the split is the whole point, so what the wire may carry is the ARM
    // COPY and nothing else. Which experiment this is, how many arms it has and what
    // each arm's counting identity is are all re-derived here from the OWNED
    // project's experiments (projectId already went through rejectUnknownProject
    // above, ADR-0002), so a tampered body can neither invent an arm the experiment
    // does not have nor aim a counter at another tenant's test.
    const submitted = (body.lp ?? {}) as Record<string, unknown>;
    const experimentId = typeof submitted.experimentId === "string" ? submitted.experimentId : "";
    // No project → no store to sync the counters back into, so the page would count
    // traffic nothing would ever read. Refuse rather than publish a dead measurement.
    if (!projectId || !experimentId) {
      return Response.json({ error: "Chybí experiment k publikaci." }, { status: 422 });
    }
    const experiment = (await listExperiments(projectId)).find((e) => e.id === experimentId);
    if (!experiment) {
      return Response.json({ error: "Experiment nenalezen." }, { status: 422 });
    }
    // The arm count is the experiment's, not the body's: a page with fewer arms than
    // the experiment would leave a variant silently unmeasured while `evaluate()`
    // kept reading its stale hand-typed number as if it were live.
    const submittedArms = Array.isArray(submitted.arms) ? submitted.arms : [];
    if (submittedArms.length !== experiment.variants.length) {
      return Response.json({ error: "Počet variant neodpovídá experimentu." }, { status: 422 });
    }
    // Re-publishing REUSES each arm's existing identity, so the counters already
    // collected keep attributing to the arm they were collected for.
    hostedArmIds = experiment.variants.map((v) => v.armId || mintArmId());
    const arms = sanitizeLpArms(submittedArms, hostedArmIds);
    if (arms.length === 0) {
      return Response.json({ error: "Chybí obsah variant k publikaci." }, { status: 422 });
    }
    hostedExperimentId = experiment.id;
    lp = {
      experimentId: experiment.id,
      projectId,
      arms,
      ...(isOperatorTarget(submitted.target) ? { target: submitted.target } : {}),
      generatedAt: new Date().toISOString(),
    };
    slug = mintLpSlug(identity.clientName, experiment.cluster);
  } else {
    slug = slugify(identity.clientName);
  }
  if (!slug) return Response.json({ error: "Z názvu nelze vytvořit URL." }, { status: 422 });

  // Don't let one tenant hijack another's public slug.
  const other = await getMicrosite(slug);
  if (other && other.tenant !== tenant) {
    return Response.json({ error: "Tato adresa je už obsazená, zvolte jiný název." }, { status: 409 });
  }

  const periodDays = Number(body.periodDays);
  let microsite;
  try {
    microsite = await enableMicrosite(tenant, {
      slug,
      clientName: identity.clientName,
      segment: typeof body.segment === "string" ? body.segment : ownSite?.segment,
      brandName: identity.brandName,
      accentColor: identity.accentColor,
      periodDays: Number.isFinite(periodDays) ? periodDays : ownSite?.periodDays,
      // The owning project (already ownership-checked above) keys the synced-metrics
      // substitution on the public page; a re-publish keeps the previous binding when
      // the request carries no project.
      projectId: projectId ?? ownSite?.projectId,
      ...(kind ? { kind } : {}),
      ...(local ? { local } : {}),
      ...(lp ? { lp } : {}),
    });
  } catch (err) {
    // The store now enforces slug shape + ownership itself (the getMicrosite
    // pre-check above misses DISABLED foreign sites, which don't round-trip
    // through it) — map its typed refusals to the same client-facing errors.
    // Wave-0 carry-forward closed: `invalid-kind` used to fall through to the 409
    // "address taken" message, which is simply untrue — the slug is free, the KIND is
    // not publishable (or its payload is missing). It gets its own 422 and its own
    // sentence, so the client is not sent renaming a page that has nothing wrong
    // with its name.
    if (err instanceof MicrositeSlugError) {
      if (err.code === "invalid-slug") {
        return Response.json({ error: "Z názvu nelze vytvořit URL." }, { status: 422 });
      }
      if (err.code === "invalid-kind") {
        return Response.json({ error: "Tento typ stránky zatím nelze publikovat." }, { status: 422 });
      }
      return Response.json({ error: "Tato adresa je už obsazená, zvolte jiný název." }, { status: 409 });
    }
    throw err;
  }
  // W3-B — the experiment's own binding is stamped AFTER the page is live, never
  // before: an experiment marked `hosted` whose page failed to publish would be shown
  // in the module as splitting traffic it is not splitting, and the sync step would
  // start overwriting its hand-typed numbers with zeros.
  if (lp && hostedExperimentId && projectId) {
    await setExperimentHosted(projectId, hostedExperimentId, hostedArmIds, microsite.slug);
  }
  await recordActivity(tenant, {
    kind: "update",
    module: lp ? "experimenty-lp" : local ? "lokalni" : "reporty",
    severity: "success",
    title: lp
      ? "LP experiment publikován"
      : local
        ? "Lokální stránka publikována"
        : "Klientská microsite publikována",
    detail: lp
      ? `${microsite.slug} · ${lp.arms.length} variant`
      : local
        ? `${local.service} — ${local.area}`
        : identity.clientName,
    actor: "Vy",
  });
  return Response.json({ microsite });
}

export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
  // W2-C — a tenant now owns MANY microsites (one performance card plus a local page
  // per covered service×area), so an offline request may name WHICH slug. Ownership is
  // settled against the stored config's own tenant, never against the request. Without
  // a slug the behaviour is byte-identical to before (the capped single site).
  const slug = new URL(request.url).searchParams.get("slug");
  if (slug) {
    // W3-B — read the config BEFORE it goes dark, so an `lp` page's owning experiment
    // can have its `hosted` binding cleared. Read first because `getMicrosite` returns
    // null for a disabled site, and afterwards there would be nothing left to find the
    // experiment by.
    const before = await getMicrosite(slug);
    const removed = await disableMicrositeSlug(tenant, slug);
    if (!removed) return Response.json({ error: "Stránka nenalezena." }, { status: 404 });
    const hostedLp = before?.kind === "lp" ? before.lp : undefined;
    if (hostedLp) {
      // Best-effort: the PAGE is already offline, which is the thing the operator
      // asked for. A failed bookkeeping write must not turn that into an error — the
      // sync step simply keeps the arm's last numbers until the binding clears.
      // The counter rows are deliberately NOT deleted: they are real measured traffic,
      // and a re-publish resumes on the same arm identities.
      await clearExperimentHosted(hostedLp.projectId, hostedLp.experimentId).catch(() => false);
    }
    await recordActivity(tenant, {
      kind: "update", module: hostedLp ? "experimenty-lp" : "lokalni", severity: "warning",
      title: hostedLp ? "LP experiment vypnut" : "Lokální stránka vypnuta",
      detail: slug, actor: "Vy",
    });
    return Response.json({ ok: true });
  }
  await disableMicrosite(tenant);
  await recordActivity(tenant, {
    kind: "update", module: "reporty", severity: "warning",
    title: "Klientská microsite vypnuta", detail: "", actor: "Vy",
  });
  return Response.json({ ok: true });
}
