/** The eight module groups behind the lamps: their spectral hue (a Phase 1
 *  token), cord length in stage units, and which stylised sample their room
 *  draws. Names, blurbs and module examples live in copy/groups.ts. */
import { SPECTRUM } from "../spectrum";
import type { GROUPS_T } from "../copy/groups";

export type GroupKey = keyof (typeof GROUPS_T)["en"];
export type SampleKind = "analytics" | "campaigns" | "content" | "creative" | "local" | "social" | "leads" | "catalog";

export const SAMPLES: readonly SampleKind[] = ["analytics", "campaigns", "content", "creative", "local", "social", "leads", "catalog"];
export const CORDS = [0.55, 0.85, 1.15, 1.3, 1.3, 1.15, 0.85, 0.55] as const;
export const HUE = SPECTRUM;
export const COUNT = 8;

export const pad = (n: number) => (n < 10 ? "0" : "") + n;
export const nameKey = (i: number) => `g${i}Name` as GroupKey;
export const descKey = (i: number) => `g${i}Desc` as GroupKey;
export const modsKey = (i: number) => `g${i}Mods` as GroupKey;

/** "lamp-3" -> 2; anything else -> -1 */
export function lampIndex(room: string): number {
  const m = /^lamp-([1-8])$/.exec(room);
  return m ? Number(m[1]) - 1 : -1;
}
