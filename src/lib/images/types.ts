/** Creative Studio domain model — framework-free (no React, no I/O, no firebase),
 *  shared by the studio orchestrator, the API route and the UI. */

export const IMAGE_STYLES = [
  "dynamic",
  "vibrant",
  "cinematic",
  "bokeh",
  "portrait",
  "fashion",
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

export const IMAGE_STYLE_LABELS: Record<ImageStyle, string> = {
  dynamic: "Dynamický",
  vibrant: "Živý",
  cinematic: "Filmový",
  bokeh: "Bokeh",
  portrait: "Portrét",
  fashion: "Fashion",
};

export const IMAGE_FORMATS = ["square", "portrait45", "landscape169", "story916"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

export interface FormatPreset {
  label: string;
  width: number;
  height: number;
  /** tailwind aspect ratio for the preview tiles */
  aspect: string;
}

/** Format → Leonardo dimensions (multiples of 8) + a preview aspect class. */
export const IMAGE_FORMAT_PRESETS: Record<ImageFormat, FormatPreset> = {
  square: { label: "Čtverec 1:1", width: 1024, height: 1024, aspect: "aspect-square" },
  portrait45: { label: "Portrét 4:5", width: 1024, height: 1280, aspect: "aspect-[4/5]" },
  landscape169: { label: "Na šířku 16:9", width: 1536, height: 864, aspect: "aspect-video" },
  story916: { label: "Story 9:16", width: 864, height: 1536, aspect: "aspect-[9/16]" },
};

export const MAX_IMAGE_CANDIDATES = 4;

/** One generated candidate returned to the client (no raw bytes). */
export interface GeneratedImage {
  /** data: URL for immediate preview + download (ephemeral) */
  dataUrl: string;
  mime: string;
  /** Gemini-vision quality score 1–10 (null when scoring unavailable) */
  score: number | null;
  /** one-line defects summary from the vision pass */
  defects: string;
  /** the highest-scored candidate */
  winner: boolean;
}

export interface ImageGenResult {
  prompt: string;
  style: ImageStyle;
  format: ImageFormat;
  /** which provider produced the set */
  source: "leonardo" | "demo";
  images: GeneratedImage[];
  /** library id of the persisted winner, when saved (signed-in + live) */
  savedId?: string;
}

/** A persisted creative in the tenant's asset library (no bytes). */
export interface CreativeSummary {
  id: string;
  prompt: string;
  style: string;
  format: string;
  score: number | null;
  createdAt: string;
}

export function isImageStyle(v: unknown): v is ImageStyle {
  return typeof v === "string" && (IMAGE_STYLES as readonly string[]).includes(v);
}
export function isImageFormat(v: unknown): v is ImageFormat {
  return typeof v === "string" && (IMAGE_FORMATS as readonly string[]).includes(v);
}
