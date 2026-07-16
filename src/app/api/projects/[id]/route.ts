/** Single-project update + delete for the signed-in user. Server-only. */
import { deleteProject, updateProject } from "@/lib/projects/store";
import { requireOwnedProject } from "@/lib/projects/api-guard";
import { deleteProjectCascade } from "@/lib/projects/delete-cascade";
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
  if (typeof body.adsCustomerId === "string") patch.adsCustomerId = body.adsCustomerId;

  const project = await updateProject(uid, id, patch);
  if (!project) return notFound("Projekt nenalezen.", "not-found");

  // Surface the change on the project-wide activity feed (best-effort, never throws).
  const changed = Object.keys(patch);
  if (changed.length > 0) {
    const adsLinked = "adsCustomerId" in patch && Boolean(patch.adsCustomerId);
    const brandingOnly = changed.every((k) => k === "accentColor" || k === "logoUrl");
    await emitProjectActivity(
      uid,
      id,
      adsLinked
        ? { kind: "update", module: "integrace", severity: "success", title: "Google Ads napojen", detail: `Účet ${patch.adsCustomerId}`, actor: "Vy" }
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

  // Scrub every satellite store + tenant-keyed Firestore data first (best-effort,
  // never throws), THEN remove the workspace doc itself so a satellite hiccup can't
  // strand the project's data behind a deleted entry.
  const cascade = await deleteProjectCascade(uid, id);
  await deleteProject(uid, id);

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
