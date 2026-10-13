/** The six areas of a project (ADR-0013). Pure data, no React: the registry in
 *  `modules.ts` assigns each module to one of these, the sidebar draws one lamp
 *  per area, and the kit colours each area by its own spectral line (ADR-0014).
 *
 *  `hue` is a CSS colour token name (`--color-area-<key>`), never a raw value, so
 *  the binding stays in `globals.css`. `motif` names the engraved instrument
 *  drawn for the area in `components/kit/art/AreaArt.tsx`. */

export type AreaKey = "home" | "performance" | "reach" | "local" | "studio" | "channels";

export type AreaMotif = "beam" | "detector" | "prism" | "compass" | "lens" | "antenna";

export interface AreaDef {
  key: AreaKey;
  /** URL segment under /app/[projectId]; Home is the project root. */
  slug: string;
  order: number;
  label: string;
  labelEn: string;
  /** One line: the question this area's roof answers. */
  question: string;
  questionEn: string;
  motif: AreaMotif;
}

export const AREAS: readonly AreaDef[] = [
  {
    key: "home",
    slug: "",
    order: 0,
    label: "Přehled",
    labelEn: "Home",
    question: "Co se změnilo a co udělat teď",
    questionEn: "What changed, and what to do now",
    motif: "beam",
  },
  {
    key: "performance",
    slug: "performance",
    order: 1,
    label: "Výkon",
    labelEn: "Performance",
    question: "Jak se daří a proč",
    questionEn: "How it is going, and why",
    motif: "detector",
  },
  {
    key: "reach",
    slug: "reach",
    order: 2,
    label: "Dosah",
    labelEn: "Reach",
    question: "Kde utrácíte a co se vrací",
    questionEn: "Where the spend goes, and what comes back",
    motif: "prism",
  },
  {
    key: "local",
    slug: "local",
    order: 3,
    label: "Lokální",
    labelEn: "Local",
    question: "Jak vás najdou v okolí",
    questionEn: "How people nearby find you",
    motif: "compass",
  },
  {
    key: "studio",
    slug: "studio",
    order: 4,
    label: "Tvorba",
    labelEn: "Studio",
    question: "Co je rozpracované a co vytvořit dál",
    questionEn: "What is in progress, and what to make next",
    motif: "lens",
  },
  {
    key: "channels",
    slug: "channels",
    order: 5,
    label: "Kanály",
    labelEn: "Channels",
    question: "Kde jste vidět a kdo odpovídá",
    questionEn: "Where you are seen, and who is answering",
    motif: "antenna",
  },
];

export function areaByKey(key: AreaKey): AreaDef {
  const a = AREAS.find((x) => x.key === key);
  if (!a) throw new Error(`unknown area: ${key}`);
  return a;
}

/** The Tailwind-visible colour token for an area's spectral line. */
export function areaHueVar(key: AreaKey): string {
  return `var(--color-area-${key})`;
}
