"use client";

/** W1-C — the engine chrome for the local map pack: a segmented control that picks
 *  which search engine's map is on screen (Google Maps vs. Mapy.cz), the scope hook
 *  that keeps engine + area selection in step, and the honest empty state for an
 *  engine the project has imported nothing for.
 *
 *  Extracted out of MapPackClient so the pack view can gain a second engine without
 *  the (already over-budget) client component growing a line. The control only ever
 *  appears when the project genuinely has more than one engine's rows — a Google-only
 *  project sees exactly the surface it saw before. */
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { ENGINE_LABEL, enginesPresent, packsForEngine } from "@/lib/mappack/compute";
import type { LocalEngine } from "@/lib/local-signals/types";
import type { AreaPack } from "@/lib/mappack/sample";

const T = {
  cs: {
    engine: "Vyhledávač",
    emptyTitle: "Pro {engine} zatím nemáte naimportovaná data.",
    emptyHelp:
      "Přidejte do CSV sloupec „vyhledávač\" s hodnotou seznam (nebo mapy.cz / firmy.cz) a balíček nahrajte znovu. Ukázková data z Googlu tu vědomě nezobrazujeme pod cizí značkou.",
  },
  en: {
    engine: "Search engine",
    emptyTitle: "Nothing imported for {engine} yet.",
    emptyHelp:
      "Add an „engine\" column with the value seznam (or mapy.cz / firmy.cz) to your CSV and upload the pack again. We deliberately do not relabel the Google sample under another engine's name.",
  },
} as const;

/** Engine + area selection for one set of packs. Kept in ONE place so the tab strip,
 *  the map and the empty state can never disagree about what is being shown. */
export interface EngineScope {
  /** every engine the project actually has packs for (empty when there are none) */
  engines: LocalEngine[];
  engine: LocalEngine;
  setEngine: (e: LocalEngine) => void;
  /** the packs for the selected engine only */
  shown: AreaPack[];
  /** the selected area's pack, or undefined when this engine has no packs */
  selected: AreaPack | undefined;
  setSelectedId: (id: string) => void;
}

export function useEngineScope(areas: AreaPack[]): EngineScope {
  const engines = useMemo(() => enginesPresent(areas), [areas]);
  const [engine, setEngine] = useState<LocalEngine>("google");
  const shown = useMemo(() => packsForEngine(areas, engine), [areas, engine]);
  const [selectedId, setSelectedId] = useState("");
  // Falling back to the first pack of the CURRENT engine (rather than remembering a
  // stale id) is what makes switching engines land somewhere real every time.
  const selected = shown.find((a) => a.areaId === selectedId) ?? shown[0];
  return { engines, engine, setEngine, shown, selected, setSelectedId };
}

/** The segmented control. Render it only when `scope.engines.length > 1`. */
export default function EngineSwitch({ scope }: { scope: EngineScope }) {
  const t = useT(T);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {t("engine")}
      </span>
      <div
        role="tablist"
        aria-label={t("engine")}
        className="inline-flex rounded-pill border border-line bg-surface p-0.5"
      >
        {scope.engines.map((e) => {
          const active = e === scope.engine;
          return (
            <button
              key={e}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => scope.setEngine(e)}
              className={
                "rounded-pill px-3.5 py-1 text-xs font-semibold transition-colors " +
                (active
                  ? "bg-brand-500/10 text-brand-accent"
                  : "text-muted hover:text-navy-800")
              }
            >
              {ENGINE_LABEL[e]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Honest empty state: the selected engine has no imported packs. It says so and how
 *  to fix it — it never falls back to the other engine's data under this engine's name. */
export function EngineEmpty({ scope }: { scope: EngineScope }) {
  const t = useT(T);
  return (
    <div className="space-y-4">
      {scope.engines.length > 1 && <EngineSwitch scope={scope} />}
      <div className="card px-5 py-8 text-center">
        <p className="text-sm font-medium text-navy-800">
          {t("emptyTitle", { engine: ENGINE_LABEL[scope.engine] })}
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">{t("emptyHelp")}</p>
      </div>
    </div>
  );
}
