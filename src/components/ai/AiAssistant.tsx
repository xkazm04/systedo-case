"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { Bolt, Document, Gauge, Image as ImageIcon, Layers, Search } from "@/components/icons";
import type { AdRequest, AiMode } from "@/lib/ai-types";
import { useT } from "@/lib/i18n/client";
import AdGenerator from "./AdGenerator";
import AdExperiments from "./AdExperiments";
import AiPreflight from "./AiPreflight";
import KeywordResearch, { type BriefSeed } from "./KeywordResearch";
import SavedKeywordLists from "./SavedKeywordLists";
import ContentBriefGenerator from "./ContentBriefGenerator";
import ContentPipeline from "./ContentPipeline";
import PerformanceAnalyst from "./PerformanceAnalyst";
import CreativeStudio from "./CreativeStudio";
import CreativeAttribution from "./CreativeAttribution";

const T = {
  cs: {
    tabAdsLabel: "PPC inzeráty",
    tabAdsService: "Výkonnostní reklama",
    tabKeywordsLabel: "Klíčová slova",
    tabKeywordsService: "SEO & výzkum",
    tabBriefLabel: "Obsahový brief",
    tabBriefService: "Tvorba obsahu",
    tabAnalysisLabel: "Analýza dat",
    tabAnalysisService: "Analýzy a strategie",
    tabCreativeLabel: "Vizuály",
    tabCreativeService: "Kreativa & obrázky",
    tabPipelineLabel: "Obsahová linka",
    tabPipelineService: "Od klíčových slov k distribuci",
    tablistAriaLabel: "Nástroje AI asistenta",
  },
  en: {
    tabAdsLabel: "PPC Ads",
    tabAdsService: "Performance advertising",
    tabKeywordsLabel: "Keywords",
    tabKeywordsService: "SEO & research",
    tabBriefLabel: "Content brief",
    tabBriefService: "Content creation",
    tabAnalysisLabel: "Data analysis",
    tabAnalysisService: "Analytics & strategy",
    tabCreativeLabel: "Visuals",
    tabCreativeService: "Creative & images",
    tabPipelineLabel: "Content pipeline",
    tabPipelineService: "Keywords to distribution",
    tablistAriaLabel: "AI assistant tools",
  },
} as const;

type TabId = AiMode | "keywords" | "creative" | "pipeline";

