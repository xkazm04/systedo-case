import { Pill } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    badge: "Ukázková data",
    defaultNote:
      "Čísla jsou ilustrativní (seedovaná) — nejde o vaše reálné účetnictví. Skutečná data se napojí přes konektor (viz poznámky „Seam“).",
  },
  en: {
    badge: "Sample data",
    defaultNote:
      "The numbers are illustrative (seeded) — not your real accounts. Live data will connect via a connector (see “Seam” notes).",
  },
} as const;

/** Honest "this is illustrative sample data" banner for the modules that run over
 *  seeded data with no real-data connection yet (profit / LTV / audience /
 *  inventory). Keeps the trust signal consistent with Distribution / Local, which
 *  already say so — a finance-minded user needs to know the numbers aren't their
 *  real books before they trust the screen. */
export default async function SampleDataNote({ note }: { note?: string }) {
  const t = await getT(T);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-canvas px-4 py-2.5 text-xs text-muted">
      <Pill tone="navy">{t("badge")}</Pill>
      <span>{note ?? t("defaultNote")}</span>
    </div>
  );
}
