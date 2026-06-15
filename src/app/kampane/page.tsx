import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import { Info } from "@/components/icons";
import CampaignsClient from "@/components/campaigns/CampaignsClient";
import TaskPager from "@/components/site/TaskPager";

export const metadata: Metadata = {
  title: "Kampaně — Google Ads přehled",
  description:
    "Kompaktní přehled marketingových kampaní napojený na Google Ads: srovnání podle kampaní i typů, AI vyhodnocení s doporučenými kroky a uložení do SQLite.",
};

export default function CampaignsPage() {
  return (
    <Container className="py-10 sm:py-12">
      <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>Bonus · Kampaně z Google Ads</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
            Přehled kampaní
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            Kompaktní dashboard kampaní klienta <strong className="text-navy-700">Mionelo</strong> —
            napojení na Google Ads, srovnání čísel podle kampaní i typů a AI vyhodnocení s
            doporučenými dalšími kroky. Data se ukládají do lokální SQLite.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Pill tone="neutral">
            <Info width={13} height={13} />
            <span>Lokální dev režim</span>
          </Pill>
          <span className="text-sm text-muted">SQLite · AI: Gemini</span>
        </div>
      </div>

      <div className="mt-8">
        <CampaignsClient />
      </div>

      <TaskPager current="/kampane" />
    </Container>
  );
}
