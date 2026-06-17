/** Standard content frame for a module page: a header (title + description, taken
 *  from the module registry by default) over the module body, with the app's
 *  page gutter. Keeps every module visually consistent without each page
 *  re-deriving its own header. Server component. */
import type { ReactNode } from "react";
import { MODULES } from "@/lib/projects/modules";

export default function ModulePage({
  moduleKey,
  title,
  description,
  actions,
  children,
}: {
  /** registry key used to look up the default title/description */
  moduleKey?: string;
  title?: string;
  description?: string;
  /** optional right-aligned header actions */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const def = moduleKey !== undefined ? MODULES.find((m) => m.key === moduleKey) : undefined;
  const heading = title ?? def?.label ?? "";
  const desc = description ?? def?.blurb ?? "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-7 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-navy-800 sm:text-[28px]">
            {heading}
          </h2>
          {desc && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{desc}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
