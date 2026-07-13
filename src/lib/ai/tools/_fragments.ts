/** Shared prompt / demo text fragments for the structured AI tools.
 *
 *  Two things were copy-pasted across the grounded tools: the anti-fabrication
 *  rule ("Vycházej VÝHRADNĚ z … — nevymýšlej si …") re-authored in five system
 *  prompts, and the keyless-demo tail ("Ukázkový výstup — připojte LLM …") in
 *  five demo outputs. Centralising them means one deliberate diff moves every
 *  affected tool together, and the provider names never drift between tools.
 *
 *  Hash-tracked by the LLM gate (scripts/llm-gate.mjs HASHED_FILES) because
 *  `antiFabrication` feeds five SYSTEM prompts — editing it must re-prove those
 *  tools' output against the real model. Server-only-agnostic, pure strings. */

/** The provider names surfaced in the keyless-demo note — one source of truth. */
export const DEMO_PROVIDERS = "Claude v devu, Gemini v produkci";

/** The shared anti-fabrication instruction. `source` names what the model must
 *  stay strictly within (e.g. „předaných čísel", „předaného textu stránky",
 *  „předaných klíčových slov"). Kept as one sentence so a tool can append its own
 *  specific caveat after it. */
export const antiFabrication = (source: string): string =>
  `Vycházej VÝHRADNĚ z ${source} — nevymýšlej si žádné údaje, které v podkladech nejsou.`;

/** The keyless-demo tail appended to a deterministic demo output: „ Ukázkový
 *  výstup — připojte LLM (…) pro <what>." `what` completes the sentence per tool
 *  (e.g. „diagnostiku od modelu", „plán na míru"). Leading space so it appends
 *  cleanly after a preceding sentence. */
export const demoTail = (what: string): string =>
  ` Ukázkový výstup — připojte LLM (${DEMO_PROVIDERS}) pro ${what}.`;
