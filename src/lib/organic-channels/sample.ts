/** Seeded organic-channel plans per project type — the honest sample the Kanály
 *  module runs on before (and if) the user regenerates a tailored plan with the
 *  `channel-research` LLM op. Channels are curated per business type from the
 *  Czech market (Firmy.cz, Zboží.cz, Heureka, Google Business Profile, oborové
 *  komunity…); fit is nudged per project so two projects of one type don't read
 *  byte-identically. Real content stays Czech (like the other SAMPLE_* fixtures);
 *  the module chrome localizes. Framework-free apart from the Project type. */
import type { Project, ProjectType } from "@/lib/projects/types";
import type { ChannelCategory, ChannelEffort, OrganicChannel } from "./types";
// Shared demo core — the same seeded PRNG (mulberry32) + FNV-1a hash the other
// demo generators use (one implementation instead of copies).
import { mulberry32, hashStr } from "@/lib/demo/prng.mjs";

/** Light grounding the page threads in from the catalog so the seeded plan names
 *  the real business (brand, its category, its first locality) instead of "vaše
 *  firma". All optional — the builder falls back to generic phrasing. */
export interface ChannelContext {
  brand?: string;
  /** primary offering category, when the catalog has one */
  category?: string;
  /** first locality (local / leadgen), when the catalog has one */
  locality?: string;
}

/** A catalog entry before per-project personalization. `rationale`/`payoff`/
 *  `firstActions` may contain {brand} / {locality} / {category} placeholders the
 *  builder fills. */
interface Seed {
  id: string;
  name: string;
  category: ChannelCategory;
  fit: number;
  effort: ChannelEffort;
  rationale: string;
  payoff: string;
  firstActions: string[];
  url?: string;
  contentAngle?: string;
}

const GBP: Seed = {
  id: "google-business-profile",
  name: "Google Business Profile",
  category: "directory",
  fit: 94,
  effort: "low",
  rationale:
    "Bezplatný firemní profil {brand} se zobrazuje v Mapách i ve vyhledávání, když lidé hledají službu v okolí — nejrychlejší organická viditelnost bez rozpočtu.",
  payoff: "Zobrazení v mapovém balíčku a hovory/trasy přímo z vyhledávání",
  firstActions: [
    "Ověřte a doplňte profil {brand} (kategorie, otevírací doba, fotky, služby)",
    "Přidejte 5–10 kvalitních fotek a popis s klíčovými slovy",
    "Nastavte pravidelné příspěvky a začněte sbírat recenze",
  ],
  url: "https://business.google.com",
  contentAngle: "Příspěvek na Google profil {brand}: novinka nebo tip pro zákazníky",
};

const FIRMY_CZ: Seed = {
  id: "firmy-cz",
  name: "Firmy.cz (Seznam)",
  category: "directory",
  fit: 82,
  effort: "low",
  rationale:
    "Katalog Firmy.cz živí výsledky Seznam.cz a Mapy.cz — pořád velký zdroj poptávek v ČR, základní zápis je zdarma.",
  payoff: "Viditelnost u zákazníků, kteří hledají přes Seznam a Mapy.cz",
  firstActions: [
    "Založte/ověřte zápis {brand} a vyplňte kategorie a kontakty",
    "Doplňte fotografie, ceník a popis nabídky",
    "Vyzvěte spokojené zákazníky k hodnocení",
  ],
  url: "https://www.firmy.cz",
};

const BLOG_SEO: Seed = {
  id: "vlastni-blog-seo",
  name: "Vlastní blog a SEO",
  category: "content",
  fit: 80,
  effort: "high",
  rationale:
    "Vlastní obsah na téma {category} vám dlouhodobě přivádí návštěvnost z vyhledávání, kterou nemusíte platit za proklik — jediný kanál, který skutečně vlastníte.",
  payoff: "Trvalá organická návštěvnost a důvěra bez platby za klik",
  firstActions: [
    "Vyberte 3 témata z reálné poptávky (viz Klíčová slova)",
    "Napište pilířový článek a prolinkujte na nabídku",
    "Sledujte pozice a obsah čtvrtletně aktualizujte",
  ],
  contentAngle: "Rádce k tématu {category}, který odpovídá na časté dotazy zákazníků",
};