interface Tab {
  id: TabId;
  labelKey: keyof typeof T.cs;
  serviceKey: keyof typeof T.cs;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: Tab[] = [
  { id: "ads", labelKey: "tabAdsLabel", serviceKey: "tabAdsService", icon: Bolt },
  { id: "keywords", labelKey: "tabKeywordsLabel", serviceKey: "tabKeywordsService", icon: Search },
  { id: "brief", labelKey: "tabBriefLabel", serviceKey: "tabBriefService", icon: Document },
  { id: "analysis", labelKey: "tabAnalysisLabel", serviceKey: "tabAnalysisService", icon: Gauge },
  { id: "creative", labelKey: "tabCreativeLabel", serviceKey: "tabCreativeService", icon: ImageIcon },
  { id: "pipeline", labelKey: "tabPipelineLabel", serviceKey: "tabPipelineService", icon: Layers },
];

/** Validate an untrusted ?tool= value against the known tab ids. */
const isTabId = (v: string | null): v is TabId => TABS.some((tab) => tab.id === v);

/** ARIA wiring + visibility for one tool panel: pairs the panel with its tab
 *  (aria-controls ↔ aria-labelledby) and keeps the existing testid/fade classes. */
function panelProps(id: TabId, active: TabId) {
  return {
    role: "tabpanel",
    id: `tool-${id}`,
    "aria-labelledby": `ai-tab-${id}`,
    "data-testid": `tool-${id}`,
    className: active === id ? "animate-fade-up" : "hidden",
  } as const;
}

export default function AiAssistant() {
  const t = useT(T);
  const [tab, setTab] = useState<TabId>("ads");
  // Cross-tool handoff: the keyword tool seeds the brief tool. The nonce lets the
  // brief tool re-apply the seed even if the same selection is sent twice.
  const [briefSeed, setBriefSeed] = useState<BriefSeed | null>(null);
  const [briefNonce, setBriefNonce] = useState(0);
  // Brief → ads handoff: the finished brief seeds the PPC ad generator (same
  // seed + nonce + tab-switch pattern), completing the research → content →
  // performance loop without retyping the topic/audience/benefits.
  const [adSeed, setAdSeed] = useState<Partial<AdRequest> | null>(null);
  const [adNonce, setAdNonce] = useState(0);
  // Bumped when a keyword list is saved, so the saved-lists panel reloads.
  const [savedNonce, setSavedNonce] = useState(0);
  // Bumped when an A/B variant is saved, so the experiments panel reloads.
  const [experimentNonce, setExperimentNonce] = useState(0);

  // Deep link: /ai-asistent?tool=<id> lands on that tool, so a refresh keeps
  // the user's place next to their restored results and a specific tool can be
  // shared/bookmarked. Reading location in a mount effect (not an initializer)
  // keeps the server render and the first client render identical — no
  // hydration mismatch and no useSearchParams Suspense requirement (the page
  // stays a server component).
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tool");
    if (isTabId(param)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(param);
    }
  }, []);

  /** Switch tools and mirror the choice into ?tool= (replaceState — no router
   *  churn, no history spam), keeping the URL shareable and refresh-stable. */
  const selectTab = (id: TabId) => {
    setTab(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tool", id);
      window.history.replaceState(null, "", url);
    } catch {
      /* URL/history unavailable — tab switching itself still works */
    }
  };

  const handleCreateBrief = (seed: BriefSeed) => {
    setBriefSeed(seed);
    setBriefNonce((n) => n + 1);
    selectTab("brief");
  };

  const handleCreateAds = (seed: Partial<AdRequest>) => {
    setAdSeed(seed);
    setAdNonce((n) => n + 1);
    selectTab("ads");
  };

  // WAI-ARIA tabs pattern: the roles below promise arrow-key navigation, so
  // deliver it — roving tabIndex (one tab stop for the whole strip) plus
  // ArrowLeft/ArrowRight/Home/End moving BOTH focus and selection, wrapping.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((tab_) => tab_.id === tab);
    let next: number;
    switch (e.key) {
      case "ArrowRight":
        next = (current + 1) % TABS.length;
        break;
      case "ArrowLeft":
        next = (current - 1 + TABS.length) % TABS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = TABS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const id = TABS[next].id;
    selectTab(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={t("tablistAriaLabel")}
        onKeyDown={onTablistKeyDown}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6"
      >
        {TABS.map((tab_) => {
          const active = tab_.id === tab;
          const Icon = tab_.icon;
          return (
            <button
              key={tab_.id}
              ref={(el) => {
                tabRefs.current[tab_.id] = el;
              }}
              role="tab"
              id={`ai-tab-${tab_.id}`}
              aria-selected={active}
              aria-controls={`tool-${tab_.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(tab_.id)}
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
                  {t(tab_.labelKey)}
                </span>
                <span className="mt-0.5 hidden text-xs text-muted sm:block">{t(tab_.serviceKey)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* One preflight for every tool: demo-mode / spent-budget warnings render
          BEFORE a form is filled and a request burned, not after. */}
      <AiPreflight />

      {/* All tools stay mounted (state is preserved across tab switches); the
          active one re-runs its fade because the class flips from hidden.
          Each wrapper is the tab's aria-controls target: a real tabpanel,
          labelled by its tab (hidden panels leave the a11y tree via display:none). */}
      <div className="mt-6">
        <div {...panelProps("ads", tab)}>
          {/* re-mount on each handoff so a new seed prefills via lazy init */}
          <AdGenerator
            key={`ads-${adNonce}`}
            seed={adSeed}
            onVariantSaved={() => setExperimentNonce((n) => n + 1)}
          />
          <AdExperiments refreshKey={experimentNonce} />
        </div>
        <div {...panelProps("keywords", tab)}>
          <KeywordResearch
            onCreateBrief={handleCreateBrief}
            onSaved={() => setSavedNonce((n) => n + 1)}
          />
          <SavedKeywordLists refreshKey={savedNonce} />
        </div>
        <div {...panelProps("brief", tab)}>
          {/* re-mount on each handoff so a new seed prefills via lazy init */}
          <ContentBriefGenerator key={`brief-${briefNonce}`} seed={briefSeed} onCreateAds={handleCreateAds} />
        </div>
        <div {...panelProps("analysis", tab)}>
          <PerformanceAnalyst />
        </div>
        <div {...panelProps("creative", tab)}>
          <CreativeStudio />
          <CreativeAttribution />
        </div>
        <div {...panelProps("pipeline", tab)}>
          <ContentPipeline />
        </div>
      </div>
    </div>
  );
}
