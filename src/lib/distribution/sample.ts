/** Illustrative source article + per-channel distribution attribution for a
 *  content/media project. Real-integration seam: social/scheduler APIs + UTM
 *  attribution. */

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
