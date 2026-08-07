/** Server helper: resolve the trained voice a project speaks in on one channel,
 *  flattened for an AI request.
 *
 *  The voice is loaded SERVER-SIDE from the project's twin, never accepted from the
 *  client — exactly like `resolveBrandContext`. A caller that could post its own
 *  `voice` could make another tenant's twin say anything, and the voice is injected
 *  into the USER prompt only, so the tools' goldens (system + schema) are untouched.
 *
 *  Returns `undefined` for an untrained twin, an unowned project, or any store
 *  hiccup — every consumer treats that as "write plainly, on brand". A DEMO project
 *  is the one exception: it speaks in the seeded sample voice, because the public
 *  demo output should show twin flavour. A real tenant NEVER inherits that sample —
 *  the trained/sample split comes from the resolve seam + the projects demo seam
 *  (`selectInjectableVoice`), so an untrained tenant writes plainly instead of
 *  impersonating a canned persona. Mirrors the tenancy shape of `brand/load`. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import type { TwinReplyVoice } from "@/lib/ai-types";
import { getProject } from "@/lib/projects/store";
import { resolveProjectKind } from "@/lib/projects/demo";
import { DEMO_PROJECTS } from "@/lib/demo/projects";
import { resolveTwin } from "./resolve";
import { selectInjectableVoice } from "./inject";
import type { ToneScope } from "./types";
import { voiceToWire } from "./wire";

/** The wire voice for one project + scope, or undefined when nothing is trained. */
export async function loadTwinVoice(project: Project, scope: ToneScope): Promise<TwinReplyVoice | undefined> {
  const resolved = await resolveTwin(project.id, project.type);
  const voice = selectInjectableVoice(resolved, resolveProjectKind(project.id), scope);
  return voice ? voiceToWire(voice) : undefined;
}

/** Tenancy-checked variant for the route handlers: a demo project is public, a real
 *  project must belong to the caller. */
export async function resolveTwinVoice(
  projectId: string | undefined,
  userId: string | null,
  scope: ToneScope
): Promise<TwinReplyVoice | undefined> {
  if (!projectId) return undefined;
  try {
    const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
    if (demo) return await loadTwinVoice(demo, scope);
    if (userId) {
      const project = await getProject(userId, projectId);
      if (project) return await loadTwinVoice(project, scope);
    }
  } catch {
    /* store hiccup — fall through to the untrained default */
  }
  return undefined;
}
