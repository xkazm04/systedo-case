import type { Metadata } from "next";
import { Container, Eyebrow } from "@/components/ui";
import PatternsLibrary from "@/components/patterns/PatternsLibrary";

export const metadata: Metadata = {
  title: "Knihovna vzorů — co u vás funguje",
  description:
    "Knihovna osvědčených marketingových vzorů odvozených z vašich vlastních výsledků. Uložené vzory ladí AI vyhodnocení kampaní.",
};

export default function PatternsPage() {
  return (
    <Container className="py-10 sm:py-12">
      <div className="border-b border-line pb-8">
        <Eyebrow>Knihovna vzorů</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
          Co u vás funguje
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Osvědčené vzory automaticky odvozené z vašich kampaní a historie vyhodnocení — vítězné
          struktury, pasti na rozpočet i optimalizace, které zabraly. Připněte si je do knihovny;
          uložené vzory pak ladí AI vyhodnocení portfolia.
        </p>
      </div>

      <div className="mt-8">
        <PatternsLibrary />
      </div>
    </Container>
  );
}
