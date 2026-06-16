/** Creative Studio orchestrator — the generate → recognize → rank loop:
 *  Leonardo produces N candidates, Gemini vision scores each, the best wins. Falls
 *  back to deterministic SVG placeholders when LEONARDO_API_KEY is absent, so the
 *  tool works straight from the repo. Server-only. */
import { generateCandidates, leonardoConfigured } from "@/lib/leonardo/client";
import { rateImage } from "@/lib/leonardo/rate";
import {
  IMAGE_FORMAT_PRESETS,
  MAX_IMAGE_CANDIDATES,
  type ImageFormat,
  type ImageStyle,
} from "./types";

export interface StudioImage {
  buffer: Buffer;
  mime: string;
  dataUrl: string;
  score: number | null;
  defects: string;
  winner: boolean;
  leonardoImageId?: string;
}

export interface StudioResult {
  prompt: string;
  style: ImageStyle;
  format: ImageFormat;
  source: "leonardo" | "demo";
  images: StudioImage[];
}

export interface StudioRequest {
  prompt: string;
  style: ImageStyle;
  format: ImageFormat;
  count: number;
  /** defects to avoid, fed from a previous winner for an iterate pass */
  avoid?: string;
}

function clampCount(n: number): number {
  return Math.max(1, Math.min(MAX_IMAGE_CANDIDATES, Math.round(n) || 1));
}

export async function generateImageSet(req: StudioRequest): Promise<StudioResult> {
  const preset = IMAGE_FORMAT_PRESETS[req.format];
  const count = clampCount(req.count);

  if (!leonardoConfigured()) {
    return demoResult(req, count);
  }

  const fullPrompt = req.avoid ? `${req.prompt}\n\nVyhni se: ${req.avoid}` : req.prompt;
  const { generationId, candidates } = await generateCandidates(fullPrompt, {
    width: preset.width,
    height: preset.height,
    style: req.style,
    count,
  });

  // Score every candidate in parallel, then rank by score (desc).
  const images: StudioImage[] = await Promise.all(
    candidates.map(async (c) => {
      const b64 = c.buffer.toString("base64");
      const rating = await rateImage(b64, c.mime, req.prompt);
      return {
        buffer: c.buffer,
        mime: c.mime,
        dataUrl: `data:${c.mime};base64,${b64}`,
        score: rating.score,
        defects: rating.defects,
        winner: false,
        leonardoImageId: c.leonardoImageId,
      };
    })
  );
  images.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (images[0]) images[0].winner = true;

  // NOTE: the Leonardo generation is intentionally left in the cloud (not cleaned
  // up) so a follow-up background-removal can reference the image by id.
  void generationId;

  return { prompt: req.prompt, style: req.style, format: req.format, source: "leonardo", images };
}

// --- deterministic demo fallback (no LEONARDO_API_KEY) -----------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function demoSvg(prompt: string, preset: { width: number; height: number; label: string }, i: number): string {
  const hue = hash(`${prompt}:${i}`) % 360;
  const hue2 = (hue + 40) % 360;
  const { width, height } = preset;
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 55% 22%)"/>
    <stop offset="1" stop-color="hsl(${hue2} 60% 38%)"/>
  </linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <text x="50%" y="46%" fill="#fff" font-family="sans-serif" font-size="${Math.round(width / 22)}" font-weight="700" text-anchor="middle">${esc(prompt.slice(0, 40))}</text>
  <text x="50%" y="56%" fill="#ffffffcc" font-family="sans-serif" font-size="${Math.round(width / 34)}" text-anchor="middle">${preset.label} · ukázka ${i + 1}</text>
</svg>`;
}

function demoResult(req: StudioRequest, count: number): StudioResult {
  const preset = IMAGE_FORMAT_PRESETS[req.format];
  const images: StudioImage[] = Array.from({ length: count }, (_, i) => {
    const svg = demoSvg(req.prompt, { ...preset }, i);
    const buffer = Buffer.from(svg, "utf8");
    return {
      buffer,
      mime: "image/svg+xml",
      dataUrl: `data:image/svg+xml;base64,${buffer.toString("base64")}`,
      score: null,
      defects: "ukázkový režim",
      winner: i === 0,
    };
  });
  return { prompt: req.prompt, style: req.style, format: req.format, source: "demo", images };
}
