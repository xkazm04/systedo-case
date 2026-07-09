/** The trained-voice prompt fragment, shared by every tool that writes in the
 *  brand's voice: `twin-reply` (outbound messages), `social` (post drafts) and
 *  `repurpose` (channel variants).
 *
 *  It is appended to the USER prompt only — never the system prompt or schema — so
 *  each tool's gate/eval contract fingerprint stays untouched, exactly like
 *  `refineLines`. The voice itself is resolved SERVER-SIDE from the project's twin
 *  (see lib/twin/load), never accepted from the client.
 *
 *  One definition, because three copies of "how do we phrase the always/never
 *  block" would drift the moment one tool's rules changed. Pure. */
import type { TwinReplyVoice } from "../../ai-types";
import { cleanList, txt } from "./_shared";

/** Prompt lines for a trained voice — `[]` when the twin is untrained, in which
 *  case each tool's own "write plainly, on brand" system rules govern.
 *
 *  `heading` names the surface the voice is being applied to, so the model knows a
 *  post is not a reply („Hlas značky na tomto kanálu" vs „…v příspěvcích"). */
export function voiceLines(voice: TwinReplyVoice | undefined, heading?: string): string[] {
  if (!voice) return [];
  const out: string[] = [];
  const directives = txt(voice.directives);
  if (directives) {
    out.push("", heading ?? "Hlas značky na tomto kanálu — piš přesně takto:", directives);
  }
  const traits = cleanList(voice.traits, 8);
  if (traits.length > 0) out.push(`Rysy hlasu: ${traits.join(", ")}`);
  const lengthHint = txt(voice.lengthHint);
  if (lengthHint) out.push(`Obvyklá délka: ${lengthHint}`);
  const always = cleanList(voice.always, 12);
  if (always.length > 0) out.push("", "VŽDY:", ...always.map((r) => `- ${r}`));
  const never = cleanList(voice.never, 12);
  if (never.length > 0) out.push("", "NIKDY:", ...never.map((r) => `- ${r}`));
  return out;
}
