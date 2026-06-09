import { generateAds, generateAnalysis, generateBrief } from "@/lib/gemini";
import {
  validateAdRequest,
  validateAnalysisRequest,
  validateBriefRequest,
} from "@/lib/ai-types";

// The Gemini SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON v požadavku." }, { status: 400 });
  }

  const mode = (body as { mode?: unknown })?.mode;

  try {
    switch (mode) {
      case "ads": {
        const parsed = validateAdRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateAds(parsed.value));
      }
      case "brief": {
        const parsed = validateBriefRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateBrief(parsed.value));
      }
      case "analysis": {
        const parsed = validateAnalysisRequest(body);
        if (!parsed.valid) return Response.json({ error: parsed.error }, { status: 422 });
        return Response.json(await generateAnalysis(parsed.value));
      }
      default:
        return Response.json({ error: "Neznámý režim nástroje." }, { status: 400 });
    }
  } catch (err) {
    console.error(`[ai] generation failed (mode=${String(mode)}):`, err);
    return Response.json(
      { error: "Generování se nezdařilo. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  }
}
