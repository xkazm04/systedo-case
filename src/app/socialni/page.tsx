import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import SocialClient from "@/components/social/SocialClient";
import { getT } from "@/lib/i18n/server";

// generateMetadata is not wired here (this file has no server locale read for the
// metadata export) - the title/description below stay Czech-only per the
// contract's "flag, don't improvise" rule; see docs/i18n flags.
export const metadata: Metadata = {
  title: "Sociální sítě — plánování a komunikace",
  description:
    "Centrum pro sociální sítě: návrh příspěvků, plánování publikace a schránka komentářů a zpráv s návrhy odpovědí ke schválení.",
};

const T = {
  cs: {
    eyebrow: "Sociální sítě",
    heading: "Centrum sociálních sítí",
    intro:
      "Navrhněte příspěvky, naplánujte publikaci a vyřizujte komentáře i zprávy z jednoho místa. Bez napojení reálných účtů běží vše v ukázkovém režimu (publikace se simuluje), takže si projdete celý tok.",
  },
  en: {
    eyebrow: "Social media",
    heading: "Social media center",
    intro:
      "Draft posts, schedule publishing, and handle comments and messages from one place. Without connected real accounts everything runs in demo mode (publishing is simulated), so you can walk through the whole flow.",
  },
} as const;

export default async function SocialPage() {
  const t = await getT(T);
  return (
    <Container className="py-10 sm:py-12">
      <div className="border-b border-line pb-8">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          {t("heading")}
        </h1>
        <p className="mt-2 max-w-2xl text-muted">{t("intro")}</p>
      </div>

      <div className="mt-8">
        <SocialClient />
      </div>
    </Container>
  );
}
