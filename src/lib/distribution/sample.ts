/** Illustrative source article + per-channel distribution attribution for a
 *  content/media project. Real-integration seam: social/scheduler APIs + UTM
 *  attribution. */
import type { Project } from "@/lib/projects/types";
import { projectVary } from "@/lib/project-data/vary";

export interface SourceArticle {
  title: string;
  url: string;
}

export interface ChannelPerf {
  channel: string;
  reach: number;
  clicks: number;
}

export const SAMPLE_SOURCE: SourceArticle = {
  title: "Spánek miminka: kompletní průvodce",
  url: "https://blog.example.cz/spanek-miminka",
};

export const SAMPLE_ATTRIBUTION: ChannelPerf[] = [
  { channel: "Newsletter", reach: 8400, clicks: 1260 },
  { channel: "LinkedIn", reach: 5200, clicks: 364 },
  { channel: "Instagram", reach: 11800, clicks: 472 },
  { channel: "X / Twitter", reach: 3100, clicks: 186 },
];

/** Per-project attribution: reach + clicks scaled by one uniform per-project
 *  factor, so each project shows different volumes while every per-channel CTR and
 *  the channels' share of total reach stay exactly as designed. */
export function attributionForProject(project: Project): ChannelPerf[] {
  const v = projectVary(project, "distribution");
  return SAMPLE_ATTRIBUTION.map((c) => ({ ...c, reach: v.int(c.reach), clicks: v.int(c.clicks) }));
}
