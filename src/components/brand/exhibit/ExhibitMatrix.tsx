/** SPECIMEN — the module registry as a TYPE × SECTION MATRIX.
 *
 *  "An e-shop does not see what a lead-gen site sees" is the product's central
 *  honesty claim, and the shipped page states it in a sentence. Here it is the
 *  thing itself: five project types across, five capability sections down, and
 *  in each cell one dot per module that type actually gets — read straight from
 *  `MODULES[].availableFor`, so a module shipped or retired moves a dot. The
 *  denser the row, the more the product has for that kind of business. */
import { MODULES, SECTION_ORDER, sectionLabel, type ModuleSection } from "@/lib/projects/modules";
import { PROJECT_TYPES, type ProjectType } from "@/lib/projects/types";
import type { SupportedLocale } from "@/lib/format";

const PLUMBING: ModuleSection[] = ["settings", "system"];

export default function ExhibitMatrix({
  locale,
  typeLabel,
}: {
  locale: SupportedLocale;
  typeLabel: (t: ProjectType) => string;
}) {
  const sections = SECTION_ORDER.filter((s) => !PLUMBING.includes(s));
  const count = (s: ModuleSection, t: ProjectType) =>
    MODULES.filter((m) => m.section === s && m.availableFor.includes(t)).length;
  const totals = PROJECT_TYPES.map((t) => MODULES.filter((m) => !PLUMBING.includes(m.section) && m.availableFor.includes(t)).length);

  return (
    <div className="overflow-x-auto px-5 pt-5">
      <table className="w-full border-collapse font-mono text-[11px] uppercase tracking-[0.12em]">
        <thead>
          <tr>
            <th className="pb-3 text-left font-normal text-onyx-muted" />
            {PROJECT_TYPES.map((t) => (
              <th key={t} className="pb-3 text-left font-normal text-onyx-muted">
                {typeLabel(t)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s} className="border-t border-onyx-line">
              <th scope="row" className="py-3 pr-3 text-left font-normal text-onyx-ink">
                {sectionLabel(s, locale)}
              </th>
              {PROJECT_TYPES.map((t) => {
                const n = count(s, t);
                return (
                  <td key={t} className="py-3 pr-3 align-middle">
                    <span className="flex flex-wrap gap-1" aria-label={`${n}`}>
                      {Array.from({ length: n }, (_, i) => (
                        <span key={i} className="inline-block h-2 w-2 rounded-full bg-brand-400" />
                      ))}
                      {n === 0 && <span className="inline-block h-2 w-2 rounded-full border border-onyx-line" />}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-onyx-line">
            <th scope="row" className="pt-3 pb-4 pr-3 text-left font-normal text-onyx-muted">
              Σ
            </th>
            {totals.map((n, i) => (
              <td key={PROJECT_TYPES[i]} className="tnum pt-3 pb-4 pr-3 text-brand-300">
                {n}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
