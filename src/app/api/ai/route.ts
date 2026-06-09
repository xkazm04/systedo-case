import { generateAds } from "@/lib/gemini";
import { validateAdRequest } from "@/lib/ai-types";

// The Gemini SDK needs the Node.js runtime (not Edge).
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON v požadavku." }, { status: 400 });
  }

  const parsed = validateAdRequest(body);
  if (!parsed.valid) {
    return Response.json({ error: parsed.error }, { status: 422 });
  }

  try {
    const response = await generateAds(parsed.value);
    return Response.json(response);
  } catch (err) {
    console.error("[ai] generation failed:", err);
    return Response.json(
      { error: "Generování se nezdařilo. Zkuste to prosím za chvíli znovu." },
      { status: 502 }
    );
  }
}
