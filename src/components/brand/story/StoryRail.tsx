/** THE RAIL — after the film, what is in the product, as ONE horizontal line.
 *
 *  The shipped homepage lays the 29 modules out as a five-column grid of pills
 *  under a paragraph each. In a story that has just ended on "leave with the
 *  account running", a grid is a reading-journal relapse. A rail is a single
 *  gesture: swipe once and you have seen the whole product, grouped the way the
 *  app's left panel groups it. Scroll-snap, no JS. Every name is read from the
 *  registry, never typed (the same rule LandingModules holds itself to). */
import { MODULES, SECTION_ORDER, moduleLabel, sectionLabel, type ModuleSection } from "@/lib/projects/modules";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

const PLUMBING: ModuleSection[] = ["settings", "system"];

const T = {
  cs: { eyebrow: "Co je uvnitř", line: "{n} modulů. Jedním tahem.", hint: "posunout →" },
  en: { eyebrow: "What is inside", line: "{n} modules. One swipe.", hint: "slide →" },
} as const;

export default async function StoryRail() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const sections = SECTION_ORDER.filter((s) => !PLUMBING.includes(s));
  const total = MODULES.filter((m) => !PLUMBING.includes(m.section)).length;

  return (
    <section className="border-t border-onyx-line bg-onyx py-14 text-onyx-ink">
      <div className="mx-auto flex w-full max-w-6xl items-end justify-between gap-6 px-4 sm:px-6">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-brand-300">{t("eyebrow")}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {t("line", { n: String(total) })}
          </p>
        </div>
        <p className="hidden font-mono text-[12px] tracking-[0.16em] text-onyx-muted sm:block">{t("hint")}</p>
      </div>

      <div className="no-scrollbar mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:px-6">
        {/* left gutter so the first group lines up with the container */}
        <div className="shrink-0 basis-[max(0px,calc((100vw-72rem)/2-1rem))]" aria-hidden />
        {sections.map((s) => {
          const items = MODULES.filter((m) => m.section === s);
          return (
            <div
              key={s}
              className="flex shrink-0 snap-start flex-col gap-3 rounded-card border border-onyx-line bg-onyx-soft/50 p-4"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-onyx-muted">
                {sectionLabel(s, locale)} · {items.length}
              </p>
              <div className="flex max-w-[22rem] flex-wrap gap-2">
                {items.map((m) => (
                  <span
                    key={m.key || "overview"}
                    className="rounded-pill border border-onyx-line px-3 py-1 text-sm text-onyx-ink"
                  >
                    {moduleLabel(m, locale)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        <div className="shrink-0 basis-4" aria-hidden />
      </div>
    </section>
  );
}
