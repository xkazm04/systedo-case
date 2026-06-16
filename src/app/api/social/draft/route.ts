/** Deterministic social-post drafting: topic + tone + platforms → one tailored
 *  caption per platform. No LLM, instant — a first draft to edit. */
import { draftPosts } from "@/lib/social/draft";
import { TONES, isSocialPlatform, type SocialPlatform, type Tone } from "@/lib/social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(request: Request) {
  let body: { topic?: unknown; tone?: unknown; platforms?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const topic = str(body.topic);
  if (topic.length < 2 || topic.length > 200) {
    return Response.json({ error: "Zadejte téma (2–200 znaků)." }, { status: 422 });
  }
  const tone: Tone = (TONES as readonly string[]).includes(str(body.tone)) ? (body.tone as Tone) : "pratelsky";
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(isSocialPlatform) as SocialPlatform[];
  if (platforms.length === 0) {
    return Response.json({ error: "Vyberte alespoň jednu platformu." }, { status: 422 });
  }

  return Response.json({ drafts: draftPosts(topic, tone, platforms) });
}
