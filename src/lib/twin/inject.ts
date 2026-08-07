/** Which voice — if any — may be INJECTED into an AI generation for a project.
 *
 *  The trained/sample split matters here more than anywhere else in the module:
 *  `resolveTwin` merges the seeded per-type sample UNDER a tenant's saved voices so
 *  the editor always has something to show, but that merge must never leak into a
 *  generation. An untrained real tenant whose "voice" is the canned per-type Czech
 *  persona from `sample.ts` would have the app silently impersonating a brand it
 *  has never met (and in Czech, whatever the tenant's locale).
 *
 *  So the rule lives here, pure and pinned:
 *   - a DEMO project speaks in the sample voice — that is the sample's job; the
 *     public demo output should show twin flavour;
 *   - a TENANT project speaks ONLY in voices it actually saved (`trainedScopes`,
 *     from the resolve seam) — and a saved-then-emptied voice (directives cleared)
 *     is an editor draft, not a trained voice, so it injects nothing either.
 *
 *  Demo-ness comes from the projects demo seam (`ProjectKind`), never from a string
 *  prefix test. Framework-free and side-effect-free so the unit suite can pin every
 *  branch without a store. */
import type { ProjectKind } from "@/lib/projects/demo";
import { resolveVoice, type ToneScope, type TwinState, type TwinVoice } from "./types";

/** The voice that may speak for this project on `scope`, or undefined when nothing
 *  trained (tenant) / nothing seeded (demo) governs it. */
export function selectInjectableVoice(
  resolved: { state: TwinState; trainedScopes: ToneScope[] },
  kind: ProjectKind,
  scope: ToneScope
): TwinVoice | undefined {
  const pool =
    kind === "demo"
      ? resolved.state.voices
      : resolved.state.voices.filter((v) => resolved.trainedScopes.includes(v.scope));
  const voice = resolveVoice(pool, scope);
  // A voice row with no directives is an empty editor draft, not a trained voice.
  if (!voice || !voice.directives.trim()) return undefined;
  return voice;
}
