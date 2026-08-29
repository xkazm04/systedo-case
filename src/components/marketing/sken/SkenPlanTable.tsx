"use client";

import { CATEGORY_LABELS, EFFORT_LABELS } from "@/components/app/channels/labels";
import type { OrganicChannel } from "@/lib/organic-channels/types";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

/** The first channel plan a scanned business gets — and an honest label on it.
 *
 *  This table is NOT a research result. It is `baseChannelPlan()`: the module's
 *  curated per-type catalog, ranked by a fit score and filled in with the brand and
 *  category the scan just read. That is a real, useful starting point (the channels
 *  are the Czech market's actual ones) and it is deterministic — the same business
 *  gets the same plan twice — but it is a plan chosen FOR a type of business, not
 *  one researched for this one. The `channel-research` op does the second thing and
 *  lives in the app; the note under the table says exactly that, because a visitor
 *  who mistakes the first for the second will feel misled the moment they see the
 *  real thing. (ADR-0003: one scan is one provider call — this costs none.) */
const SHOWN = 6;

const T = {
  cs: {
    heading: "Kde získat viditelnost bez rozpočtu",
    colChannel: "Kanál",
    colFamily: "Rodina",
    colFit: "Sedne",
    colEffort: "Náročnost",
    colFirst: "První krok",
    badge: "Orientační plán",
    note: "Prvních {shown} z {total} kanálů. Tenhle plán je kurátorovaný podle typu podnikání a doplněný o to, co sken přečetl — není to výsledek rešerše. Tu udělá modul Kanály v aplikaci nad vaším projektem.",
  },
  en: {
    heading: "Where to get seen without a budget",
    colChannel: "Channel",
    colFamily: "Family",
    colFit: "Fit",
    colEffort: "Effort",
    colFirst: "First step",
    badge: "Indicative plan",
    note: "The first {shown} of {total} channels. This plan is curated by business type and filled in with what the scan read — it is not the result of research. That is what the Channels module does inside the app, on your own project.",
  },
} as const;

export default function SkenPlanTable({ plan }: { plan: OrganicChannel[] }) {
  const t = useT(T);
  const { locale } = useLocale();
  const rows = plan.slice(0, SHOWN);
  if (rows.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight text-navy-800">{t("heading")}</h3>
        <span className="pill bg-navy-50 text-navy-700">{t("badge")}</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              <th scope="col" className="px-4 py-3">{t("colChannel")}</th>
              <th scope="col" className="px-4 py-3">{t("colFamily")}</th>
              <th scope="col" className="px-4 py-3 text-right">{t("colFit")}</th>
              <th scope="col" className="px-4 py-3">{t("colEffort")}</th>
              <th scope="col" className="px-4 py-3">{t("colFirst")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const effort = EFFORT_LABELS[c.effort];
              return (
                <tr key={c.id} className="border-b border-line align-top last:border-b-0">
                  <td className="px-4 py-3.5">
                    <span className="block font-semibold text-navy-800">{c.name}</span>
                    <span className="mt-0.5 block max-w-md text-[13px] leading-relaxed text-muted">
                      {c.payoff}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-muted">
                    {CATEGORY_LABELS[c.category][locale] ?? CATEGORY_LABELS[c.category].en}
                  </td>
                  <td className="tnum px-4 py-3.5 text-right font-semibold text-brand-accent">{c.fit}</td>
                  <td className="px-4 py-3.5">
                    <span className={`pill ${effort.tone}`}>{effort[locale] ?? effort.en}</span>
                  </td>
                  <td className="max-w-sm px-4 py-3.5 text-[13px] leading-relaxed text-navy-700">
                    {c.firstActions[0]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">
        {t("note", { shown: String(rows.length), total: String(plan.length) })}
      </p>
    </div>
  );
}
