/** Gemini vision scoring — the "recognize" half of the generate→score→iterate
 *  loop. Rates a generated image 1–10 and summarizes defects, so the studio can
 *  pick the best candidate and feed defects back into a refinement pass. Reuses
 *  GEMINI_API_KEY; degrades to a null score when unavailable. Server-only. */

import { GEMINI_MODEL } from "@/lib/llm/models";

const BASE = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
// Use the app's single Gemini model (gemini-3-flash-preview, multimodal) for the
// vision scoring too; override only if a dedicated vision model is ever needed.
const MODEL = process.env.GEMINI_VISION_MODEL ?? GEMINI_MODEL;

export interface ImageRating {
  /** 1–10, or null when scoring is unavailable */
  score: number | null;
  /** one-line defects summary (or "none") */
  defects: string;
}

/** Score a single image (base64) against the intended prompt. Never throws —
 *  returns a null score on any failure so generation still succeeds. */
export async function rateImage(
  base64: string,
  mime: string,
  intendedPrompt: string,
  brand?: string
): Promise<ImageRating> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { score: null, defects: "bez GEMINI_API_KEY" };

  const brandClause = brand
    ? `soulad se značkou (barvy/styl/tonalita: "${brand.slice(0, 200)}"), `
    : "";
  const instruction =
    `Ohodnoť tento obrázek 1–10 za vizuální kvalitu, soulad se zadáním, ` +
    `${brandClause}čistotu a absenci typických AI artefaktů / zmršeného textu. ` +
    `Obrázek má odpovídat zadání: "${intendedPrompt.slice(0, 240)}". ` +
    (brand ? `Obrázky mimo styl značky výrazně sniž v hodnocení. ` : "") +
    `Odpověz POUZE tímto JSON (bez markdown): {"score": <celé číslo 1-10>, "defects": "<jednou větou nebo 'none'>"}`;

  try {
    const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ inlineData: { mimeType: mime, data: base64 } }, { text: instruction }] },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
      }),
    });
    if (!res.ok) return { score: null, defects: `vision ${res.status}` };
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    let text = "";
    for (const c of data.candidates ?? []) for (const p of c.content?.parts ?? []) if (p.text) text += p.text;
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      const parsed = JSON.parse(text) as { score?: unknown; defects?: unknown };
      const score = Number(parsed.score);
      return {
        score: Number.isFinite(score) ? Math.max(1, Math.min(10, Math.round(score))) : null,
        defects: typeof parsed.defects === "string" ? parsed.defects : "none",
      };
    } catch {
      const m = text.match(/"?score"?\s*:\s*(\d+)/i);
      return { score: m ? Number(m[1]) : null, defects: text.slice(0, 120) || "none" };
    }
  } catch {
    return { score: null, defects: "vision chyba" };
  }
}
