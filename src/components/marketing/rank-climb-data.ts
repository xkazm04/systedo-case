/** RankClimbDemo's static data: the colocated cs/en label dictionary, the two pin
 *  orders the climb animates between, and the canvas coordinate of each rank slot.
 *  Split out of RankClimbDemo.tsx to keep the component under the 200-line ceiling. */
import type { SupportedLocale } from "@/lib/format";

export interface RankClimbLabels {
  run: string;
  running: string;
  replay: string;
  reset: string;
  avgRank: string;
  visibility: string;
  target: string;
  readouts: string;
  beforeAfter: string;
  beforeAfterSub: string;
  rank1Firing: string;
  idleAwaiting: string;
  signalStrong: string;
  signalIdle: string;
  you: string;
}

/** Default labels per locale (colocated cs/en dictionary — repo i18n convention).
 *  A caller can still override any subset via the `labels` prop (LocalSeoShowcase
 *  passes its own full set); these defaults keep a bare <RankClimbDemo /> fully
 *  localized instead of falling back to Czech-only literals. */
export const RANK_CLIMB_T: Record<SupportedLocale, RankClimbLabels> = {
  cs: {
    run: "Spustit optimalizaci",
    running: "Běží…",
    replay: "Přehrát znovu",
    reset: "Reset",
    avgRank: "Průměrná pozice v mapě",
    visibility: "Viditelnost v mapách",
    target: "cíl",
    readouts: "Živé hodnoty",
    beforeAfter: "Před a po.",
    beforeAfterSub: "Stejných pět konkurentů, stejné hledání. Změnila se jen práce.",
    rank1Firing: "Pozice #1 · signál běží",
    idleAwaiting: "Nečinné · čeká na signál",
    signalStrong: "Signál · SILNÝ",
    signalIdle: "Signál · KLID",
    you: "Vaše pobočka",
  },
  en: {
    run: "Run optimization",
    running: "Running…",
    replay: "Replay",
    reset: "Reset",
    avgRank: "Average map pack rank",
    visibility: "Map pack visibility",
    target: "target",
    readouts: "Live readouts",
    beforeAfter: "Before & after.",
    beforeAfterSub: "The same five competitors, the same search. Only the work changed.",
    rank1Firing: "Ranked #1 · ping firing",
    idleAwaiting: "Idle · awaiting signal",
    signalStrong: "Signal · STRONG",
    signalIdle: "Signal · IDLE",
    you: "Your location",
  },
};

export type Pin = { id: string; name: string; reviews: string; you?: boolean };

export const initialOrder = (you: string): Pin[] => [
  { id: "a", name: "Rival A", reviews: "311 · 4,7" },
  { id: "b", name: "Rival B", reviews: "428 · 4,8" },
  { id: "c", name: "Rival C", reviews: "184 · 4,7" },
  { id: "you", name: you, reviews: "176 · 4,9", you: true },
  { id: "d", name: "Rival D", reviews: "212 · 4,6" },
];

export const optimizedOrder = (you: string): Pin[] => [
  { id: "you", name: you, reviews: "176 · 4,9", you: true },
  { id: "b", name: "Rival B", reviews: "428 · 4,8" },
  { id: "a", name: "Rival A", reviews: "311 · 4,7" },
  { id: "c", name: "Rival C", reviews: "184 · 4,7" },
  { id: "d", name: "Rival D", reviews: "212 · 4,6" },
];

// Each rank slot maps to a canvas coordinate, so the layout animation reads as a
// pin migration rather than vertical reflow.
export const SLOT_COORDS = [
  { x: 50, y: 36 }, // #1
  { x: 26, y: 28 }, // #2
  { x: 74, y: 30 }, // #3
  { x: 32, y: 64 }, // #4
  { x: 72, y: 66 }, // #5
];