const NEWSLETTER: Seed = {
  id: "newsletter",
  name: "E-mailový newsletter",
  category: "content",
  fit: 74,
  effort: "medium",
  rationale:
    "E-mail je publikum, které vlastníte — bez závislosti na algoritmu a bez ceny za oslovení. Skvělý na opakovaný prodej a udržení pozornosti.",
  payoff: "Opakovaný kontakt s publikem zdarma, nezávislý na platformách",
  firstActions: [
    "Přidejte na web přihlášení k odběru s jasnou hodnotou",
    "Nastavte uvítací sérii a pravidelný rytmus (1×/měsíc stačí)",
    "Recyklujte nejlepší obsah z blogu do newsletteru",
  ],
  contentAngle: "Newsletter {brand}: shrnutí novinek a jeden užitečný tip",
};

const FB_GROUPS: Seed = {
  id: "facebook-skupiny",
  name: "Facebook skupiny",
  category: "community",
  fit: 70,
  effort: "medium",
  rationale:
    "V tematických a lokálních skupinách se vaši zákazníci ptají a doporučují si — užitečná (neprodejní) přítomnost buduje jméno {brand} zdarma.",
  payoff: "Doporučení a poptávky z komunit, kde už zákazníci jsou",
  firstActions: [
    "Najděte 3–5 relevantních skupin a přečtěte pravidla",
    "Odpovídejte na dotazy věcně, bez tvrdého prodeje",
    "Sdílejte jen skutečně užitečný obsah, ne reklamu",
  ],
};

const INSTAGRAM: Seed = {
  id: "instagram-organic",
  name: "Instagram (organicky)",
  category: "social",
  fit: 68,
  effort: "medium",
  rationale:
    "Vizuální nabídku {category} lze ukázat organicky přes Reels a příspěvky — dosah zdarma, pokud je obsah pravidelný a autentický.",
  payoff: "Budování značky a organický dosah u vizuálního publika",
  firstActions: [
    "Nastavte firemní profil a jednotný vizuál",
    "Publikujte Reels z reálného provozu/produktu 2–3×/týden",
    "Zapojte relevantní hashtagy a lokaci",
  ],
  contentAngle: "Krátké Reels z provozu {brand} — ukázka produktu nebo služby v akci",
};

const INFLUENCER: Seed = {
  id: "spoluprace-tvurci",
  name: "Spolupráce s tvůrci",
  category: "partnership",
  fit: 62,
  effort: "medium",
  rationale:
    "Mikro-tvůrci ve vašem oboru mají důvěryhodné publikum — barterová nebo výkonová spolupráce přinese dosah bez fixního mediálního rozpočtu.",
  payoff: "Dosah na cizí důvěryhodné publikum bez ceny za zobrazení",
  firstActions: [
    "Sestavte seznam 10 mikro-tvůrců relevantních pro {category}",
    "Nabídněte produkt/službu výměnou za upřímnou recenzi",
    "Měřte přínos přes slevový kód nebo UTM odkaz",
  ],
};

// ---------------------------------------------------------------- e-shop
const ZBOZI_CZ: Seed = {
  id: "zbozi-cz",
  name: "Zboží.cz (Seznam)",
  category: "marketplace",
  fit: 88,
  effort: "medium",
  rationale:
    "Nákupní vyhledávač Seznamu s bezplatným organickým výpisem — produkty {brand} se ukážou lidem s nákupním záměrem bez platby za proklik.",
  payoff: "Nákupně motivovaní návštěvníci z porovnávače zdarma",
  firstActions: [
    "Vytvořte a odešlete produktový feed (XML)",
    "Vyčistěte názvy, kategorie a parametry pro párování",
    "Sledujte podíl zobrazení a doplňte chybějící údaje",
  ],
  url: "https://www.zbozi.cz",
};

const HEUREKA: Seed = {
  id: "heureka",
  name: "Heureka",
  category: "marketplace",
  fit: 84,
  effort: "medium",
  rationale:
    "Největší český srovnávač — i bez placeného prokliku vám recenze a „Ověřeno zákazníky“ budují důvěru a organickou viditelnost.",
  payoff: "Důvěra z recenzí a organická viditelnost u porovnávajících zákazníků",
  firstActions: [
    "Nahrajte feed a spárujte kategorie",
    "Zapněte „Ověřeno zákazníky“ a sbírejte recenze",
    "Reagujte na dotazy a hodnocení u produktů",
  ],
  url: "https://www.heureka.cz",
};

