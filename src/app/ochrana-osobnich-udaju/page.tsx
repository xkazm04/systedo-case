import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import { SUPPORT_EMAIL, SALES_EMAIL } from "@/lib/site";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { LEGAL_CONTENT, LegalSections } from "@/components/site/LegalSections";

/** /ochrana-osobnich-udaju — privacy policy. Documents the SHIPPED data behavior
 *  (Google OAuth via Auth.js with Firestore-stored tokens, AES-256-GCM encrypted
 *  BYOM keys, Resend transactional e-mail, Google Ads / Sklik ingestion, the
 *  locale + session cookies and the theme localStorage entry — no tracking
 *  cookies) rather than aspirational boilerplate. Server component, bilingual via
 *  the colocated cs/en dictionary, canonical like /cena. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(T);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/ochrana-osobnich-udaju" },
  };
}

const T = {
  cs: {
    metaTitle: "Ochrana osobních údajů – Adamant",
    metaDescription:
      "Jaká data aplikace Adamant zpracovává, kde jsou uložená a jak požádat o jejich smazání.",
    eyebrow: "Právní informace",
    heading: "Ochrana osobních údajů",
    updated: "Účinné od 4. srpna 2026",
  },
  en: {
    metaTitle: "Privacy Policy – Adamant",
    metaDescription:
      "What data the Adamant app processes, where it is stored, and how to request deletion.",
    eyebrow: "Legal",
    heading: "Privacy Policy",
    updated: "Effective 4 August 2026",
  },
} as const;

export default async function PrivacyPage() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const sections = (LEGAL_CONTENT[locale] ?? LEGAL_CONTENT.cs).privacy;
  return (
    <Container size="narrow" className="py-12 sm:py-16">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-[2.4rem]">
        {t("heading")}
      </h1>
      <p className="mt-2 text-sm text-muted">{t("updated")}</p>
      <LegalSections sections={sections} supportEmail={SUPPORT_EMAIL} salesEmail={SALES_EMAIL} />
    </Container>
  );
}
