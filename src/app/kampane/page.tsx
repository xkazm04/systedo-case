import type { Metadata } from "next";
import { Container, Eyebrow, Pill } from "@/components/ui";
import { Info } from "@/components/icons";
import CampaignsClient from "@/components/campaigns/CampaignsClient";
import TaskPager from "@/components/site/TaskPager";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    eyebrow: "Bonus · Kampaně z Google Ads",
    heading: "Přehled kampaní",
    bodyBefore: "Přehled kampaní napojený na",
    googleAds: "Google Ads",
    bodyAfter: "– přihlaste se účtem Google a vyberte svůj účet Ads, jinak běží přehled na ukázkových datech. Srovnání podle kampaní i typů a AI vyhodnocení s doporučenými kroky. Data se ukládají per uživatele do Firestore.",
    pillLabel: "Cloud · přihlášení Google",
    footer: "Firestore · AI: Gemini",
  },
  en: {
    eyebrow: "Bonus · Campaigns from Google Ads",
    heading: "Campaign overview",
    bodyBefore: "A campaign overview connected to",
    googleAds: "Google Ads",
    bodyAfter: "– sign in with your Google account and pick your Ads account, or the overview runs on sample data. Comparison by campaign and by type, plus an AI evaluation with recommended next steps. Data is saved per user in Firestore.",
    pillLabel: "Cloud · Google sign-in",
    footer: "Firestore · AI: Gemini",
  },
} as const;

// generateMetadata not yet localized — this page has no server locale read
// elsewhere; flagged for a future pass rather than improvised here.
export const metadata: Metadata = {
  title: "Kampaně: přehled Google Ads",
  description:
    "Přehled marketingových kampaní napojený na Google Ads: přihlášení účtem Google, výběr účtu Ads, srovnání podle kampaní i typů a AI vyhodnocení — data per uživatele ve Firestore.",
};

export default async function CampaignsPage() {
  const t = await getT(T);
  return (
    <Container className="py-10 sm:py-12">
      <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
            {t("heading")}
          </h1>
          <p className="mt-2 max-w-xl text-muted">
            {t("bodyBefore")} <strong className="text-navy-700">{t("googleAds")}</strong>{" "}
            {t("bodyAfter")}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Pill tone="neutral">
            <Info width={13} height={13} />
            <span>{t("pillLabel")}</span>
          </Pill>
          <span className="text-sm text-muted">{t("footer")}</span>
        </div>
      </div>

      <div className="mt-8">
        <CampaignsClient />
      </div>

      <TaskPager current="/kampane" />
    </Container>
  );
}
