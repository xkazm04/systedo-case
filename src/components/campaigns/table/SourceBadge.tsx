"use client";

/** ADR-0010 — the per-row network tag for a UNION read, plus the read-only hint
 *  that keeps the union honest about writes.
 *
 *  Rendered only when a project actually resolved to more than one tenant (the
 *  API sends `sources` only then), so a single-network console is untouched.
 *  Tints follow the badge precedent in `src/components/ai/KeywordResearch.tsx`,
 *  with the raw `text-brand-700` swapped for the semantic `text-brand-accent`:
 *  brand-700 holds the same hex in both themes, so it goes muddy against the dark
 *  `bg-brand-50` surface, while brand-accent flips with the theme. */
import { useT } from "@/lib/i18n/client";
import type { AdsSource } from "@/lib/campaigns/types";

const T = {
  cs: {
    "google-ads": "Google Ads",
    sklik: "Sklik",
    sample: "Ukázka",
    sourceAria: "Zdroj řádku: {source}",
    readOnly: "jen ke čtení",
    readOnlyTitle:
      "Zápisy do Skliku zatím nejsou podporované: změnové balíčky a přesuny rozpočtu se dají připravit jen pro Google Ads. Data ze Skliku se načítají a vyhodnocují normálně.",
  },
  en: {
    "google-ads": "Google Ads",
    sklik: "Sklik",
    sample: "Sample",
    sourceAria: "Row source: {source}",
    readOnly: "read-only",
    readOnlyTitle:
      "Sklik writes are not supported yet: change sets and budget moves can only be staged for Google Ads. Sklik data is read and evaluated as normal.",
  },
} as const;

/** Per-source pill tint. Sklik gets the brand tint (the network that is new in the
 *  table), Google/sample the neutral one — both token pairs flip in dark mode. */
const TONE: Record<AdsSource, string> = {
  "google-ads": "bg-navy-50 text-muted",
  sklik: "bg-brand-50 text-brand-accent",
  sample: "bg-navy-50 text-muted",
};

/** The label key for a source, shared with the source filter so the two controls
 *  can never disagree on what a network is called. */
export function sourceLabelKey(source: AdsSource | undefined): "google-ads" | "sklik" | "sample" {
  return source === "sklik" ? "sklik" : source === "google-ads" ? "google-ads" : "sample";
}

/** One row's network. Absent source → nothing (a row that predates the tag can't
 *  be labelled honestly, and guessing would be worse than staying silent). */
export default function SourceBadge({ source }: { source?: AdsSource }) {
  const t = useT(T);
  if (!source) return null;
  const label = t(sourceLabelKey(source));
  return (
    <span className={`pill ${TONE[source]}`} title={t("sourceAria", { source: label })}>
      {label}
    </span>
  );
}

/** Stands in for the "stage a change set" affordance on a Sklik row: mutations
 *  remain Google-only until the Sklik write path lands (ADR-0010 "Consequences"),
 *  and the server refuses them anyway — so the UI must not offer the button. */
export function SourceReadOnlyHint() {
  const t = useT(T);
  return (
    <span className="text-[11px] text-muted" title={t("readOnlyTitle")}>
      {t("readOnly")}
    </span>
  );
}
