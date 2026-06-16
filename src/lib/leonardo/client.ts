/** Leonardo AI image client (REST, server-only, dependency-free) — ported from
 *  the personas `leonardo` skill. Generates N candidates with the Lucid Origin
 *  model and returns their bytes; the studio layer scores them with Gemini vision
 *  and picks the best. Requires LEONARDO_API_KEY; without it the studio degrades
 *  to deterministic placeholders. */
import type { ImageStyle } from "@/lib/images/types";

const BASE = "https://cloud.leonardo.ai/api/rest/v1";
const LUCID_ORIGIN_MODEL = "7b592283-e8a7-4c5a-9ba6-d18c31f258b9";

const STYLE_UUIDS: Record<ImageStyle, string> = {
  bokeh: "9fdc5e8c-4d13-49b4-9ce6-5a74cbb19177",
  cinematic: "a5632c7c-ddbb-4e2f-ba34-8456ab3ac436",
  dynamic: "111dc692-d470-4eec-b791-3475abac4c46",
  fashion: "594c4a08-a522-4e0e-b7ff-e4dac4b6b622",
  portrait: "8e2bc543-6ee2-45f9-bcd9-594b6ce84dcd",
  vibrant: "dee282d3-891f-4f73-ba02-7f8131e5541b",
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40;

export function leonardoConfigured(): boolean {
  return Boolean(process.env.LEONARDO_API_KEY);
}

async function api(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const opts: RequestInit = {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${process.env.LEONARDO_API_KEY ?? ""}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    throw new Error(`Leonardo ${res.status} ${path}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GenImage {
  id?: string;
  url?: string;
}

async function pollGeneration(generationId: string): Promise<GenImage[]> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const data = await api("GET", `/generations/${generationId}`);
    const gen = data.generations_by_pk as { status?: string; generated_images?: GenImage[] } | null;
    if (!gen) throw new Error("Leonardo generation not found");
    if (gen.status === "COMPLETE") return gen.generated_images ?? [];
    if (gen.status === "FAILED") throw new Error("Leonardo generation failed");
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Leonardo generation timed out");
}

export interface LeonardoCandidate {
  buffer: Buffer;
  mime: string;
  /** Leonardo cloud image id — needed for follow-up ops (e.g. background removal) */
  leonardoImageId: string;
}

export interface LeonardoGeneration {
  generationId: string;
  candidates: LeonardoCandidate[];
}

/** Generate `count` candidate images and download their bytes. */
export async function generateCandidates(
  prompt: string,
  opts: { width: number; height: number; style: ImageStyle; contrast?: number; count: number }
): Promise<LeonardoGeneration> {
  const body = {
    prompt,
    modelId: LUCID_ORIGIN_MODEL,
    width: opts.width,
    height: opts.height,
    num_images: opts.count,
    contrast: opts.contrast ?? 3.5,
    alchemy: false,
    ultra: false,
    styleUUID: STYLE_UUIDS[opts.style],
  };

  const submit = await api("POST", "/generations", body);
  const generationId = (submit.sdGenerationJob as { generationId?: string } | undefined)?.generationId;
  if (!generationId) throw new Error("Leonardo returned no generationId");

  const images = await pollGeneration(generationId);
  const candidates: LeonardoCandidate[] = [];
  for (const img of images) {
    if (!img.url) continue;
    const res = await fetch(img.url);
    if (!res.ok) continue;
    candidates.push({
      buffer: Buffer.from(await res.arrayBuffer()),
      mime: "image/png",
      leonardoImageId: img.id ?? "",
    });
  }
  if (candidates.length === 0) throw new Error("Leonardo produced no downloadable images");
  return { generationId, candidates };
}

/** Best-effort cloud cleanup so generations don't pile up on the account. Not
 *  called automatically while background-removal is supported (the cloud image
 *  must persist so a follow-up nobg variation can reference it). */
export async function cleanupGeneration(generationId: string): Promise<void> {
  try {
    await api("DELETE", `/generations/${generationId}`);
  } catch {
    /* non-critical */
  }
}

/** Remove the background of a generated image (Leonardo nobg variation), returning
 *  the transparent PNG bytes. The image must still exist in the Leonardo cloud
 *  (i.e. its generation wasn't cleaned up). */
export async function removeBackground(imageId: string): Promise<{ buffer: Buffer; mime: string }> {
  const submit = await api("POST", "/variations/nobg", { id: imageId, isVariation: false });
  const jobId = (submit.sdNobgJob as { id?: string } | undefined)?.id;
  if (!jobId) throw new Error("Leonardo nobg returned no job id");

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const data = await api("GET", `/variations/${jobId}`);
    const v = (data.generated_image_variation_generic as { status?: string; url?: string }[] | undefined)?.[0];
    if (v?.status === "COMPLETE" && v.url) {
      const res = await fetch(v.url);
      if (!res.ok) throw new Error(`Leonardo nobg download ${res.status}`);
      return { buffer: Buffer.from(await res.arrayBuffer()), mime: "image/png" };
    }
    if (v?.status === "FAILED") throw new Error("Leonardo nobg failed");
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("Leonardo nobg timed out");
}
