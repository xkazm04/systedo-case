/** The Home roof's hall of lamps (ADR-0013): one lamp per area the project type
 *  has, each linking to its roof. The lamp's status line is the area's question
 *  until the area roofs report summaries of their own. Server component. */
import Lamp from "@/components/kit/Lamp";
import { areaByKey } from "@/lib/projects/areas";
import { areaHref, areasFor } from "@/lib/projects/modules";
import type { Project } from "@/lib/projects/types";
import { getServerLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";

const T = {
  en: { label: "Areas of this project" },
  cs: { label: "Oblasti projektu" },
} as const;

export default async function HomeLamps({ project }: { project: Project }) {
  const locale = await getServerLocale();
  const t = await getT(T);
  const areas = areasFor(project.type).filter((a) => a !== "home");
  return (
    <nav aria-label={t("label")} className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {areas.map((key) => {
          const a = areaByKey(key);
          return (
            <li key={key}>
              <Lamp
                area={a}
                href={areaHref(project.id, key)}
                name={locale === "en" ? a.labelEn : a.label}
                status={locale === "en" ? a.questionEn : a.question}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
