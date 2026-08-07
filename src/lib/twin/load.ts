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
import { isDemoProjectId, resolveProjectKind } from "@/lib/projects/demo";
import { demoProjectById } from "@/lib/demo/projects";
import { resolveTwin } from "./resolve";
import { selectInjectableVoice } from "./inject";
import { channelConfig, draftGateVerdict, type DraftGateVerdict, type ToneScope, type TwinChannel } from "./types";
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
    if (isDemoProjectId(projectId)) {
      const demo = demoProjectById(projectId);
      return demo ? await loadTwinVoice(demo, scope) : undefined;
    }
    if (userId) {
      const project = await getProject(userId, projectId);
      if (project) return await loadTwinVoice(project, scope);
    }
  } catch {
    /* store hiccup — fall through to the untrained default */
  }
  return undefined;
}

/** May the twin DRAFT on this project's channel? ("review means review".) Správa
 *  kanálů promises a disabled or human-only (`review`) channel that the twin does
 *  not write there — and until now that promise was one disabled button, so a
 *  direct /api/ai call drafted on a locked channel anyway. This resolver gives the
 *  twin-reply mode the server-side answer, from the SAME channel config (and the
 *  same seeded fallback via `resolveTwin`) the sprava-kanalu screen edits.
 *
 *  Degradation posture mirrors `resolveTwinVoice`: no projectId, an unowned/unknown
 *  id, or a store hiccup ALLOW drafting — those calls carry no tenant twin to speak
 *  for (no voice, no brand resolves either), so there is no channel promise to
 *  enforce, and a transient store error must not lock a paying user out of
 *  drafting. A resolvable project's config is authoritative: disabled/`review`
 *  refuses. */
export async function resolveTwinDraftGate(
  projectId: string | undefined,
  userId: string | null,
  channel: TwinChannel
): Promise<DraftGateVerdict> {
  if (!projectId) return { allowed: true };
  try {
    const demo = DEMO_PROJECTS.find((p) => p.id === projectId);
    const project = demo ?? (userId ? await getProject(userId, projectId) : null);
    if (!project) return { allowed: true };
    const resolved = await resolveTwin(project.id, project.type);
    return draftGateVerdict(channelConfig(resolved.state.channels, channel));
  } catch {
    return { allowed: true }; // store hiccup — degrade open, like every grounding resolver
  }
}
