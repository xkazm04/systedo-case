"use client";

import { Pill } from "@/components/ui";
import { Calendar, Coins, Layers } from "@/components/icons";
import {
  answeredCount,
  qualificationScore,
  scoreLabel,
  scoreTone,
  type Budget,
  type Disposition,
  type Qualification,
  type Scope,
  type Timeline,
} from "@/lib/speed-lead/qualification";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    leadQualification: "Kvalifikace leadu",
    score: "Skóre {n}",
    fieldsAnswered: "{n}/3 polí",
    timeline: "Termín",
    budget: "Rozpočet",
    scope: "Rozsah",
    rating: "Hodnocení:",
    askAbout: "Doptat se:",
    timelineAsap: "Co nejdříve",
    timelineWeeks: "Do několika týdnů",
    timelineExploring: "Jen zjišťuje",
    budgetConfirmed: "Potvrzený",
    budgetFlexible: "Flexibilní",
    budgetTight: "Omezený",
    scopeLarge: "Velký",
    scopeMedium: "Střední",
    scopeSmall: "Malý",
    dispositionHot: "Horký",
    dispositionWarm: "Vlažný",
    dispositionCold: "Studený",
  },
  en: {
    leadQualification: "Lead qualification",
    score: "Score {n}",
    fieldsAnswered: "{n}/3 fields",
    timeline: "Timeline",
    budget: "Budget",
    scope: "Scope",
    rating: "Rating:",
    askAbout: "Ask about:",
    timelineAsap: "As soon as possible",
    timelineWeeks: "Within a few weeks",
    timelineExploring: "Just exploring",
    budgetConfirmed: "Confirmed",
    budgetFlexible: "Flexible",
    budgetTight: "Tight",
    scopeLarge: "Large",
    scopeMedium: "Medium",
    scopeSmall: "Small",
    dispositionHot: "Hot",
    dispositionWarm: "Warm",
    dispositionCold: "Cold",
  },
} as const;

/** Structured qualification capture (BANT-style) — the rep qualifies while
 *  replying; a lightweight score travels downstream. Presentational: the captured
 *  qualification + a per-field patch callback come in as props, the score/answered
 *  are derived here, and the "Ask about" questions are passed through from the
 *  shell's AI/deterministic set. Client-only, no server imports. */
export default function LeadQualificationPanel({
  qual,
  onChange,
  questions,
}: {
  /** The selected lead's captured qualification (or a fresh empty one). */
  qual: Qualification;
  /** Patch one field of the selected lead's qualification. */
  onChange: <K extends keyof Qualification>(key: K, value: Qualification[K]) => void;
  /** The questions to display — the AI's when present, else the deterministic set. */
  questions: string[];
}) {
  const t = useT(T);

  /** Locale-aware option lists for the inline qualification selects. */
  const TIMELINE_OPTIONS: { value: Timeline; label: string }[] = [
    { value: "unknown", label: "—" },
    { value: "asap", label: t("timelineAsap") },
    { value: "weeks", label: t("timelineWeeks") },
    { value: "exploring", label: t("timelineExploring") },
  ];
  const BUDGET_OPTIONS: { value: Budget; label: string }[] = [
    { value: "unknown", label: "—" },
    { value: "confirmed", label: t("budgetConfirmed") },
    { value: "flexible", label: t("budgetFlexible") },
    { value: "tight", label: t("budgetTight") },
  ];
  const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
    { value: "unknown", label: "—" },
    { value: "large", label: t("scopeLarge") },
    { value: "medium", label: t("scopeMedium") },
    { value: "small", label: t("scopeSmall") },
  ];
  const DISPOSITION_OPTIONS: { value: Disposition; label: string }[] = [
    { value: "hot", label: t("dispositionHot") },
    { value: "warm", label: t("dispositionWarm") },
    { value: "cold", label: t("dispositionCold") },
  ];

  const qualScore = qualificationScore(qual);
  const qualAnswered = answeredCount(qual);

  return (
    <div className="mt-4 rounded-card border border-line bg-canvas p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("leadQualification")}</p>
        <div className="flex items-center gap-2">
          <Pill tone={scoreTone(qualScore)}>
            {t("score", { n: qualScore })} — {scoreLabel(qualScore)}
          </Pill>
          <span className="text-[11px] text-muted">{t("fieldsAnswered", { n: qualAnswered })}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="flex items-center gap-1 text-[11px] font-medium text-navy-700">
            <Calendar width={12} height={12} className="text-brand-accent" />
            {t("timeline")}
          </span>
          <select
            value={qual.timeline}
            onChange={(e) => onChange("timeline", e.target.value as Timeline)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {TIMELINE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="flex items-center gap-1 text-[11px] font-medium text-navy-700">
            <Coins width={12} height={12} className="text-brand-accent" />
            {t("budget")}
          </span>
          <select
            value={qual.budget}
            onChange={(e) => onChange("budget", e.target.value as Budget)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {BUDGET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="flex items-center gap-1 text-[11px] font-medium text-navy-700">
            <Layers width={12} height={12} className="text-brand-accent" />
            {t("scope")}
          </span>
          <select
            value={qual.scope}
            onChange={(e) => onChange("scope", e.target.value as Scope)}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-navy-700">{t("rating")}</span>
        <div className="inline-flex rounded-pill border border-line bg-surface p-0.5">
          {DISPOSITION_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange("disposition", o.value)}
              className={`rounded-pill px-2.5 py-1 text-xs font-medium transition-colors ${
                qual.disposition === o.value
                  ? "bg-brand-600 text-white"
                  : "text-navy-700 hover:bg-brand-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {questions.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted">
          {t("askAbout")} {questions.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
