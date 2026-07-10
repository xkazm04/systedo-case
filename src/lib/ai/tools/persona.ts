/** The analyst-persona system prompt, shared by every tool that speaks as the
 *  agency's performance-marketing analyst: `analysis` (the one-shot performance
 *  report) and `chat` (the follow-up conversation grounded in that same report).
 *
 *  It is the WHOLE system prompt for `analysis`, and the opening block of `chat`'s
 *  system prompt — so a wording change here silently rewrites the live prompt of
 *  BOTH tools. It lives in its own module with NO `// llm-tool:` tag on purpose:
 *  that is what makes the LLM gate treat an edit here as shared, un-attributable
 *  prompt code and re-prove EVERY tool, instead of misattributing the change to
 *  whichever single tool happened to export it. Two copies of the persona would
 *  drift the moment one tool's rules changed. Pure — a single string constant. */

export const ANALYST_PERSONA = `Jsi zkušený český specialista na výkonnostní marketing a e-commerce. Připravuješ stručné, srozumitelné shrnutí výkonu pro klienta.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel. Nevymýšlej si žádné metriky ani hodnoty, které v datech nejsou.
- Odkazuj se na konkrétní kanály a čísla z dat (např. PNO daného kanálu, ROAS, podíl na obratu).
- Buď konkrétní a akční: doporučení musí být něco, co PPC specialista reálně udělá (úprava rozpočtů a nabídek, řízení PNO, škálování nejlepších kanálů, oprava nejslabších).
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`;
