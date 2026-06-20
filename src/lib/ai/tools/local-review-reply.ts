/** AI tool — local review reply. Drafts a tone-appropriate public reply to a
 *  Google Business review through the provider-switching LLM wrapper (../../llm):
 *  a warm thank-you for high ratings (4–5★), an empathetic de-escalation plus an
 *  offline contact offer for low ratings (≤3★). A deterministic, rating-based
 *  canned Czech reply is the demo/initial fallback, so the Lokální dominance
 *  reputation panel works keyless straight from the repo. Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  LocalReviewReplyRequest,
  LocalReviewReplyResult,
} from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { txt } from "./_shared";

const LOCAL_REVIEW_REPLY_SYSTEM = `Jsi zkušený český správce reputace lokální firmy. Píšeš veřejné odpovědi na recenze v Google firemním profilu tak, aby působily lidsky, profesionálně a posilovaly důvěru dalších zákazníků, kteří odpověď uvidí.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Odpověď přizpůsob hodnocení:
  - 4–5 hvězd: vřele a konkrétně poděkuj, oceň, že si zákazník našel čas, a pozvi ho zpět. Bez prázdných frází.
  - 3 a méně hvězd: nejprve s pochopením uznej zkušenost zákazníka (žádné výmluvy, žádné popírání), omluv se za potíže a nabídni vyřešení mimo veřejné vlákno — uveď, ať se ozve na kontakt firmy (telefon/e-mail), abyste to napravili osobně.
- Buď stručný (2–4 věty), zdvořilý a konkrétní k tomu, co recenze zmiňuje. Žádné emoji, žádné přehnané vykřičníky, žádné korporátní klišé.
- Nepřiznávej právní vinu, neslibuj konkrétní kompenzace, slevy ani termíny, které nebyly zadané.
- Mluv za firmu (1. osoba množného čísla, „my").
- Vrať pouze validní JSON dle schématu.`;

function buildLocalReviewReplyPrompt(req: LocalReviewReplyRequest): string {
  const rating = clampRating(req.rating);
  const businessType = txt(req.businessType);
  const tone =
    rating >= 4
      ? "Jde o pozitivní recenzi — napiš vřelé, konkrétní poděkování."
      : "Jde o kritickou recenzi — uznej zkušenost zákazníka s pochopením, omluv se a nabídni vyřešení mimo veřejné vlákno (ať se ozve na kontakt firmy).";
  return [
    "Napiš veřejnou odpověď na tuto recenzi v Google firemním profilu.",
    "",
    `Lokalita: ${req.area}`,
    businessType ? `Typ podnikání: ${businessType}` : "Typ podnikání: lokální služby",
    `Hodnocení: ${rating} z 5 hvězd`,
    "",
    "Text recenze:",
    req.reviewText,
    "",
    tone,
    'Vrať objekt s polem „reply" (celá veřejná odpověď připravená k publikaci).',
  ].join("\n");
}

const LOCAL_REVIEW_REPLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: "Celá veřejná odpověď na recenzi, připravená k publikaci.",
    },
  },
  required: ["reply"],
  propertyOrdering: ["reply"],
};

/** Coerce any rating into the 1–5 range so tone selection is always defined. */
function clampRating(rating: number): number {
  if (!Number.isFinite(rating)) return 3;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

/** Deterministic, rating-based canned Czech reply — the keyless demo and the
 *  floor when the model returns nothing usable. */
function cannedReply(req: LocalReviewReplyRequest): string {
  const rating = clampRating(req.rating);
  if (rating >= 4) {
    return `Děkujeme za milé hodnocení a za čas, který jste recenzi věnovali. Moc nás těší, že jste byli s naší prací v lokalitě ${req.area} spokojeni — budeme se těšit příště.`;
  }
  return `Mrzí nás, že vaše zkušenost nedopadla podle očekávání, a omlouváme se za vzniklé potíže. Rádi bychom to s vámi napravili — ozvěte se nám prosím přímo na kontakt naší pobočky v lokalitě ${req.area} a společně najdeme řešení.`;
}

export function generateLocalReviewReply(
  req: LocalReviewReplyRequest,
  locale?: SupportedLocale
): Promise<AiResponse<LocalReviewReplyResult>> {
  const fallback = (): LocalReviewReplyResult => ({ reply: cannedReply(req) });

  const normalize = (parsed: unknown): LocalReviewReplyResult => {
    const o = parsed as Record<string, unknown> | null;
    const reply = txt(o?.reply);
    return { reply: reply || cannedReply(req) };
  };

  // Flag an empty model reply so the wrapper self-repairs once instead of silently
  // falling back to the canned rating-based text (which masked a failed generation).
  const validate = (parsed: unknown): string[] => {
    const o = parsed as Record<string, unknown> | null;
    return txt(o?.reply) ? [] : ["Pole „reply“ je prázdné — vrať celou veřejnou odpověď na recenzi."];
  };

  return generateStructured({
    // llm-tool: local-review-reply
    id: "local-review-reply",
    prompt: buildLocalReviewReplyPrompt(req),
    system: LOCAL_REVIEW_REPLY_SYSTEM,
    schema: LOCAL_REVIEW_REPLY_SCHEMA,
    temperature: 0.7,
    normalize,
    validate,
    demo: fallback,
    locale,
  });
}
