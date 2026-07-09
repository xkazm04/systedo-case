/** Server helper: resolve the trained voice a project speaks in on one channel,
 *  flattened for an AI request.
 *
 *  The voice is loaded SERVER-SIDE from the project's twin, never accepted from the
 *  client — exactly like `resolveBrandContext`. A caller that could post its own
 *  `voice` could make another tenant's twin say anything, and the voice is injected
 *  into the USER prompt only, so the tools' goldens (system + schema) are untouched.
 *
 *  Returns `undefined` for an untrained twin, an unowned project, or any store
 *  hiccup — every consumer treats that as "write plainly, on brand". Mirrors the
 *  tenancy shape of `brand/load`. */
import "server-only";
import type { Project } from "@/lib/projects/types";
import type { TwinReplyVoice } from "@/lib/ai-types";
import { getProject } from "@/lib/projects/store";
import { DEMO_PROJECTS } from "@/lib/demo/projects";
import { resolveTwin } from "./resolve";
import { resolveVoice, type ToneScope } from "./types";
import { voiceToWire } from "./wire";

/** The wire voice for one project + scope, or undefined when nothing is trained. */
export async function loadTwinVoice(project: Project, scope: ToneScope): Promise<TwinReplyVoice | undefined> {
  const { state } = await resolveTwin(project.id, project.type);
  const voice = resolveVoice(state.voices, scope);
  // A voice row with no directives is an empty editor draft, not a trained voice.
  if (!voice || !voice.directives.trim()) return undefined;
  return voiceToWire(voice);
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
