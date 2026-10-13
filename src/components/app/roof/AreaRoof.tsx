/** An area roof (ADR-0013): the page an area starts on. The head names the area
 *  and the question it answers, beside its engraved instrument; below it every
 *  room the project type has in the area, each card fed by that module's own
 *  summary (lib/projects/roof.ts) inside its own Suspense boundary. Rich roofs
 *  (Performance, Home) compose kit Stations directly; this is the generic frame
 *  every other area starts from. Server component. */
import { Suspense, type ReactNode } from "react";
import AreaArt from "@/components/kit/art/AreaArt";
import Station from "@/components/kit/Station";
import { areaByKey, areaHueVar, type AreaKey } from "@/lib/projects/areas";
import { ROOF_MODULE, modulesFor } from "@/lib/projects/modules";
import type { Project } from "@/lib/projects/types";
import { getServerLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";
import RoomCard, { RoomCardSkeleton } from "./RoomCard";

const T = {
  en: { rooms: "Rooms", roomsTitle: "Open a room", roomsPurpose: "Each room is one tool. Its card says what it last saw." },
  cs: { rooms: "Místnosti", roomsTitle: "Otevřete místnost", roomsPurpose: "Každá místnost je jeden nástroj. Karta říká, co naposledy viděla." },
} as const;

export default async function AreaRoof({
  area,
  project,
  userId,
  children,
}: {
  area: AreaKey;
  project: Project;
  userId: string;
  /** Area-specific stations rendered above the room grid (Measure/Triage/Act). */
  children?: ReactNode;
}) {
  const locale = await getServerLocale();
  const t = await getT(T);
  const def = areaByKey(area);
  const hue = areaHueVar(area);
  // A roof module (Výkon) IS this page, so it is not listed as one of its rooms.
  const rooms = modulesFor(project.type).filter((m) => m.area === area && ROOF_MODULE[area] !== m.key);
  const en = locale === "en";

  return (
    <div className="stagger mx-auto grid max-w-6xl gap-12 px-4 py-8 sm:px-6 lg:py-12">
      <header className="grid items-end gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="grid gap-3">
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: hue }} />
            {project.name}
          </p>
          <h2 className="font-display text-5xl font-light leading-none tracking-tight text-ink sm:text-6xl">
            {en ? def.labelEn : def.label}
          </h2>
          <p className="max-w-xl text-lg text-muted">{en ? def.questionEn : def.question}</p>
        </div>
        <AreaArt motif={def.motif} hue={hue} className="hidden h-32 w-full sm:block" />
      </header>

      {children}

      <Station step="act" numbered={false} eyebrow={t("rooms")} title={t("roomsTitle")} purpose={t("roomsPurpose")} hue={hue}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((m) => (
            <li key={m.key}>
              <Suspense fallback={<RoomCardSkeleton module={m} locale={locale} />}>
                <RoomCard module={m} project={project} userId={userId} locale={locale} />
              </Suspense>
            </li>
          ))}
        </ul>
      </Station>
    </div>
  );
}
