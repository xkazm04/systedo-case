/** Per-panel "this panel is illustrative" chip.
 *
 *  The page-level gutter (ModulePage `sample` → SampleDataNote) is a blanket claim
 *  over everything below it, and it correctly disappears the moment the project
 *  distributes an article of its own. That is exactly when the panels that are
 *  fixture BY CONSTRUCTION — attribution, and the Insights rollup over it — need
 *  to say so on their own. Same words and the same navy Pill the gutter and the
 *  Overview's per-recommendation chip use, so one disclosure vocabulary covers
 *  page, panel and row.
 *
 *  Renders nothing when the panel is not sample-derived, so a panel that goes live
 *  simply stops disclosing. */
"use client";

import { Pill } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    badge: "Ukázková data",
    hint: "Tento panel běží na ilustrativních číslech, ne na vašem měření. Po napojení analytiky se přepočítá na reálná data.",
  },
  en: {
    badge: "Sample data",
    hint: "This panel runs on illustrative numbers, not your measurement. It recomputes on real data once analytics is connected.",
  },
} as const;

export default function SampleChip({ sample }: { sample: boolean }) {
  const t = useT(T);
  if (!sample) return null;
  return (
    <span className="shrink-0" title={t("hint")}>
      <Pill tone="navy">{t("badge")}</Pill>
    </span>
  );
}