const PINTEREST: Seed = {
  id: "pinterest",
  name: "Pinterest",
  category: "social",
  fit: 58,
  effort: "medium",
  rationale:
    "Pinterest funguje jako vizuální vyhledávač s dlouhou životností pinů — u produktů {category} přivádí organickou návštěvnost měsíce po publikaci.",
  payoff: "Dlouhodobá organická návštěvnost z vizuálního vyhledávání",
  firstActions: [
    "Založte firemní účet a tematické nástěnky",
    "Připněte produktové fotky s prokliky na web",
    "Popisujte piny klíčovými slovy",
  ],
};

// ------------------------------------------------------------------- app
const PRODUCT_HUNT: Seed = {
  id: "product-hunt",
  name: "Product Hunt",
  category: "community",
  fit: 86,
  effort: "medium",
  rationale:
    "Launch na Product Huntu dostane {brand} před early-adoptery a novináře v jeden den — bez rozpočtu, jen za dobře připravené uvedení.",
  payoff: "Nárazová vlna early-adopterů, zpětných odkazů a zpětné vazby",
  firstActions: [
    "Připravte hunter, vizuály, GIF a první komentář",
    "Nachystejte launch na úterý–čtvrtek ráno (US čas)",
    "Zmobilizujte publikum k podpoře v den launche",
  ],
  url: "https://www.producthunt.com",
};

const REVIEW_PORTALS: Seed = {
  id: "g2-capterra",
  name: "G2 / Capterra",
  category: "directory",
  fit: 80,
  effort: "medium",
  rationale:
    "B2B kupující srovnávají software na G2 a Capterře — profil se sbíranými recenzemi přivádí kvalifikované leady s nákupním záměrem zdarma.",
  payoff: "Kvalifikovaní B2B kupující ve fázi srovnávání",
  firstActions: [
    "Založte a vyplňte profily na G2 a Capterře",
    "Systematicky žádejte spokojené zákazníky o recenzi",
    "Sledujte srovnání s konkurencí a doplňte kategorie",
  ],
};

const REDDIT: Seed = {
  id: "reddit-komunity",
  name: "Reddit / oborové komunity",
  category: "community",
  fit: 72,
  effort: "high",
  rationale:
    "V relevantních subredditech a komunitách řeší vaše cílovka reálné problémy — dlouhodobá užitečná přítomnost buduje autoritu {brand} bez placení.",
  payoff: "Autorita a poptávky z komunit s vysokým záměrem",
  firstActions: [
    "Vyberte 3–4 komunity a nastudujte pravidla",
    "Pomáhejte a odpovídejte dřív, než začnete zmiňovat produkt",
    "Sdílejte hodnotný obsah, ne přímou reklamu",
  ],
};

const LINKEDIN: Seed = {
  id: "linkedin-organic",
  name: "LinkedIn (organicky)",
  category: "social",
  fit: 76,
  effort: "medium",
  rationale:
    "Pro B2B je organický LinkedIn nejlevnější kanál důvěry — příspěvky zakladatele a firmy oslovují rozhodovatele bez ceny za zobrazení.",
  payoff: "Dosah na B2B rozhodovatele a budování odbornosti",
  firstActions: [
    "Optimalizujte firemní i osobní profil zakladatele",
    "Publikujte 2–3×/týden příběhy z praxe a výsledky",
    "Zapojujte se do diskuzí v oboru",
  ],
  contentAngle: "LinkedIn příspěvek: konkrétní výsledek nebo poučení z praxe {brand}",
};

const YOUTUBE: Seed = {
  id: "youtube",
  name: "YouTube",
  category: "content",
  fit: 66,
  effort: "high",
  rationale:
    "Návody a ukázky na YouTube se dohledávají roky a řadí se i v Google — trvalá organická viditelnost {category} bez opakované platby.",
  payoff: "Trvale dohledatelný obsah, který řadí i ve vyhledávání",
  firstActions: [
    "Natočte 3 návodová videa řešící reálné dotazy",
    "Optimalizujte názvy, popisy a náhledy pro hledání",
    "Prolinkujte videa z webu a blogu",
  ],
};

// --------------------------------------------------------------- leadgen
const INDUSTRY_PORTALS: Seed = {
  id: "oborove-portaly",
  name: "Oborové katalogy a portály",
  category: "directory",
  fit: 78,
  effort: "low",
  rationale:
    "Poptávkové a oborové portály sdružují zákazníky s konkrétní poptávkou po {category} — zápis je většinou zdarma a přivádí připravené leady.",
  payoff: "Připravené poptávky ze specializovaných portálů",
  firstActions: [
    "Najděte 3–5 oborových katalogů a portálů pro {category}",
    "Založte kompletní profily s referencemi",
    "Nastavte rychlou reakci na příchozí poptávky",
  ],
};

