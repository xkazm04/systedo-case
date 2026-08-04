/** Single-project update + delete for the signed-in user. Server-only. */
import { deleteProject, updateProject } from "@/lib/projects/store";
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { requireLinkableAdsAccount } from "@/lib/projects/ads-link-guard";
import { type AdsLinkAction } from "@/lib/projects/ads-link";
import { deleteProjectCascade } from "@/lib/projects/delete-cascade";
import { recordOrphan } from "@/lib/projects/orphan-ledger";
import { sweepProjectOrphans } from "@/lib/projects/orphan-sweep";
import { type ProjectPatch } from "@/lib/projects/types";
import { emitProjectActivity } from "@/lib/activity/emit";
import {
  badRequest,
  isProjectType,
  isSafeAccentColor,
  isSafeHttpUrl,
  notFound,
  readJson,
  unprocessable,
} from "@/lib/api/route-utils";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid } = g;

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return badRequest("Neplatný požadavek.", "bad-request");

  const patch: ProjectPatch = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (isProjectType(body.type)) patch.type = body.type;
  // Branding flows into PUBLIC surfaces (the tokenized client share report bakes
  // accent + logo into its payload), so validate at the boundary like the sibling
  // sanitizers — an empty string stays allowed (it clears the field).
  if (typeof body.accentColor === "string") {
    const accent = body.accentColor.trim();
    if (accent && !isSafeAccentColor(accent)) {
      return unprocessable("Neplatná barva — použijte hex zápis (#rrggbb).", "unprocessable");
    }
    patch.accentColor = accent;
  }
  if (typeof body.logoUrl === "string") {
    const logoUrl = body.logoUrl.trim();
    if (logoUrl && !isSafeHttpUrl(logoUrl)) {
      return unprocessable("Neplatná URL loga — povolené jsou jen http(s) adresy.", "unprocessable");
    }
    patch.logoUrl = logoUrl;
  }
  if (typeof body.domain === "string") patch.domain = body.domain.trim();

  // The Ads link is the one field with consequences OUTSIDE this project: the sync
  // fan-out follows it, so an unverified or double-claimed id lands real spend in the
  // wrong client's report. Gate it (409 collision / 422 unknown account) before it is
  // stored, and remember what the write actually DID so the activity record is honest.
  // `""` clears the field (unlink) — normalizeProjectPatch maps it to null.
  let adsAction: AdsLinkAction | null = null;
  if (typeof body.adsCustomerId === "string") {
    const requested = body.adsCustomerId.trim();
    const gate = await requireLinkableAdsAccount(uid, g.project, requested);
    if ("error" in gate) return gate.error;
    patch.adsCustomerId = requested;
    adsAction = gate.verdict.ok ? gate.verdict.action : null;
  }

  const project = await updateProject(uid, id, patch);
  if (!project) return notFound("Projekt nenalezen.", "not-found");

  // Surface the change on the project-wide activity feed (best-effort, never throws).
  const changed = Object.keys(patch);
  if (changed.length > 0) {
    const brandingOnly = changed.every((k) => k === "accentColor" || k === "logoUrl");
    // Report what actually happened to the link, not just "napojen": an unlink and a
    // relink are the changes an agency most needs to find later when a client's
    // numbers move, and announcing "napojen" on an unlink was simply wrong.
    const adsRecord =
      adsAction === "link" || adsAction === "relink"
        ? { title: adsAction === "relink" ? "Google Ads přepojen" : "Google Ads napojen", detail: `Účet ${patch.adsCustomerId}`, severity: "success" as const }
        : adsAction === "unlink"
          ? { title: "Google Ads odpojen", detail: "Projekt už nemá napojený účet", severity: "warning" as const }
          : null;
    await emitProjectActivity(
      uid,
      id,
      adsRecord
        ? { kind: "update", module: "integrace", severity: adsRecord.severity, title: adsRecord.title, detail: adsRecord.detail, actor: "Vy" }
        : {
            kind: "update",
            module: brandingOnly ? "branding" : "nastaveni",
            severity: "info",
            title: brandingOnly ? "Branding upraven" : "Nastavení projektu upraveno",
            detail: `Změněno: ${changed.join(", ")}`,
            actor: "Vy",
          }
    );
  }

  return Response.json({ project });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Ownership FIRST: a foreign/absent id must 404 before any deletion cascade runs
  // (previously this returned a silent {ok:true} for ids the caller never owned).
  // The guard also resolves the workspace so the audit record can name it (it's gone
  // by the time we log).
  const g = await requireOwnedProject(id);
  if ("error" in g) return g.error;
  const { uid, project } = g;

  // Finish any cleanup a PREVIOUS delete of this user's left behind, before adding to
  // it. This is the sweep's primary invocation (see below): it costs one ledger read
  // when there is nothing pending — the overwhelmingly common case — and it means a
  // transient store outage heals itself on the next delete instead of waiting for
  // someone to notice. Best-effort: a sweep hiccup must never block this delete.
  try {
    await sweepProjectOrphans(uid, { apply: true });
  } catch (err) {
    console.error("[projects] resume sweep failed (continuing with the delete)", err);
  }

  // Scrub every satellite store + tenant-keyed Firestore data first (best-effort,
  // never throws), THEN remove the workspace doc itself so a satellite hiccup can't
  // strand the project's data behind a deleted entry.
  const cascade = await deleteProjectCascade(uid, id);
  await deleteProject(uid, id);

  // A store that failed leaves data behind that NOTHING can reach once the project
  // doc is gone — the id used to survive only inside an audit-log detail string.
  // Record it durably instead, so cleanup is resumable (by the sweep above, or on
  // demand via /api/projects/orphans). Best-effort: the delete itself still succeeded.
  if (cascade.failed.length > 0) {
    try {
      await recordOrphan(uid, {
        projectId: id,
        projectName: project.name,
        pending: cascade.failed.map((f) => f.name),
        lastError: cascade.failed[0]?.error,
      });
    } catch (err) {
      console.error("[projects] could not record the orphaned stores", err);
    }
  }

  // Audit the deletion on the USER-level feed (projectId omitted) — the project's
  // own tenant was just scrubbed, so a project-scoped record would be orphaned.
  await emitProjectActivity(uid, undefined, {
    kind: "update",
    module: "nastaveni",
    severity: cascade.failed.length > 0 ? "warning" : "info",
    title: "Projekt smazán",
    detail:
      project.name +
      (cascade.failed.length > 0 ? ` · ${cascade.failed.length} úložišť selhalo` : ""),
    actor: "Vy",
  });

  return Response.json({
    ok: true,
    cleaned: cascade.cleaned,
    failed: cascade.failed.map((f) => f.name),
  });
}
