import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import PatternsLibrary from "@/components/patterns/PatternsLibrary";
import { getT } from "@/lib/i18n/server";

// generateMetadata: this file has no server locale read prior to this table, so
// per the contract the metadata strings are left as-is (flagged), not localized.
export const metadata: Metadata = {
  title: "Knihovna vzorů — co u vás funguje",
  description:
    "Knihovna osvědčených marketingových vzorů odvozených z vašich vlastních výsledků. Uložené vzory ladí AI vyhodnocení kampaní.",
};

const T = {
  cs: {
    eyebrow: "Knihovna vzorů",
    title: "Co u vás funguje",
    desc: "Osvědčené vzory automaticky odvozené z vašich kampaní a historie vyhodnocení — vítězné struktury, pasti na rozpočet i optimalizace, které zabraly. Připněte si je do knihovny; uložené vzory pak ladí AI vyhodnocení portfolia.",
  },
  en: {
    eyebrow: "Pattern library",
    title: "What works for you",
    desc: "Proven patterns automatically derived from your campaigns and evaluation history — winning structures, budget traps, and optimizations that paid off. Pin them to your library; saved patterns then tune the AI's portfolio evaluations.",
  },
};

export default async function PatternsPage() {
  const t = await getT(T);
  return (
    <Container className="py-10 sm:py-12">
      <div className="border-b border-line pb-8">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {t("desc")}
        </p>
      </div>

      <div className="mt-8">
        <PatternsLibrary />
      </div>
    </Container>
  );
}