const REFERENCES: Seed = {
  id: "reference-recenze",
  name: "Reference a recenze",
  category: "pr",
  fit: 74,
  effort: "low",
  rationale:
    "V lokálním a službovém byznysu rozhodují doporučení — soustavné sbírání recenzí u {brand} je nejlevnější a nejúčinnější akvizice.",
  payoff: "Důvěra a konverze z doporučení stávajících zákazníků",
  firstActions: [
    "Po každé zakázce požádejte o Google recenzi",
    "Sbírejte a zveřejňujte konkrétní reference s fotkou",
    "Odpovídejte na všechny recenze, i ty kritické",
  ],
};

// --------------------------------------------------------------- content
const SEARCH_ORGANIC: Seed = {
  id: "organicke-vyhledavani",
  name: "Organické vyhledávání (SEO)",
  category: "content",
  fit: 90,
  effort: "high",
  rationale:
    "Pro obsahový web je organické hledání hlavní bezplatný zdroj čtenářů — systematické pokrytí témat {category} skládá návštěvnost, kterou nemusíte kupovat.",
  payoff: "Hlavní bezplatný zdroj čtenářů, který se dlouhodobě sčítá",
  firstActions: [
    "Zmapujte tematické klastry a mezery v pokrytí",
    "Obnovte upadající články a prolinkujte je",
    "Cílete na dotazy s reálnou poptávkou",
  ],
  contentAngle: "Nový článek pokrývající vyhledávanou mezeru v tématu {category}",
};

const AGGREGATORS: Seed = {
  id: "agregatory-syndikace",
  name: "Agregátory a syndikace",
  category: "pr",
  fit: 64,
  effort: "medium",
  rationale:
    "Zpravodajské agregátory a syndikace roznesou váš obsah k novému publiku bez mediálního rozpočtu — dosah zdarma výměnou za kvalitní zdroj.",
  payoff: "Nové publikum a zpětné odkazy z roznesení obsahu",
  firstActions: [
    "Přihlaste web do relevantních agregátorů a čteček",
    "Nabídněte syndikaci nejlepších článků partnerům",
    "Sledujte zpětné odkazy a odkazující weby",
  ],
};

const CREATOR_COLLAB: Seed = {
  id: "spoluprace-tvurci-obsah",
  name: "Spolupráce s tvůrci obsahu",
  category: "partnership",
  fit: 66,
  effort: "medium",
  rationale:
    "Vzájemné zmínky, hostování a společný obsah s tvůrci v příbuzném tématu sdílí publikum na obě strany — růst bez placeného dosahu.",
  payoff: "Sdílené publikum a růst přes vzájemná doporučení",
  firstActions: [
    "Najděte tvůrce s podobným, ne konkurenčním publikem",
    "Domluvte hostující článek nebo společný díl",
    "Vzájemně se odkazujte v obsahu i newsletteru",
  ],
};

// ----------------------------------------------------------------- local
const MAPY_CZ: Seed = {
  id: "mapy-cz",
  name: "Mapy.cz a lokální katalogy",
  category: "directory",
  fit: 86,
  effort: "low",
  rationale:
    "Zákazníci v okolí {locality} hledají službu přes Mapy.cz a lokální katalogy — kompletní zápis {brand} je zdarma a přivádí lidi s okamžitým záměrem.",
  payoff: "Zákazníci hledající službu ve vašem okolí ({locality})",
  firstActions: [
    "Ověřte zápis {brand} na Mapy.cz a doplňte fotky",
    "Sjednoťte název, adresu a telefon napříč katalogy",
    "Přidejte otevírací dobu, služby a ceník",
  ],
  url: "https://mapy.cz",
};

const LOCAL_FB_GROUPS: Seed = {
  id: "lokalni-fb-skupiny",
  name: "Lokální Facebook skupiny",
  category: "community",
  fit: 76,
  effort: "medium",
  rationale:
    "V sousedských a městských skupinách kolem {locality} se lidé ptají na tipy a doporučení — užitečná přítomnost {brand} přinese poptávky zdarma.",
  payoff: "Doporučení a poptávky ze sousedských komunit ({locality})",
  firstActions: [
    "Přidejte se do místních skupin kolem {locality}",
    "Odpovídejte na dotazy věcně a bez tvrdého prodeje",
    "Sdílejte lokální novinky a užitečné tipy",
  ],
};

