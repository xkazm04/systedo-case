/** The Optic Bench kit, live (ADR-0014): every kit component rendered with
 *  stylised sample values, labelled as such. This section is the kit's
 *  specification — a component that is not shown here is not part of the kit. */
import Station from "@/components/kit/Station";
import Panel from "@/components/kit/Panel";
import { KpiStrip } from "@/components/kit/Kpi";
import Provenance from "@/components/kit/Provenance";
import Lamp from "@/components/kit/Lamp";
import Dial from "@/components/kit/Dial";
import Spectrum from "@/components/kit/Spectrum";
import AreaArt from "@/components/kit/art/AreaArt";
import { Button } from "@/components/ui";
import { AREAS, areaHueVar } from "@/lib/projects/areas";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

const T = {
  en: {
    eyebrow: "Kit",
    title: "Optic Bench kit",
    intro:
      "One beam, three moves: measure, triage, act. The pieces every area roof is built from. Values here are stylised samples.",
    measure: "Measure",
    measureTitle: "How it is going",
    measurePurpose: "The headline numbers, each with its change and its source.",
    triage: "Triage",
    triageTitle: "What needs you",
    act: "Act",
    actTitle: "One thing to do",
    kpis: "Key numbers",
    visits: "Visits",
    cost: "Cost",
    revenue: "Revenue",
    pno: "PNO",
    upWorse: "up 10 % on the previous period, worse",
    upBetter: "up 13.6 % on the previous period, better",
    split: "Channel split",
    splitLabel: "Revenue share by channel",
    pnoPanel: "PNO against goal",
    pnoCaption: "goal 15 %",
    sample: "Stylised",
    lamps: "Area lamps",
    attention: "2 things need you",
    primary: "Apply the budget move",
    secondary: "See why",
  },
  cs: {
    eyebrow: "Kit",
    title: "Kit Optic Bench",
    intro:
      "Jeden paprsek, tři kroky: měřit, třídit, jednat. Díly, ze kterých je postavená každá oblast. Hodnoty jsou stylizované ukázky.",
    measure: "Měřit",
    measureTitle: "Jak se daří",
    measurePurpose: "Hlavní čísla, každé se změnou a se zdrojem.",
    triage: "Třídit",
    triageTitle: "Co potřebuje vás",
    act: "Jednat",
    actTitle: "Jedna věc k udělání",
    kpis: "Hlavní čísla",
    visits: "Návštěvy",
    cost: "Náklady",
    revenue: "Tržby",
    pno: "PNO",
    upWorse: "o 10 % víc než minulé období, hůř",
    upBetter: "o 13,6 % víc než minulé období, lépe",
    split: "Podíl kanálů",
    splitLabel: "Podíl tržeb podle kanálu",
    pnoPanel: "PNO proti cíli",
    pnoCaption: "cíl 15 %",
    sample: "Stylizováno",
    lamps: "Lampy oblastí",
    attention: "2 věci čekají na vás",
    primary: "Přesunout rozpočet",
    secondary: "Proč",
  },
} as const;

export default async function KitShowcase() {
  const t = await getT(T);
  const en = (await getServerLocale()) === "en";
  const badge = <Provenance source="stylised" label={t("sample")} />;
  return (
    <section id="kit" data-testid="ds-kit" className="grid scroll-mt-24 gap-14 border-t border-line py-12 sm:py-16">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-accent">{t("eyebrow")}</p>
        <h2 className="mt-3 font-display text-5xl font-light leading-none tracking-tight text-ink">{t("title")}</h2>
        <p className="mt-3 text-base text-muted">{t("intro")}</p>
      </div>

      <Station
        step="measure"
        eyebrow={t("measure")}
        title={t("measureTitle")}
        purpose={t("measurePurpose")}
        hue={areaHueVar("performance")}
        art={<AreaArt motif="detector" hue={areaHueVar("performance")} />}
      >
        <KpiStrip
          label={t("kpis")}
          items={[
            { label: t("visits"), value: "262,814", delta: "+10.0 %", tone: "good" },
            { label: t("cost"), value: "1,787,999", unit: "CZK", delta: "+10.0 %", tone: "bad", deltaLabel: t("upWorse") },
            { label: t("revenue"), value: "11.9 M", unit: "CZK", delta: "+13.6 %", tone: "good", deltaLabel: t("upBetter") },
            { label: t("pno"), value: "15.0 %", delta: "−3.1 %", tone: "good" },
          ]}
        />
      </Station>

      <Station step="triage" eyebrow={t("triage")} title={t("triageTitle")} hue={areaHueVar("reach")}>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Panel title={t("split")} aside={badge}>
            <Spectrum
              label={t("splitLabel")}
              parts={[
                { label: "Google Ads", value: 46, display: "46 %" },
                { label: "Sklik", value: 21, display: "21 %" },
                { label: "Organic", value: 17, display: "17 %" },
                { label: "Email", value: 9, display: "9 %" },
                { label: "Social", value: 7, display: "7 %" },
              ]}
            />
          </Panel>
          <Panel title={t("pnoPanel")} aside={badge}>
            <Dial value={15} max={30} goal={15} display="15.0 %" caption={t("pnoCaption")} good label="PNO 15 %, goal 15 %" />
          </Panel>
        </div>
      </Station>

      <Station step="act" eyebrow={t("act")} title={t("actTitle")} hue={areaHueVar("studio")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t("primary")}</Button>
          <Button variant="secondary">{t("secondary")}</Button>
          <Button variant="onyx">{t("secondary")}</Button>
        </div>
      </Station>

      <div className="grid gap-4">
        <h3 className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{t("lamps")}</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {AREAS.map((a, i) => (
            <Lamp
              key={a.key}
              area={a}
              href="#kit"
              name={en ? a.labelEn : a.label}
              status={en ? a.questionEn : a.question}
              attention={i === 2}
            />
          ))}
        </div>
        <p className="text-sm text-muted">{t("attention")}</p>
      </div>
    </section>
  );
}
