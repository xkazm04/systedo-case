/** What is actually in the product — the module grid, DERIVED from the registry
 *  that composes the authed app (`src/lib/projects/modules.ts`).
 *
 *  Until this band shipped, the homepage described the product with four
 *  crossroad cards pointing at case-study pages and never said what the app
 *  contains (docs/ship/2026-08-28-kanaly-core-path.md §4: "no feature grid
 *  describing the modules"). The obvious fix — typing a list of features into
 *  marketing copy — is the one this file refuses: every module NAME and every
 *  COUNT below is read out of `MODULES` and `SECTION_LABELS`, the same
 *  declarations the sidebar renders from. Ship a module and it appears here;
 *  retire one and it leaves. The only thing written by hand is the one-line
 *  framing per section, keyed by `ModuleSection` so a new section is a compile
 *  error rather than a silently missing card.
 *
 *  Honesty about scope: the grid shows the CAPABILITY sections. `settings`
 *  (project settings, integrations, account, branding) and the unlabeled
 *  `system` drawer are workspace plumbing, not things the product does for you,
 *  so they are excluded by name below rather than quietly filtered by a count. */
import {
  MODULES,
  SECTION_LABELS,
  SECTION_LABELS_EN,
  SECTION_ORDER,
  type ModuleSection,
} from "@/lib/projects/modules";
import { Container, Eyebrow } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

/** Sections that configure the workspace rather than do work in it. */
const PLUMBING: ModuleSection[] = ["settings", "system"];

const T = {
  cs: {
    eyebrow: "Co v tom je",
    heading: "{modules} modulů, poskládaných podle toho, co zrovna řešíte.",
    sub: "Sestava se řídí typem projektu — e-shop nevidí to, co lead-gen web. Tady je celá šíře, seskupená tak, jak ji uvidíte v levém panelu aplikace.",
    count: "{n} modulů",
    main: "Kde stojíte: portfolio, výkon účtu, denní přehled.",
    growth: "Kde se dá růst: kanály zdarma, klíčová slova, lokální viditelnost, srovnání s konkurencí.",
    studio: "Čím to naplníte: inzeráty, obrázky, články, značkový hlas.",
    comms: "Kudy to pošlete: sociální sítě, distribuce, schránka, leady.",
    insights: "Co z toho vyšlo: marže, náklady, atribuce, reporty pro klienta.",
  },
  en: {
    eyebrow: "What is in it",
    heading: "{modules} modules, arranged by the thing you are working on.",
    sub: "The set follows the project type — an e-shop does not see what a lead-gen site sees. This is the full breadth, grouped the way the app's left rail groups it.",
    count: "{n} modules",
    main: "Where you stand: portfolio, account performance, the daily view.",
    growth: "Where growth is: free channels, keywords, local visibility, competitor comparison.",
    studio: "What you fill it with: ads, images, articles, brand voice.",
    comms: "How it goes out: social, distribution, inbox, leads.",
    insights: "What came of it: margin, cost, attribution, client reports.",
  },
} as const;

/** The framing line per capability section. Keyed by `ModuleSection` minus the
 *  plumbing, so adding a section to the registry fails the build here. */
type CapabilitySection = Exclude<ModuleSection, "settings" | "system">;
const BLURB_KEY: Record<CapabilitySection, keyof (typeof T)["cs"]> = {
  main: "main",
  growth: "growth",
  studio: "studio",
  comms: "comms",
  insights: "insights",
};

export default async function LandingModules() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const labels = locale === "cs" ? SECTION_LABELS : SECTION_LABELS_EN;

  const sections = SECTION_ORDER.filter(
    (s): s is CapabilitySection => !PLUMBING.includes(s)
  ).map((section) => ({
    section,
    label: labels[section],
    blurb: t(BLURB_KEY[section]),
    // Registry order within the section is the render order the sidebar uses.
    modules: MODULES.filter((m) => m.section === section).sort((a, b) => a.order - b.order),
  }));
  const shown = sections.reduce((n, s) => n + s.modules.length, 0);

  return (
    <section id="moduly" className="reveal-on-scroll border-b border-line">
      <Container className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
            {t("heading", { modules: String(shown) })}
          </h2>
          <p className="mt-4 leading-relaxed text-muted">{t("sub")}</p>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <div key={s.section} className="flex flex-col bg-surface p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold tracking-tight text-navy-800">{s.label}</h3>
                <span className="tnum shrink-0 text-xs font-semibold text-brand-accent">
                  {t("count", { n: String(s.modules.length) })}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.blurb}</p>
              {/* Module names straight from the registry — the list a reader can
                  hold the product to, and the list that moves when the app does. */}
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {s.modules.map((m) => (
                  <li
                    key={m.key || "overview"}
                    className="rounded-pill bg-brand-50/60 px-2.5 py-1 text-xs font-medium text-navy-700"
                  >
                    {locale === "cs" ? m.label : m.labelEn}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
