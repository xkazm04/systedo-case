/** Single source of truth for the primary navigation, shared by the header,
 *  footer and the home page so links never drift out of sync. */
export interface NavItem {
  href: string;
  label: string;
  /** short description used on the home page cards */
  blurb: string;
  /** the assignment task number this page fulfils (0 = overview) */
  task: number;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Přehled",
    blurb: "Rozcestník případové studie a zdůvodnění zvoleného stacku.",
    task: 0,
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    blurb: "Výkonnostní přehled klienta — návštěvy, náklady, konverze, obrat a PNO.",
    task: 1,
  },
  {
    href: "/clanek",
    label: "Článek",
    blurb: "Publikovaný článek pro web mionelo.cz se správnou strukturou a prolinkováním.",
    task: 2,
  },
  {
    href: "/ai-asistent",
    label: "AI asistent",
    blurb: "Tři marketingové nástroje na Gemini — PPC inzeráty, SEO obsahový brief a analýza výkonu.",
    task: 3,
  },
];
