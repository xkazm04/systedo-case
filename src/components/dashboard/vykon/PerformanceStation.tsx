"use client";
/** One station of the Performance roof (ADR-0013): Measure (how it went), Triage
 *  (why) or Act (what to do). The kit Station with the Performance hue and this
 *  roof's own copy, so DashboardClient only says which band a panel sits in. */
import type { ReactNode } from "react";
import Station, { type StationStep } from "@/components/kit/Station";
import { areaHueVar } from "@/lib/projects/areas";
import { useT } from "@/lib/i18n/client";

const T = {
  en: {
    measure: "Measure",
    measureTitle: "How it went",
    measurePurpose: "The period against its baseline, the monthly goal and the trend.",
    triage: "Triage",
    triageTitle: "Why",
    triagePurpose: "Which channels carried it, the cost ratio against its goal, and the week's shape.",
    act: "Act",
    actTitle: "What to do",
    actPurpose: "What broke pattern, what it means, and the diagnosis that turns it into a change.",
  },
  cs: {
    measure: "Měřit",
    measureTitle: "Jak to šlo",
    measurePurpose: "Období proti srovnání, měsíční cíl a vývoj v čase.",
    triage: "Třídit",
    triageTitle: "Proč",
    triagePurpose: "Které kanály to nesly, PNO proti cíli a tvar týdne.",
    act: "Jednat",
    actTitle: "Co udělat",
    actPurpose: "Co vybočilo, co to znamená a diagnóza, která z toho udělá změnu.",
  },
} as const;

export default function PerformanceStation({ step, children }: { step: StationStep; children: ReactNode }) {
  const t = useT(T);
  return (
    <Station
      id={`performance-${step}`}
      step={step}
      eyebrow={t(step)}
      title={t(`${step}Title`)}
      purpose={t(`${step}Purpose`)}
      hue={areaHueVar("performance")}
    >
      {children}
    </Station>
  );
}
