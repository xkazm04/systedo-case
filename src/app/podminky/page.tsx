import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import { SUPPORT_EMAIL, SALES_EMAIL } from "@/lib/site";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { LEGAL_CONTENT, LegalSections } from "@/components/site/LegalSections";

/** /podminky — terms of service. Documents the SHIPPED product and the current
 *  free-during-validation pricing state (see /cena). Server component, bilingual
 *  via the colocated cs/en dictionary, canonical like /cena. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(T);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/podminky" },
  };
}

const T = {
  cs: {
    metaTitle: "Podmínky služby – Adamant",
    metaDescription:
      "Podmínky používání aplikace Adamant: co služba je, cena zdarma během validace, účty, připojená data a odpovědnost.",
    eyebrow: "Právní informace",
    heading: "Podmínky služby",
    updated: "Účinné od 4. srpna 2026",
  },
  en: {
    metaTitle: "Terms of Service – Adamant",
    metaDescription:
      "Terms for using the Adamant app: what the service is, free-during-validation pricing, accounts, connected data and liability.",
    eyebrow: "Legal",
    heading: "Terms of Service",
    updated: "Effective 4 August 2026",
  },
} as const;

export default async function TermsPage() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const sections = (LEGAL_CONTENT[locale] ?? LEGAL_CONTENT.cs).terms;
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
