/** Creative Studio orchestrator — the generate → recognize → rank loop:
 *  Leonardo produces N candidates, Gemini vision scores each, the best wins. Falls
 *  back to deterministic SVG placeholders when LEONARDO_API_KEY is absent, so the
 *  tool works straight from the repo. Server-only. */
import { generateCandidates, leonardoConfigured } from "@/lib/leonardo/client";
import { rateImage } from "@/lib/leonardo/rate";
import { recordGeneration } from "./generations-store";
import { recordLlmCall } from "@/lib/llm/telemetry";
// Shared demo core — the same FNV-1a hash as the other demo generators
// (one implementation instead of copies), keeping the placeholder hue stable.
import { hashStr } from "@/lib/demo/prng.mjs";

// Coarse per-image cost estimates so the priciest calls in the app stop being
// invisible — refine once real Leonardo-credit / Gemini-vision rates are wired.
const LEONARDO_USD_PER_IMAGE = 0.02;
const VISION_USD_PER_IMAGE = 0.002;
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
  /** whether this candidate was actually vision-scored (a real rank), vs. crowned
   *  arbitrarily because scoring was unavailable/degraded on the live path. The demo
   *  and any all-null-score set are `false`, so the UI + revenue attribution can tell
   *  a quality-ranked winner from an arbitrary one. */
  scored: boolean;
  leonardoImageId?: string;
}

/** Mark the ranked winner among the candidates (mutates in place). Sorts by score
 *  desc, then crowns the first. When EVERY candidate came back without a vision score
 *  (no GEMINI key, or every rateImage failed/429'd), the sort is a no-op tie and the
 *  first is arbitrary — not "ranked best". We still pick one so the flow has a winner,
 *  but flag it `scored: false` + a "bez vision skóre" defect so it isn't fed into
 *  deriveStylePrior / revenue attribution as if quality-ranked. */
export function crownWinner(images: StudioImage[]): void {
  images.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const first = images[0];
  if (!first) return;
  const anyScored = images.some((im) => im.score !== null);
  first.winner = true;
  if (!anyScored) {
    first.scored = false;
    first.defects = first.defects || "bez vision skóre";
  }
}

export interface StudioResult {
  prompt: string;
  style: ImageStyle;
  format: ImageFormat;
  source: "leonardo" | "demo";
  images: StudioImage[];
  /** the Leonardo generation these candidates came from — persisted with a saved
   *  winner so the reaper keeps it alive (nobg re-derivation). Absent for demo. */
  generationId?: string;
}

export interface StudioRequest {
  prompt: string;
  style: ImageStyle;
  format: ImageFormat;
  count: number;
  /** brand kit (palette, visual style, tonality) — grounds BOTH generation and the
   *  vision scoring, so the winner reflects brand-fit, not just generic quality */
  brand?: string;
  /** defects to avoid, fed from a previous winner for an iterate pass */
  avoid?: string;
  /** style prior learned from creative→revenue attribution, prepended to bias
   *  generation toward the best-earning look */
  prior?: string;
  /** Leonardo image ids to guide generation (reference images, STYLE mode) */
  imagePromptIds?: string[];
  /** a single reference used as the img2img init image (faithful PRODUCT mode) */
  initImageId?: string;
  /** product-fidelity 0.1–0.9 for init-image mode (higher = closer to the product) */
  fidelity?: number;
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

  const brandBlock = req.brand
    ? `Drž se značky (barvy, vizuální styl, tonalita): ${req.brand}`
    : "";
  const base = [brandBlock, req.prior, req.prompt].filter(Boolean).join("\n\n");
  const fullPrompt = req.avoid ? `${base}\n\nVyhni se: ${req.avoid}` : base;
  const tGen = Date.now();
  const { generationId, candidates } = await generateCandidates(fullPrompt, {
    width: preset.width,
    height: preset.height,
    style: req.style,
    count,
    imagePromptIds: req.imagePromptIds,
    initImageId: req.initImageId,
    initStrength: req.fidelity,
  });
  // Telemetry — the most expensive call in the app was previously unrecorded.
  await recordLlmCall({
    toolId: "creative-image-gen",
    promptHash: "image-gen",
    provider: "leonardo",
    model: req.initImageId ? "leonardo-img2img" : "leonardo-txt2img",
    demo: false,
    tookMs: Date.now() - tGen,
    attempts: 1,
    repaired: false,
    estCostUsd: candidates.length * LEONARDO_USD_PER_IMAGE,
    inputTokens: 0,
    outputTokens: 0,
    at: new Date().toISOString(),
  });

  // Score every candidate in parallel, then rank by score (desc). The brand kit is
  // passed to the scorer too, so the winner is the best brand-fit, not just the
  // prettiest generic image.
  const tScore = Date.now();
  const images: StudioImage[] = await Promise.all(
    candidates.map(async (c) => {
      const b64 = c.buffer.toString("base64");
      const rating = await rateImage(b64, c.mime, req.prompt, req.brand);
      return {
        buffer: c.buffer,
        mime: c.mime,
        dataUrl: `data:${c.mime};base64,${b64}`,
        score: rating.score,
        defects: rating.defects,
        winner: false,
        // a real numeric score means this candidate was genuinely vision-ranked
        scored: rating.score !== null,
        leonardoImageId: c.leonardoImageId,
      };
    })
  );
  // Telemetry — N parallel Gemini-vision scoring calls, also previously unrecorded.
  await recordLlmCall({
    toolId: "creative-vision-score",
    promptHash: "vision-score",
    provider: "gemini",
    model: "gemini-vision",
    demo: false,
    tookMs: Date.now() - tScore,
    attempts: candidates.length,
    repaired: false,
    estCostUsd: candidates.length * VISION_USD_PER_IMAGE,
    inputTokens: 0,
    outputTokens: 0,
    at: new Date().toISOString(),
  });
  crownWinner(images);

  // Record the generation in the ledger so the reaper can eventually clean it up.
  // The generation is intentionally left in the cloud for now so a follow-up
  // background-removal (nobg) can reference the winner by image id; the reaper
  // deletes it past the grace window UNLESS a saved winner still references it.
  await recordGeneration(generationId, new Date().toISOString());

  return { prompt: req.prompt, style: req.style, format: req.format, source: "leonardo", images, generationId };
}

// --- deterministic demo fallback (no LEONARDO_API_KEY) -----------------------

function demoSvg(prompt: string, preset: { width: number; height: number; label: string }, i: number): string {
  const hue = hashStr(`${prompt}:${i}`) % 360;
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
      scored: false,
    };
  });
  return { prompt: req.prompt, style: req.style, format: req.format, source: "demo", images };
}
