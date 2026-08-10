/** Illustrative saved-content entries for the public /dashboard demo — what the
 *  Uložený obsah library looks like once the Obsahový engine has produced work and
 *  the user kept it. Themed to the flagship demo e-shop (Mionelo, baby gear), in
 *  line with the content-engine sample clusters (spánek miminka, kojení, příkrmy).
 *
 *  Fixed timestamps only (the demo never reads a live clock — see lib/demo/projects'
 *  DEMO_TS) and typed as real {@link SavedContentEntry}s, so the demo renders the
 *  same shape the authed library stores. Framework-free. */
import type { SavedContentEntry } from "./entries";

/** Meta an entry generated in demo mode carries — honest about its provenance.
 *  `status: "success"` is not a boast: a deterministic fixture is structurally
 *  complete by construction, and leaving it absent would make the demo entries
 *  read as "health unknown", which is the state reserved for real entries saved
 *  before the health verdict was persisted. */
const DEMO_META = { model: "demo", demo: true, tookMs: 0, status: "success" } as const;

export const SAMPLE_CONTENT_ENTRIES: SavedContentEntry[] = [
  {
    id: "spanek-miminka-kompletni-pruvodce-demo1",
    kind: "article",
    title: "Spánek miminka: kompletní průvodce pro první rok",
    slug: "spanek-miminka-pruvodce",
    savedAt: "2025-12-28T09:15:00.000Z",
    form: {
      topic: "Spánek miminka v prvním roce",
      primaryKeyword: "spánek miminka",
      audience: "Rodiče novorozenců a kojenců",
      contentType: "blog",
    },
    brief: {
      titleTag: "Spánek miminka: průvodce prvním rokem | Mionelo",
      metaDescription:
        "Kolik spánku miminko potřebuje, jak zvládnout regresy a kdy řešit noční buzení. Kompletní průvodce prvním rokem.",
      h1: "Spánek miminka: kompletní průvodce pro první rok",
      slug: "spanek-miminka-pruvodce",
      outline: [
        { heading: "Kolik spánku miminko potřebuje", points: ["tabulka podle věku", "denní vs. noční spánek"] },
        { heading: "Spánkové regresy po měsících", points: ["4. měsíc", "8.–10. měsíc"] },
        { heading: "Večerní rutina, která funguje", points: ["koupel a krmení", "bílý šum"] },
      ],
      faq: [
        {
          question: "Kdy začne miminko spát celou noc?",
          answer: "Většina dětí prospí noc mezi 6. a 12. měsícem; tempo je individuální.",
        },
      ],
      keywords: ["spánek miminka", "spánkový regres", "večerní rutina"],
      internalLinks: ["/clanek/jak-uspat-novorozence", "/clanek/bily-sum-a-spanek"],
      rationale:
        "Pilíř klastru „spánek miminka“ (4 200 hledání/měs.) — spojuje podpůrné články a míří na rodiče v prvním roce.",
    },
    briefMeta: DEMO_META,
    draft: {
      blocks: [
        { type: "h2", id: "kolik-spanku", text: "Kolik spánku miminko potřebuje" },
        {
          type: "p",
          content: [
            "Novorozenec prospí 14–17 hodin denně, ale po krátkých úsecích. ",
            { text: "Klíčem je rytmus, ne rozvrh.", bold: true },
          ],
        },
        { type: "ul", items: [["0–3 měsíce: 14–17 h"], ["4–11 měsíců: 12–15 h"]] },
      ],
      faq: [{ q: "Kdy začne miminko spát celou noc?", a: ["Nejčastěji mezi 6. a 12. měsícem."] }],
    },
    draftMeta: DEMO_META,
  },
  {
    id: "jak-vybrat-autosedacku-demo2",
    kind: "brief",
    title: "Jak vybrat autosedačku podle věku dítěte",
    slug: "jak-vybrat-autosedacku",
    savedAt: "2025-12-19T14:40:00.000Z",
    form: {
      topic: "Výběr autosedačky podle věku a váhy",
      primaryKeyword: "jak vybrat autosedačku",
      audience: "Rodiče vybírající první autosedačku",
      contentType: "blog",
    },
    brief: {
      titleTag: "Jak vybrat autosedačku: podle věku i normy | Mionelo",
      metaDescription:
        "i-Size vs. starší normy, skupiny podle váhy a nejčastější chyby při výběru autosedačky.",
      h1: "Jak vybrat autosedačku podle věku dítěte",
      slug: "jak-vybrat-autosedacku",
      outline: [
        { heading: "Normy: i-Size a proč na ní záleží", points: ["ECE R129 vs. R44"] },
        { heading: "Skupiny podle váhy a věku", points: ["0–13 kg", "9–18 kg", "15–36 kg"] },
      ],
      faq: [],
      keywords: ["jak vybrat autosedačku", "i-size autosedačka"],
      internalLinks: ["/clanek/nejlepsi-kocarky"],
      rationale: "Obnova upadajícího evergreenu — návštěvnost −38 % meziročně, vysoký nákupní záměr.",
    },
    briefMeta: DEMO_META,
  },
  {
    id: "prikrmy-kdy-a-jak-zacit-demo3",
    kind: "brief",
    title: "Příkrmy: kdy a jak začít",
    slug: "prikrmy-kdy-a-jak-zacit",
    savedAt: "2025-12-05T08:05:00.000Z",
    form: {
      topic: "První příkrmy u kojenců",
      primaryKeyword: "příkrmy",
      audience: "Rodiče dětí kolem 6. měsíce",
      contentType: "blog",
    },
    brief: {
      titleTag: "Příkrmy: kdy a jak začít | Mionelo",
      metaDescription: "Známky připravenosti, první potraviny a metoda BLW krok za krokem.",
      h1: "Příkrmy: kdy a jak začít",
      slug: "prikrmy-kdy-a-jak-zacit",
      outline: [
        { heading: "Známky připravenosti dítěte", points: ["sed s oporou", "zájem o jídlo"] },
        { heading: "Klasické příkrmy vs. BLW", points: ["výhody a rizika obou cest"] },
      ],
      faq: [{ question: "Kdy začít s příkrmy?", answer: "Doporučuje se kolem ukončeného 6. měsíce." }],
      keywords: ["příkrmy", "BLW metoda"],
      internalLinks: ["/clanek/blw-metoda-krok-za-krokem"],
      rationale: "Pilíř klastru „příkrmy“ (2 600 hledání/měs.) zatím není publikovaný — nejrychlejší mezera.",
    },
    briefMeta: DEMO_META,
  },
];
