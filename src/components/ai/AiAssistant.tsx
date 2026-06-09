"use client";

import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Bolt, Document, Gauge } from "@/components/icons";
import type { AiMode } from "@/lib/ai-types";
import AdGenerator from "./AdGenerator";
import ContentBriefGenerator from "./ContentBriefGenerator";
import PerformanceAnalyst from "./PerformanceAnalyst";

interface Tab {
  id: AiMode;
  label: string;
  service: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: Tab[] = [
  { id: "ads", label: "PPC inzeráty", service: "Výkonnostní reklama", icon: Bolt },
  { id: "brief", label: "Obsahový brief", service: "Tvorba obsahu", icon: Document },
  { id: "analysis", label: "Analýza dat", service: "Analýzy a strategie", icon: Gauge },
];

export default function AiAssistant() {
  const [tab, setTab] = useState<AiMode>("ads");

  return (
    <div>
      <div
        role="tablist"
        aria-label="Nástroje AI asistenta"
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`group flex flex-col items-center gap-2 rounded-card border p-3 text-center transition-all sm:flex-row sm:items-center sm:gap-3 sm:p-4 sm:text-left ${
                active
                  ? "border-brand-300 bg-brand-50 shadow-card"
                  : "border-line bg-surface hover:border-navy-200"
              }`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${
                  active ? "bg-brand-600 text-white" : "bg-navy-50 text-navy-600 group-hover:bg-navy-100"
                }`}
              >
                <Icon width={20} height={20} />
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-sm font-semibold leading-tight ${
                    active ? "text-brand-800" : "text-navy-800"
                  }`}
                >
                  {t.label}
                </span>
                <span className="mt-0.5 hidden text-xs text-muted sm:block">{t.service}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* All tools stay mounted (state is preserved across tab switches); the
          active one re-runs its fade because the class flips from hidden. */}
      <div className="mt-6">
        <div className={tab === "ads" ? "animate-fade-up" : "hidden"}>
          <AdGenerator />
        </div>
        <div className={tab === "brief" ? "animate-fade-up" : "hidden"}>
          <ContentBriefGenerator />
        </div>
        <div className={tab === "analysis" ? "animate-fade-up" : "hidden"}>
          <PerformanceAnalyst />
        </div>
      </div>
    </div>
  );
}
