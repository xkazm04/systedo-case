/** Homepage FAQ — the four questions a first-time reader of this site actually
 *  has, answered with what is true today rather than with what would sell best.
 *
 *  The homepage had no FAQ at all (docs/ship/2026-08-28-kanaly-core-path.md §4).
 *  The reason to add one here is not SEO furniture: each of these four is a claim
 *  the rest of the site makes in passing and never substantiates — free during
 *  validation, bring your own model, a demo that needs no account or key, and a
 *  Czech-first product. Where an answer contains a fact the code owns, the fact is
 *  READ rather than typed: the free plan's price comes from the pricing catalogue,
 *  the model vendors from the BYOM vendor list, the locales from the i18n config.
 *  An answer that would go stale therefore breaks the build instead.
 *
 *  Rendered as the same native `<details>` accordion the walkthrough uses — no
 *  client JS — plus FAQPage JSON-LD through the shared escaping `JsonLd`. */
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import JsonLd from "@/components/JsonLd";
import { ChevronDown } from "@/components/icons";
import { BYOM_VENDORS, BYOM_VENDOR_LABELS } from "@/lib/llm/keys/types";
import { planPriceCzk } from "@/lib/plans";
import { SUPPORTED_LOCALES } from "@/lib/format";
import { getT, getServerFormatters } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

const T = {
  cs: {
    eyebrow: "Než se zeptáte",
    heading: "Čtyři otázky, na které se ptá skoro každý.",
    q1: "Kolik to stojí?",
    a1: "Během validace nic. Bezplatný plán je za {freePrice} a je v něm celý tok, ne osekaná verze; placené plány jsou zatím jen popsaný záměr a platební brána není napojená. Denní limity existují proto, aby chránily placená volání modelu, ne aby vás dotlačily k upgradu.",
    a1Link: "Co přesně je v bezplatném plánu",
    q2: "Můžu použít vlastní model?",
    a2: "Ano, a je to plnohodnotná cesta, ne ústupek: {vendors}. Volání obsloužené vaším klíčem se nezapočítává do našich limitů. Ollama běží u vás na stroji, takže text z ní neopustí váš počítač.",
    q3: "Musím se registrovat, abych to viděl?",
    a3: "Ne. Veřejná ukázka běží na fiktivním klientovi z pevných dat — bez účtu, bez klíče k modelu, bez připojeného reklamního účtu. Co je ukázkové, je tak i označené; nikde se netváříme, že jde o výsledky reálného zákazníka.",
    a3Link: "Otevřít živou ukázku",
    q4: "Je to celé česky?",
    a4: "Čeština je zdrojový jazyk, ne dodatečný překlad: texty se píšou česky a {locales} jazyky rozhraní z nich vycházejí. Kanály, katalogy a porovnávače v plánu viditelnosti jsou vybrané pro český trh — proto tam je Firmy.cz a Zboží.cz, a ne jejich americké protějšky.",
  },
  en: {
    eyebrow: "Before you ask",
    heading: "Four questions almost everybody has.",
    q1: "What does it cost?",
    a1: "Nothing during validation. The free plan is {freePrice} and carries the whole flow rather than a cut-down version; the paid plans are documented intent so far and no payment gateway is wired up. The daily limits exist to protect paid model calls, not to push you into an upgrade.",
    a1Link: "Exactly what the free plan covers",
    q2: "Can I use my own model?",
    a2: "Yes, and it is a first-class path rather than a concession: {vendors}. A call served by your key is not counted against our limits. Ollama runs on your own machine, so its text never leaves your computer.",
    q3: "Do I have to sign up to see it?",
    a3: "No. The public demo runs on a fictional client built from fixed data — no account, no model key, no connected ad account. Whatever is demo data is labelled as demo data; nothing here is dressed up as a real customer's results.",
    a3Link: "Open the live demo",
    q4: "Is the whole thing in Czech?",
    a4: "Czech is the source language, not an afterthought translation: copy is written in Czech and the {locales} interface languages derive from it. The channels, directories and marketplaces in a visibility plan are picked for the Czech market — which is why Firmy.cz and Zboží.cz are in there instead of their American counterparts.",
  },
} as const;

export default async function LandingFaq() {
  const t = await getT(T);
  const fmt = await getServerFormatters();
  const locale = await getServerLocale();

  // Facts the code owns, read rather than retyped.
  const freePrice = fmt.fmtCZK(planPriceCzk("free"));
  const vendors = BYOM_VENDORS.map((v) => BYOM_VENDOR_LABELS[locale][v]).join(", ");
  const locales = String(SUPPORTED_LOCALES.length);

  const items = [
    { id: "cena", q: t("q1"), a: t("a1", { freePrice }), href: "/cena", cta: t("a1Link") },
    { id: "vlastni-model", q: t("q2"), a: t("a2", { vendors }) },
    { id: "ukazka", q: t("q3"), a: t("a3"), href: "/dashboard", cta: t("a3Link") },
    { id: "cesky", q: t("q4"), a: t("a4", { locales }) },
  ];

  return (
    <section id="faq" className="reveal-on-scroll border-b border-line bg-brand-50/30">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: items.map((i) => ({
            "@type": "Question",
            name: i.q,
            acceptedAnswer: { "@type": "Answer", text: i.a },
          })),
        }}
      />
      <Container className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
            {t("heading")}
          </h2>
        </div>

        <div className="mt-9 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          {items.map((item) => (
            <details
              key={item.id}
              id={`faq-${item.id}`}
              className="group border-b border-line last:border-b-0"
            >
              <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 hover:bg-brand-50/40 marker:content-none">
                <h3 className="flex-1 text-base font-semibold tracking-tight text-navy-800">
                  {item.q}
                </h3>
                <ChevronDown
                  width={17}
                  height={17}
                  aria-hidden
                  className="shrink-0 text-muted transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="px-5 pb-5">
                <p className="max-w-3xl text-sm leading-relaxed text-muted">{item.a}</p>
                {item.href && (
                  <Link
                    href={item.href}
                    className="mt-3 inline-block text-sm font-semibold text-brand-accent underline decoration-line underline-offset-4 transition-colors hover:text-brand-800"
                  >
                    {item.cta}
                  </Link>
                )}
              </div>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
