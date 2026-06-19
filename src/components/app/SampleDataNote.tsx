import { Pill } from "@/components/ui";

/** Honest "this is illustrative sample data" banner for the modules that run over
 *  seeded data with no real-data connection yet (profit / LTV / audience /
 *  inventory). Keeps the trust signal consistent with Distribution / Local, which
 *  already say so — a finance-minded user needs to know the numbers aren't their
 *  real books before they trust the screen. */
export default function SampleDataNote({ note }: { note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-canvas px-4 py-2.5 text-xs text-muted">
      <Pill tone="navy">Ukázková data</Pill>
      <span>
        {note ??
          "Čísla jsou ilustrativní (seedovaná) — nejde o vaše reálné účetnictví. Skutečná data se napojí přes konektor (viz poznámky „Seam“)."}
      </span>
    </div>
  );
}
