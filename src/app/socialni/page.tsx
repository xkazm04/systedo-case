import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import SocialClient from "@/components/social/SocialClient";

export const metadata: Metadata = {
  title: "Sociální sítě — plánování a komunikace",
  description:
    "Centrum pro sociální sítě: návrh příspěvků, plánování publikace a schránka komentářů a zpráv s návrhy odpovědí ke schválení.",
};

export default function SocialPage() {
  return (
    <Container className="py-10 sm:py-12">
      <div className="border-b border-line pb-8">
        <Eyebrow>Sociální sítě</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          Centrum sociálních sítí
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Navrhněte příspěvky, naplánujte publikaci a vyřizujte komentáře i zprávy z jednoho místa.
          Bez napojení reálných účtů běží vše v ukázkovém režimu (publikace se simuluje), takže si
          projdete celý tok.
        </p>
      </div>

      <div className="mt-8">
        <SocialClient />
      </div>
    </Container>
  );
}
