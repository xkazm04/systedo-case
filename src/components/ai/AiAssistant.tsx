"use client";

import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Bolt, Document, Gauge, Image as ImageIcon, Search } from "@/components/icons";
import type { AiMode } from "@/lib/ai-types";
import AdGenerator from "./AdGenerator";
import KeywordResearch, { type BriefSeed } from "./KeywordResearch";
import ContentBriefGenerator from "./ContentBriefGenerator";
import PerformanceAnalyst from "./PerformanceAnalyst";
import CreativeStudio from "./CreativeStudio";

type TabId = AiMode | "keywords" | "creative";

interface Tab {
  id: TabId;
  label: string;
  service: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: Tab[] = [
  { id: "ads", label: "PPC inzeráty", service: "Výkonnostní reklama", icon: Bolt },
  { id: "keywords", label: "Klíčová slova", service: "SEO & výzkum", icon: Search },
  { id: "brief", label: "Obsahový brief", service: "Tvorba obsahu", icon: Document },
  { id: "analysis", label: "Analýza dat", service: "Analýzy a strategie", icon: Gauge },
  { id: "creative", label: "Vizuály", service: "Kreativa & obrázky", icon: ImageIcon },
];

export default function AiAssistant() {
  const [tab, setTab] = useState<TabId>("ads");
  // Cross-tool handoff: the keyword tool seeds the brief tool. The nonce lets the
  // brief tool re-apply the seed even if the same selection is sent twice.
  const [briefSeed, setBriefSeed] = useState<BriefSeed | null>(null);
  const [briefNonce, setBriefNonce] = useState(0);

  const handleCreateBrief = (seed: BriefSeed) => {
    setBriefSeed(seed);
    setBriefNonce((n) => n + 1);
    setTab("brief");
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Nástroje AI asistenta"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5"
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
        <div data-testid="tool-ads" className={tab === "ads" ? "animate-fade-up" : "hidden"}>
          <AdGenerator />
        </div>
        <div data-testid="tool-keywords" className={tab === "keywords" ? "animate-fade-up" : "hidden"}>
          <KeywordResearch onCreateBrief={handleCreateBrief} />
        </div>
        <div data-testid="tool-brief" className={tab === "brief" ? "animate-fade-up" : "hidden"}>
          {/* re-mount on each handoff so a new seed prefills via lazy init */}
          <ContentBriefGenerator key={`brief-${briefNonce}`} seed={briefSeed} />
        </div>
        <div data-testid="tool-analysis" className={tab === "analysis" ? "animate-fade-up" : "hidden"}>
          <PerformanceAnalyst />
        </div>
        <div data-testid="tool-creative" className={tab === "creative" ? "animate-fade-up" : "hidden"}>
          <CreativeStudio />
        </div>
      </div>
    </div>
  );
}
