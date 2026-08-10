/** The article being distributed: its origin, its link, and the picker that
 *  switches between the articles the user handed over and the fixture.
 *
 *  The fixture and the user's own article must never look alike, so the origin is
 *  STATED on the card rather than implied by the title — this is the source
 *  panel's own provenance disclosure (lib/distribution/provenance: `source`), the
 *  reason the page-level gutter no longer has to speak for it. */
"use client";

import { Pill } from "@/components/ui";
import { Document } from "@/components/icons";
import type { SourceArticle } from "@/lib/distribution/sample";
import type { SourceChoice, SourceOrigin } from "@/lib/distribution/variants";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    sourceArticle: "Zdrojový článek",
    originSample: "Ukázkový článek",
    originProject: "Váš článek",
    pickerLabel: "Článek",
    sampleHint:
      "Toto je ukázkový článek. Vlastní článek sem pošlete tlačítkem „Poslat do Distribuce“ u konceptu článku.",
  },
  en: {
    sourceArticle: "Source article",
    originSample: "Sample article",
    originProject: "Your article",
    pickerLabel: "Article",
    sampleHint:
      "This is the sample article. Send one of your own with “Send to Distribution” on an article draft.",
  },
} as const;

export default function SourceCard({
  source,
  origin,
  choices,
  selectedKey,
  onSelect,
  hasOwnSources,
}: {
  source: SourceArticle;
  origin: SourceOrigin;
  choices: SourceChoice[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** the user has handed at least one article over — gates the picker */
  hasOwnSources: boolean;
}) {
  const t = useT(T);
  return (
    <div className="card flex flex-wrap items-center gap-4 p-5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-accent">
        <Document width={22} height={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {t("sourceArticle")}
          <Pill tone={origin === "project" ? "positive" : "coral"}>
            {t(origin === "project" ? "originProject" : "originSample")}
          </Pill>
        </p>
        <p className="truncate text-base font-semibold text-navy-800">{source.title}</p>
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="link-inline text-sm">
          {source.url.replace("https://", "")}
        </a>
        {origin === "sample" && !hasOwnSources ? (
          <p className="mt-1 text-xs text-muted">{t("sampleHint")}</p>
        ) : null}
      </div>
      {/* The picker only exists once the user has actually handed an article over
          — a brand-new project sees the card exactly as before. */}
      {hasOwnSources ? (
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted">
          <span className="font-medium">{t("pickerLabel")}</span>
          <select
            value={selectedKey}
            onChange={(e) => onSelect(e.target.value)}
            className="max-w-[16rem] truncate rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-sm text-navy-700 outline-none transition focus:border-brand-400 focus:bg-surface"
          >
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.origin === "sample" ? `${t("originSample")}: ${c.title}` : c.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
