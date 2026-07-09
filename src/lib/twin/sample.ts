/** The seeded twin a project starts with, before anyone trains it.
 *
 *  Illustrative, not pretending to be learned: a `generic` register that reads
 *  plausibly for the project type, the two channels every business actually has,
 *  and nothing else. There are no seeded style facts and no seeded drafts on
 *  purpose — the readiness ribbon must show an untrained twin as untrained, and a
 *  fake "5 samples" would tick the training gate for free.
 *
 *  Real-integration seam: `resolveTwin` swaps this for the project's saved state
 *  the moment anything is trained. Pure (no clock at module scope). */
import type { ProjectType } from "@/lib/projects/types";
import { DEFAULT_AUTO_THRESHOLD, type TwinChannelConfig, type TwinState, type TwinVoice } from "./types";

const EPOCH = new Date(0).toISOString();

/** The generic register per project type — a starting point a user will overwrite,
 *  phrased the way that business actually talks to its customers. */
const GENERIC_DIRECTIVES: Record<ProjectType, string> = {
  eshop:
    "Piš jako zkušený člověk z e-shopu: věcně, vstřícně a bez marketingového balastu. Zákazníka oslov jménem, odpověz na jeho dotaz hned v první větě a nabídni konkrétní další krok (dostupnost, doprava, vrácení zboží).",
  app:
    "Piš jako člověk z produktového týmu: srozumitelně, bez žargonu a bez korporátních frází. Odpověz přímo na dotaz, uveď konkrétní krok v aplikaci a nabídni pomoc, pokud se uživatel zasekne.",
  leadgen:
    "Piš jako zkušený obchodník: lidsky, profesionálně a se snahou posunout poptávku dál. Poděkuj za poptávku, potvrď, že jí rozumíš, a doptej se jen na to, co ještě nevíš.",
  content:
    "Piš jako redaktor, který si váží čtenáře: konkrétně, s osobním tónem a bez klišé. Odpověz na dotaz, odkaž na relevantní obsah a pozvi k odběru jen tam, kde to dává smysl.",
  local:
    "Piš jako člověk na recepci, kterého baví jeho práce: vlídně, stručně a prakticky. Potvrď dotaz, nabídni konkrétní termín nebo možnost a dej jasný pokyn, co má člověk udělat dál.",
};

const TRAITS: Record<ProjectType, string[]> = {
  eshop: ["věcný", "vstřícný", "konkrétní"],
  app: ["srozumitelný", "přímý", "nápomocný"],
  leadgen: ["profesionální", "lidský", "aktivní"],
  content: ["osobní", "konkrétní", "bez klišé"],
  local: ["vlídný", "stručný", "praktický"],
};

/** Two guardrails everyone needs; the user adds their own. Deliberately few — a
 *  long seeded list would tick the `guardrails` readiness gate without the brand
 *  ever having thought about its hard lines. */
const SEED_CONSTRAINTS: TwinVoice["constraints"] = [
  { kind: "dont", rule: "Neslibuj cenu, termín ani slevu, které nejsou v podkladech." },
  { kind: "do", rule: "Když něco nevíš, řekni to a nabídni, že to zjistíš." },
];

/** The channels a project of each type is likely to answer on first. `leads` — an
 *  inbound enquiry against a response clock — is universal except for a publisher,
 *  whose inbound is readers rather than buyers; it is listed first wherever it
 *  applies because the Schránka opens on the first enabled channel. */
const SEED_CHANNELS: Record<ProjectType, TwinChannelConfig["channel"][]> = {
  eshop: ["leads", "email", "chat"],
  app: ["leads", "email", "chat"],
  leadgen: ["leads", "email"],
  content: ["email", "social"],
  local: ["leads", "reviews"],
};

function channelDefaults(channel: TwinChannelConfig["channel"]): TwinChannelConfig {
  return {
    channel,
    enabled: true,
    // Every seeded channel starts supervised. `auto` is a decision a human makes,
    // never a default the app makes for them.
    autonomy: "assist",
    connector: "manual",
    autoThreshold: DEFAULT_AUTO_THRESHOLD,
  };
}

/** The untrained twin for a project type. */
export function sampleTwin(type: ProjectType): TwinState {
  const generic: TwinVoice = {
    scope: "generic",
    directives: GENERIC_DIRECTIVES[type],
    traits: TRAITS[type],
    lengthHint: "2–4 věty",
    constraints: SEED_CONSTRAINTS,
    examples: [],
    updatedAt: EPOCH,
  };
  return {
    voices: [generic],
    channels: SEED_CHANNELS[type].map(channelDefaults),
    facts: [],
    drafts: [],
  };
}
