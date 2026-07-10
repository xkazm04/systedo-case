/** Standard content frame for a module page: a header (title + description, taken
 *  from the module registry by default) over the module body, with the app's
 *  page gutter. Keeps every module visually consistent without each page
 *  re-deriving its own header. Server component. */
import type { ReactNode } from "react";
import { MODULES, moduleLabel, moduleBlurb } from "@/lib/projects/modules";
import { getServerLocale } from "@/lib/i18n/locale";
import SampleDataNote from "@/components/app/SampleDataNote";

export default async function ModulePage({
  moduleKey,
  title,
  description,
  actions,
  sample,
  children,
}: {
  /** registry key used to look up the default title/description */
  moduleKey?: string;
  title?: string;
  description?: string;
  /** optional right-aligned header actions */
  actions?: ReactNode;
  /** when true, renders the shared "illustrative sample data" gutter note in the
   *  standard `mb-5` slot directly above the module body (the banner every
   *  seeded-data module carries). Pages that show it conditionally pass the same
   *  boolean they used to gate the note (e.g. `sample={!isLive}`). */
  sample?: boolean;
  children: ReactNode;
}) {
  const locale = await getServerLocale();
  const def = moduleKey !== undefined ? MODULES.find((m) => m.key === moduleKey) : undefined;
  const heading = title ?? (def ? moduleLabel(def, locale) : "");
  const desc = description ?? (def ? moduleBlurb(def, locale) : "");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-7 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-navy-800 sm:text-[28px]">
            {heading}
          </h2>
          {desc && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{desc}</p>}
        </div>
        {/* Right side, opposite the title. Static server `actions` render here;
            a client module can also portal header content (e.g. Campaigns' KPI
            badges) into `#module-header-actions` — display:contents so its
            children join this flex row. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {actions}
          <span id="module-header-actions" className="contents" />
        </div>
      </div>
      {sample && (
        <div className="mb-5">
          <SampleDataNote />
        </div>
      )}
      {children}
    </div>
  );
}
