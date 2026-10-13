/** The one self-repair re-prompt note the wrapper appends when a first output violates the
 *  tool's domain limits. Lives in its own module so the gateway-served path
 *  (./gateway-generate.ts) can append the byte-identical note without importing the wrapper
 *  that imports it. Pure. */
export function buildRepairNote(violations: string[]): string {
  return [
    "",
    "POZOR: předchozí pokus porušil tyto limity:",
    ...violations.map((v) => `- ${v}`),
    "Vrať prosím CELÝ JSON znovu přesně podle schématu a striktně dodrž uvedené limity (raději mírně pod limitem).",
  ].join("\n");
}
