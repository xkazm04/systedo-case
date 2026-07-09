/** Illustrative source article + per-channel distribution attribution for a
 *  content/media project. Real-integration seam: social/scheduler APIs + UTM
 *  attribution. */
import type { Project } from "@/lib/projects/types";
import { projectVary } from "@/lib/project-data/vary";

export interface SourceArticle {
  title: string;
  url: string;
  /** The article body/excerpt the channel variants are repurposed FROM. Without it
   *  the repurpose tool can only work from the headline (BM-L1-04) — so the demo
   *  source carries a real excerpt and the ContentEngine handoff passes the draft. */
  body?: string;
}

export interface ChannelPerf {
  channel: string;
  reach: number;
  clicks: number;
}

// A neutral, real content-marketing article (with a body) so the repurpose tool has
// actual substance to adapt per channel — not just a headline — and so the demo isn't
// tied to a single unrelated niche (part of BM-L1-04 / de-hardcoding).
export const SAMPLE_SOURCE: SourceArticle = {
  title: "Jak z jednoho článku vytěžit maximum: návod na chytrou distribuci",
  url: "https://blog.example.cz/distribuce-obsahu",
  body: [
    "Napsat dobrý článek je jen půlka práce. Ta druhá — a často opomíjená — je dostat ho k lidem. Jeden kvalitní text totiž unese pět až osm dalších formátů, když ho správně přebalíte pro každý kanál.",
    "Začněte tím, že z článku vytáhnete jednu hlavní myšlenku a tři konkrétní poznatky. Ty se stanou kostrou pro newsletter, LinkedIn příspěvek i krátká videa. Newsletter dostane osobní úvod a jasnou výzvu k přečtení; LinkedIn věcný post s odrážkami; Instagram vizuál s háčkem hned v první větě.",
    "Klíč je nepřepisovat článek doslova, ale převyprávět to nejdůležitější v jazyce daného kanálu. Každý kanál má jiné publikum, jinou délku a jiný tón — co funguje v newsletteru, na TikToku propadne.",
    "Nakonec všechno opatřete UTM parametry, ať víte, který kanál reálně přivádí čtenáře. Bez měření jen střílíte naslepo; s ním po pár týdnech přesně víte, kam vložit další čas.",
  ].join("\n\n"),
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