const LOCAL_PARTNERS: Seed = {
  id: "lokalni-partneri",
  name: "Spolupráce s okolními podniky",
  category: "partnership",
  fit: 68,
  effort: "medium",
  rationale:
    "Nekonkurenční podniky v okolí {locality} sdílejí stejné zákazníky — vzájemná doporučení a společné akce přinášejí návštěvnost bez rozpočtu.",
  payoff: "Sdílení zákazníků s nekonkurenčními podniky v okolí",
  firstActions: [
    "Oslovte 3–5 nekonkurenčních podniků v okolí {locality}",
    "Domluvte vzájemná doporučení nebo leták u sebe",
    "Uspořádejte společnou akci nebo balíček",
  ],
};

/** The curated channel set per project type, ordered by descending fit. */
const PLANS: Record<ProjectType, Seed[]> = {
  eshop: [GBP, ZBOZI_CZ, HEUREKA, FIRMY_CZ, BLOG_SEO, INSTAGRAM, FB_GROUPS, NEWSLETTER, INFLUENCER, PINTEREST],
  app: [PRODUCT_HUNT, REVIEW_PORTALS, BLOG_SEO, LINKEDIN, REDDIT, NEWSLETTER, YOUTUBE, INFLUENCER],
  leadgen: [GBP, FIRMY_CZ, INDUSTRY_PORTALS, REFERENCES, FB_GROUPS, LINKEDIN, BLOG_SEO, LOCAL_PARTNERS],
  content: [SEARCH_ORGANIC, NEWSLETTER, REDDIT, YOUTUBE, AGGREGATORS, CREATOR_COLLAB, INSTAGRAM, FB_GROUPS],
  local: [GBP, MAPY_CZ, FIRMY_CZ, REFERENCES, LOCAL_FB_GROUPS, BLOG_SEO, LOCAL_PARTNERS, INSTAGRAM],
};

/** Fill {brand} / {locality} / {category} placeholders with real values, falling
 *  back to natural generic phrasing when a value is missing. */
function fill(s: string, ctx: ChannelContext): string {
  return s
    .replace(/\{brand\}/g, ctx.brand || "vaší firmy")
    .replace(/\{locality\}/g, ctx.locality || "vaší lokality")
    .replace(/\{category\}/g, ctx.category || "vaší nabídky");
}

/** A tiny deterministic ±jit wobble seeded off a string (FNV-1a hash → mulberry32
 *  from the shared demo core), so the seeded plan varies per project/brand.
 *  Returns a factor ≈ 1, consumed in call order. */
function seededWobble(key: string): (jit?: number) => number {
  const rnd = mulberry32(hashStr(key));
  return (jit = 0.05) => 1 + (rnd() * 2 - 1) * jit;
}

/** Build the curated per-type channel plan from a type + grounding context, nudged
 *  deterministically by `seedKey` so two plans built from the same type but a
 *  different brand/project don't read identically. Ranked by fit descending. Shared
 *  by the seeded module sample (per project) and the `channel-research` op's demo
 *  fallback (per business type), so both speak from one curated catalog. */
export function baseChannelPlan(
  type: ProjectType,
  ctx: ChannelContext,
  seedKey: string
): OrganicChannel[] {
  const wobble = seededWobble(`${type}:${seedKey}`);
  return PLANS[type]
    .map((s): OrganicChannel => ({
      id: s.id,
      name: s.name,
      category: s.category,
      // Bounded field: nudge by a small symmetric wobble, clamp to a sane band.
      fit: Math.max(30, Math.min(99, Math.round(s.fit * wobble(0.05)))),
      effort: s.effort,
      rationale: fill(s.rationale, ctx),
      payoff: fill(s.payoff, ctx),
      firstActions: s.firstActions.map((a) => fill(a, ctx)),
      ...(s.url ? { url: s.url } : {}),
      ...(s.contentAngle ? { contentAngle: fill(s.contentAngle, ctx) } : {}),
    }))
    .sort((a, b) => b.fit - a.fit);
}

/** The seeded organic-channel plan for a project: the curated per-type set,
 *  personalized with the project's brand/locality/category and nudged per project
 *  so two same-type projects don't read identically. Ranked by fit descending. */
export function channelPlanForProject(project: Project, ctx: ChannelContext = {}): OrganicChannel[] {
  return baseChannelPlan(project.type, { brand: project.name, ...ctx }, project.id);
}
