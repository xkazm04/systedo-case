/** Typed UI message dictionary (cs / en). The formatting layer (src/lib/format.ts)
 *  was already locale-aware; this finishes the string layer so the product can
 *  ship in English. `cs` is the source of truth — its shape defines `Messages`,
 *  so `en` must stay structurally identical (a missing key is a type error).
 *  Framework-free (no React, no I/O) — safe to import from client or server. */
import type { SupportedLocale } from "@/lib/format";

/** Cookie that carries the chosen locale. Defined here (framework-free) so both
 *  the server reader (locale.ts) and the client provider can import it without
 *  either side dragging the other's runtime in. */
export const LOCALE_COOKIE = "locale";

interface NavCopy {
  label: string;
  blurb: string;
}

export interface Messages {
  nav: {
    caseStudy: string;
    openMenu: string;
    closeMenu: string;
    /** short "Task N" prefix in the mobile menu */
    task: string;
    /** nav label + home-card blurb, keyed by route href */
    items: Record<string, NavCopy>;
  };
  footer: {
    /** "{role}" is interpolated and rendered bold */
    intro: string;
    role: string;
    inspiredBy: string;
    grow: string;
    pages: string;
    about: string;
    /** "{year}" is interpolated */
    copyright: string;
    links: {
      pricing: string;
      social: string;
      library: string;
      map: string;
      design: string;
      crafted: string;
    };
  };
  switcher: {
    label: string;
  };
}

const cs: Messages = {
  nav: {
    caseStudy: "Case study",
    openMenu: "Otevřít menu",
    closeMenu: "Zavřít menu",
    task: "Úkol",
    items: {
      "/": { label: "Přehled", blurb: "Rozcestník případové studie a zdůvodnění zvoleného stacku." },
      "/dashboard": {
        label: "Dashboard",
        blurb: "Výkonnostní přehled klienta — návštěvy, náklady, konverze, obrat a PNO.",
      },
      "/clanek": {
        label: "Článek",
        blurb: "Publikovaný článek pro web mionelo.cz se správnou strukturou a prolinkováním.",
      },
      "/ai-asistent": {
        label: "AI asistent",
        blurb: "Tři marketingové nástroje na Gemini — PPC inzeráty, SEO obsahový brief a analýza výkonu.",
      },
      "/kampane": {
        label: "Kampaně",
        blurb: "Bonus: přehled kampaní z Google Ads se srovnáním podle typů, AI vyhodnocením a uložením do SQLite.",
      },
    },
  },
  footer: {
    intro:
      "Ukázková případová studie pro pozici {role}. Tři úkoly, tři stránky, jeden konzistentní příběh klienta. Data jsou ilustrativní.",
    role: "AI Vibecoder",
    inspiredBy: "Inspirováno přístupem",
    grow: "„Pojďme růst společně.“",
    pages: "Stránky",
    about: "O projektu",
    copyright: "© {year} — případová studie, nikoli oficiální web Systedo.",
    links: {
      pricing: "Ceník",
      social: "Sociální sítě",
      library: "Knihovna vzorů",
      map: "Mapa",
      design: "Design system",
      crafted: "Vytvořeno s důrazem na UX, datovou konzistenci a čistý kód.",
    },
  },
  switcher: {
    label: "Jazyk",
  },
};

const en: Messages = {
  nav: {
    caseStudy: "Case study",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    task: "Task",
    items: {
      "/": { label: "Overview", blurb: "Case-study hub and the rationale for the chosen stack." },
      "/dashboard": {
        label: "Dashboard",
        blurb: "Client performance overview — visits, cost, conversions, revenue and PNO.",
      },
      "/clanek": {
        label: "Article",
        blurb: "A published article for mionelo.cz with proper structure and interlinking.",
      },
      "/ai-asistent": {
        label: "AI assistant",
        blurb: "Three Gemini-powered marketing tools — PPC ads, an SEO content brief and performance analysis.",
      },
      "/kampane": {
        label: "Campaigns",
        blurb: "Bonus: a Google Ads campaign overview with type comparison, AI evaluation and Firestore storage.",
      },
    },
  },
  footer: {
    intro:
      "A sample case study for the {role} position. Three tasks, three pages, one consistent client story. Data is illustrative.",
    role: "AI Vibecoder",
    inspiredBy: "Inspired by the approach of",
    grow: "“Let’s grow together.”",
    pages: "Pages",
    about: "About",
    copyright: "© {year} — a case study, not the official Systedo site.",
    links: {
      pricing: "Pricing",
      social: "Social",
      library: "Pattern library",
      map: "Sitemap",
      design: "Design system",
      crafted: "Built with care for UX, data consistency and clean code.",
    },
  },
  switcher: {
    label: "Language",
  },
};

export const MESSAGES: Record<SupportedLocale, Messages> = { cs, en };

/** Resolve the dictionary for a locale (falls back to cs). */
export function getMessages(locale: SupportedLocale): Messages {
  return MESSAGES[locale] ?? MESSAGES.cs;
}
