import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import ByomQualityOverview from "@/components/app/modules/ByomQualityOverview";
import ByomQualityMatrix from "@/components/app/modules/ByomQualityMatrix";
import { hasQualityScores } from "@/lib/llm/quality-scores";
import { getT } from "@/lib/i18n/server";

/** Public model-quality page: the measured LLM-as-judge scores (baked static data,
 *  no auth) surfaced from the homepage footer so anyone can see which provider/model
 *  performs best. The interactive per-operation assignment stays in /app settings. */
export const metadata: Metadata = {
  title: "Kvalita modelů",
  description:
    "Naměřená kvalita jazykových modelů napříč všemi AI operacemi — LLM-as-judge benchmark, který pomáhá vybrat poskytovatele a model.",
  alternates: { canonical: "/kvalita-modelu" },
};

const T = {
  cs: {
    eyebrow: "Měřená kvalita",
    heading: "Kvalita modelů",
    intro:
      "Každou AI operaci v aplikaci proháníme přes několik jazykových modelů a necháme jejich výstupy nezávisle ohodnotit (LLM jako rozhodčí). Výsledné složené skóre ukazuje, který poskytovatel a model si vede nejlépe — a pomáhá vybrat v matici modelů ve vlastním nastavení.",
    empty: "Zatím nejsou naměřená žádná data.",
  },
  en: {
    eyebrow: "Measured quality",
    heading: "Model quality",
    intro:
      "We run every AI operation in the app through several language models and have their outputs graded independently (LLM as judge). The resulting composite score shows which provider and model performs best — and helps you choose in the model matrix in your own settings.",
    empty: "No measurements have been taken yet.",
  },
} as const;

export default async function ModelQualityPage() {
  const t = await getT(T);
  return (
    // Whole page held to a constant 80% of the viewport width so every section
    // (intro, scorecard, matrix) shares one edge instead of the old 3xl/4xl mix.
    <div className="mx-auto w-4/5 py-12 sm:py-16">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-[2.4rem]">
        {t("heading")}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">{t("intro")}</p>

      {hasQualityScores() ? (
        <>
          <ByomQualityOverview className="w-full" />
          <ByomQualityMatrix className="w-full" />
        </>
      ) : (
        <p className="mt-8 rounded-card border border-dashed border-line px-4 py-3 text-sm text-muted">
          {t("empty")}
        </p>
      )}
    </div>
  );
}
