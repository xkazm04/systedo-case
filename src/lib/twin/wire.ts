/** The one place a stored `TwinVoice` becomes the flat `TwinReplyVoice` the AI
 *  request carries. The stored shape keeps do/don't rules as one tagged list (it
 *  reads better in the editor); the wire shape splits them into `always`/`never`
 *  so the request validates without object parsing. Doing that conversion inline at
 *  each call site is exactly how the two drift apart.
 *
 *  Framework-free and side-effect-free, so both the client module and a future
 *  server-side drafter can use it. */
import type { TwinReplyVoice } from "@/lib/ai-types";
import type { TwinVoice } from "./types";

export function voiceToWire(voice: TwinVoice): TwinReplyVoice {
  const wire: TwinReplyVoice = {};
  const directives = voice.directives.trim();
  if (directives) wire.directives = directives;
  if (voice.traits.length > 0) wire.traits = voice.traits;
  const lengthHint = voice.lengthHint.trim();
  if (lengthHint) wire.lengthHint = lengthHint;
  const always = voice.constraints.filter((c) => c.kind === "do").map((c) => c.rule);
  if (always.length > 0) wire.always = always;
  const never = voice.constraints.filter((c) => c.kind === "dont").map((c) => c.rule);
  if (never.length > 0) wire.never = never;
  return wire;
}
