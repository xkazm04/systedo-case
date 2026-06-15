import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import DashboardClient from "@/components/dashboard/DashboardClient";
import TaskPager from "@/components/site/TaskPager";
import { Info } from "@/components/icons";
import { performance } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Dashboard — výkon klienta",
  description:
    "Výkonnostní přehled e-shopu Mionelo: návštěvy, náklady, konverze, hodnota konverzí a PNO s historií a rozpadem podle kanálů.",
};

export default function DashboardPage() {
  const { client, meta } = performance;

  return (
    <Container className="py-10 sm:py-12">
      {/* page header */}
      <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>Úkol 1 · Přehled výkonu</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
            Výkonnostní dashboard
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            Rychlá orientace ve výkonu klienta <strong className="text-navy-700">{client.name}</strong>{" "}
            ({client.domain}) — od headline metrik až po rozpad podle kanálů a pohled do historie.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Pill tone="neutral">
            <Info width={13} height={13} />
            <span title={meta.disclaimer}>Ilustrativní data</span>
          </Pill>
          <span className="text-sm text-muted">Data k {fmtDate(meta.asOf)}</span>
        </div>
      </div>

      <div className="mt-8">
        <DashboardClient data={performance} />
      </div>

      <TaskPager current="/dashboard" />
    </Container>
  );
}
