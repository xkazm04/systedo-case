/** THE CAPTIONS — six lines, one per scene, and nothing else.
 *
 *  P1 says copy is captions. Each block is a viewport tall so the film has room
 *  to play, the line sits low-left where a subtitle sits, and the mono index is
 *  the only ornament. The first block is the page's h1: the film's opening line
 *  is the headline, because there is no headline above the artefact (P3). */
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    c0: "Začíná to jednou adresou.",
    c0Sub: "Bez reklamního účtu, bez feedu, bez karty.",
    c1: "Adamant si web projde.",
    c1Sub: "Čím se firma zabývá, kde působí, jaká slova používá.",
    c2: "{channels} míst, kde se dá zviditelnit zdarma. Seřazených pro tenhle podnik.",
    c2Sub: "Velikost dlaždice je, jak dobře kanál sedí.",
    c3: "Připnete tři. Začnou mít stav.",
    c3Sub: "Nalezeno → naplánováno → běží → hotovo.",
    c4: "A pak čísla.",
    c4Sub: "Stejná, jaká vykreslí dashboard. Ukázkový klient, posledních 90 dní.",
    c5: "Odejdete s běžícím účtem.",
    c5Sub: "Během validace zdarma. Vaše modely, vaše data.",
    of: "z",
  },
  en: {
    c0: "It starts with an address.",
    c0Sub: "No ad account, no product feed, no card.",
    c1: "Adamant reads the site.",
    c1Sub: "What the business does, where it operates, the words it uses.",
    c2: "{channels} places to be found for free. Ranked for this business.",
    c2Sub: "A tile's size is how well the channel fits.",
    c3: "Pin three. They start holding state.",
    c3Sub: "Identified → planned → live → done.",
    c4: "Then the numbers.",
    c4Sub: "The same ones the dashboard renders. Demo client, last 90 days.",
    c5: "Leave with the account running.",
    c5Sub: "Free during validation. Your models, your data.",
    of: "of",
  },
} as const;

export const SCENES = 6;

export default async function StoryCaptions({ channels }: { channels: number }) {
  const t = await getT(T);
  const lines = [
    [t("c0"), t("c0Sub")],
    [t("c1"), t("c1Sub")],
    [t("c2", { channels: String(channels) }), t("c2Sub")],
    [t("c3"), t("c3Sub")],
    [t("c4"), t("c4Sub")],
    [t("c5"), t("c5Sub")],
  ] as const;

  return (
    <>
      {lines.map(([line, sub], i) => {
        const Heading = i === 0 ? "h1" : "h2";
        return (
          <div
            key={i}
            data-caption={i}
            className="flex min-h-[45svh] items-end sm:min-h-svh"
          >
            <div className="mx-auto w-full max-w-6xl px-4 pb-[7svh] sm:px-6 sm:pb-[14svh]">
              <p className="mb-3 font-mono text-[12px] tracking-[0.18em] text-brand-300">
                {String(i + 1).padStart(2, "0")} <span className="text-onyx-muted">{t("of")} 0{SCENES}</span>
              </p>
              <Heading className="max-w-2xl text-3xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:max-w-[27rem] lg:text-5xl">
                {line}
              </Heading>
              <p className="mt-3 max-w-md text-base text-onyx-muted sm:text-lg">{sub}</p>
            </div>
          </div>
        );
      })}
    </>
  );
}
