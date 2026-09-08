/* ---------------------------------------------------------------------------
   /lp/story — VARIANT A: TIME. One protagonist, the scroll is the film.
   Patterns P1 P2 P6 P10 from docs/design/nextgen-landing.md, and nothing else
   on purpose: no gallery, no type switch. If this page works, it is because a
   visitor watched one project go from an address to a running account.

   References (P8): DESIGN.md (the world); Bart's watch → wrist film (V4 00:38);
   Orbital Garden's "open on the artefact, not on a pitch" (R1).

   THE COMPOSER computes every fact the film shows, from the same sources the
   shipped homepage and the app read, and hands SERIALISABLE data to the stage.
   The stage and captions are server components; the only client code is the
   observer in StoryFilm that writes `data-scene`.
--------------------------------------------------------------------------- */
import { freeChannelFacts } from "@/components/marketing/kanaly/facts";
import { buildSnapshot } from "@/lib/snapshot";
import { performance } from "@/lib/data";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact } from "@/lib/format";
import { STAGE_LABELS } from "@/components/app/channels/labels";
import { getServerLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";
import StoryFilm from "./StoryFilm";
import StoryStage, { type StageData } from "./StoryStage";
import StoryCaptions, { SCENES } from "./StoryCaptions";
import StoryRail from "./StoryRail";
import StoryClosing from "./StoryClosing";

/** How many channels the field shows — enough to read as a landscape. */
const TILES = 12;
/** Days of revenue the line draws at scene 4 — the same window as the figures. */
const DAYS = 90;

const T = {
  cs: {
    offering: "Nabídka",
    localities: "Lokality",
    keywords: "Slova",
    roas: "ROAS portfolia",
    pno: "PNO · cíl {goal}",
    revenue: "obrat připsaný marketingu",
    delta: "obrat vs. předchozí období",
  },
  en: {
    offering: "Offering",
    localities: "Localities",
    keywords: "Words",
    roas: "Portfolio ROAS",
    pno: "PNO · target {goal}",
    revenue: "revenue attributed to marketing",
    delta: "revenue vs. prior period",
  },
} as const;

export default async function StoryLanding() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const { demo, curatedChannels } = freeChannelFacts();
  const snap = buildSnapshot("90d");

  const ranked = [...demo.plan].sort((a, b) => b.fit - a.fit).slice(0, TILES);
  const data: StageData = {
    domain: demo.project.domain ?? "",
    facets: [
      { label: t("offering"), values: demo.grounding.offering ? [demo.grounding.offering] : [] },
      { label: t("localities"), values: demo.grounding.localities ?? [] },
      { label: t("keywords"), values: demo.grounding.keywords ?? [] },
    ],
    tiles: ranked.map((c, i) => ({ name: c.name, fit: c.fit, effort: c.effort, top: i < 3 })),
    stages: (["identified", "planned", "live", "done"] as const).map(
      (s) => STAGE_LABELS[s][locale] ?? STAGE_LABELS[s].en ?? s
    ),
    series: performance.daily.slice(-DAYS).map((d) => d.revenue),
    figures: [
      { value: fmtMultiple(snap.current.roas), label: t("roas") },
      { value: fmtPct(snap.current.pno), label: t("pno", { goal: fmtPct(snap.goalPno, 0) }) },
      { value: fmtCZKCompact(snap.current.revenue), label: t("revenue") },
      { value: fmtSignedPct(snap.delta.revenue), label: t("delta") },
    ],
  };

  return (
    <>
      <StoryFilm
        scenes={SCENES}
        stage={<StoryStage data={data} />}
        captions={<StoryCaptions channels={curatedChannels} />}
      />
      <StoryRail />
      <StoryClosing />
    </>
  );
}
