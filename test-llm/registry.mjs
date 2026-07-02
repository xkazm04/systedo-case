/** Registry of LLM "tools" — one entry per place the app uses the wrapper.
 *
 *  Each id MUST match a `// llm-tool: <id>` tag at a real `generateStructured`
 *  call site in src/ (enforced by coverage.test.mjs / the gate). Each entry is a
 *  self-contained fixture that exercises the REAL wrapper (→ real Claude in dev)
 *  with a schema mirroring that tool's shape, plus a lenient validator.
 *
 *  Keeping fixtures here (rather than importing the app's tool modules) avoids
 *  pulling the data/JSON graph into the test runner and keeps each probe small
 *  and fast, while the coverage check guarantees the fixtures stay in 1:1 sync
 *  with the actual call sites.
 *
 *  `tier: "fast"` mirrors call sites that opt into the light model tier
 *  (src/lib/llm/models.ts) — the real test then proves the tool on the model it
 *  actually runs (haiku-class in dev) instead of only the quality tier.
 */
import { Type } from "@google/genai";

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isStrArr = (v, min = 1) => Array.isArray(v) && v.filter(isStr).length >= min;
const num = (v) => (typeof v === "number" ? v : Number(v));

export const LLM_TOOLS = [
  {
    id: "ads",
    label: "PPC inzeráty",
    system:
      "Jsi český PPC specialista. Piš česky, dodržuj limity znaků a vracej pouze validní JSON dle schématu.",
    prompt:
      "Vytvoř krátkou sadu PPC inzerátů pro e-shop s ořechy a semínky. Vrať 3 nadpisy (do 30 znaků), 2 popisky (do 90 znaků) a krátké zdůvodnění.",
    schema: {
      type: Type.OBJECT,
      properties: {
        headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
        descriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
        rationale: { type: Type.STRING },
      },
      required: ["headlines", "descriptions", "rationale"],
    },
    validate: (r) => r && isStrArr(r.headlines, 2) && isStrArr(r.descriptions, 1) && isStr(r.rationale),
  },
  {
    id: "brief",
    label: "SEO obsahový brief",
    system:
      "Jsi český SEO stratég. Piš česky, dodržuj SEO limity a vracej pouze validní JSON dle schématu.",
    prompt:
      "Připrav stručný SEO brief pro článek o skladování ořechů. Vrať title tag (do 60 znaků), meta description (do 155 znaků) a osnovu 2–3 sekcí, každá s odrážkami.",
    schema: {
      type: Type.OBJECT,
      properties: {
        titleTag: { type: Type.STRING },
        metaDescription: { type: Type.STRING },
        outline: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING },
              points: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["heading", "points"],
          },
        },
      },
      required: ["titleTag", "metaDescription", "outline"],
    },
    validate: (r) =>
      r &&
      isStr(r.titleTag) &&
      isStr(r.metaDescription) &&
      Array.isArray(r.outline) &&
      r.outline.length >= 1 &&
      isStr(r.outline[0]?.heading),
  },
  {
    id: "analysis",
    label: "Analýza výkonu",
    system:
      "Jsi český specialista na výkonnostní marketing. Vycházej jen z předaných čísel a vracej pouze validní JSON dle schématu.",
    prompt:
      "Data: obrat 1 200 000 Kč, náklady 220 000 Kč, PNO 18,3 %, ROAS 5,4×. Vrať jednovětý verdikt, krátké shrnutí a 2 doporučené kroky (title + detail).",
    schema: {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING },
        summary: { type: Type.STRING },
        actions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { title: { type: Type.STRING }, detail: { type: Type.STRING } },
            required: ["title", "detail"],
          },
        },
      },
      required: ["headline", "summary", "actions"],
    },
    validate: (r) =>
      r && isStr(r.headline) && isStr(r.summary) && Array.isArray(r.actions) && isStr(r.actions[0]?.title),
  },
  {
    id: "campaign-eval",
    label: "Vyhodnocení kampaně / portfolia",
    system:
      "Jsi český PPC stratég. Vyhodnoť kampaň podle předaných čísel a vrať pouze validní JSON dle schématu.",
    prompt:
      "Kampaň „Search · Brand“: náklady 55 000 Kč, hodnota konverzí 1 030 000 Kč, ROAS 18,9×, PNO 5,3 %. Cíl PNO 18 %. Vrať skóre 0–100, jednovětý verdikt a 2 doporučení (title, detail, priority high|medium|low).",
    schema: {
      type: Type.OBJECT,
      properties: {
        verdict: { type: Type.STRING },
        score: { type: Type.NUMBER },
        recommendations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              detail: { type: Type.STRING },
              priority: { type: Type.STRING },
            },
            required: ["title", "detail", "priority"],
          },
        },
      },
      required: ["verdict", "score", "recommendations"],
    },
    validate: (r) => {
      if (!r || !isStr(r.verdict)) return false;
      const s = num(r.score);
      if (!Number.isFinite(s) || s < 0 || s > 100) return false;
      return Array.isArray(r.recommendations) && isStr(r.recommendations[0]?.title);
    },
  },
  {
    id: "social",
    label: "Příspěvky na sociální sítě",
    system:
      "Jsi český social media copywriter pro e-shop s ořechy a semínky. Přizpůsob styl platformě, piš česky a vracej pouze validní JSON dle schématu.",
    prompt:
      "Napiš příspěvky na sociální sítě na téma nová sezónní směs ořechů pro platformy instagram a facebook. Vrať pole posts, kde každý objekt má pole platform (instagram nebo facebook) a pole content.",
    schema: {
      type: Type.OBJECT,
      properties: {
        posts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              platform: { type: Type.STRING },
              content: { type: Type.STRING },
            },
            required: ["platform", "content"],
          },
        },
      },
      required: ["posts"],
    },
    validate: (r) =>
      r && Array.isArray(r.posts) && r.posts.length >= 1 && isStr(r.posts[0]?.platform) && isStr(r.posts[0]?.content),
  },
  {
    id: "lead-reply",
    tier: "fast",
    label: "Rychlá reakce na poptávku",
    system:
      "Jsi český obchodník specializovaný na rychlou reakci na poptávky. Piš česky, lidsky a profesionálně a vracej pouze validní JSON dle schématu.",
    prompt:
      "Napiš první on-brand odpověď na poptávku. Kanál: Formulář. Typ zakázky: revize elektroinstalace. Zpráva od leadu: „Dobrý den, potřebovali bychom revizi elektroinstalace v kanceláři (cca 200 m²). Kdy máte volno?“ Vrať pole reply (celá odpověď k odeslání) a pole questions (2–3 kvalifikační otázky).",
    schema: {
      type: Type.OBJECT,
      properties: {
        reply: { type: Type.STRING },
        questions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["reply", "questions"],
    },
    validate: (r) => r && isStr(r.reply) && isStrArr(r.questions, 1),
  },
  {
    id: "repurpose",
    tier: "fast",
    label: "Přepracování článku do kanálů",
    system:
      "Jsi český obsahový stratég a copywriter. Z jednoho zdrojového článku připravuješ varianty na míru pro jednotlivé distribuční kanály. Piš česky, dodržuj limity znaků a vracej pouze validní JSON dle schématu.",
    prompt:
      "Přepracuj zdrojový článek do variant pro kanály LinkedIn a Instagram. Název článku: „Skladování ořechů: jak je udržet čerstvé“. Tón: Přátelský a lidský. Vrať pole variants, kde každý objekt má pole channel (LinkedIn nebo Instagram) a pole text (text varianty pro daný kanál).",
    schema: {
      type: Type.OBJECT,
      properties: {
        variants: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              channel: { type: Type.STRING },
              text: { type: Type.STRING },
            },
            required: ["channel", "text"],
          },
        },
      },
      required: ["variants"],
    },
    // Lenient: at least one variant, with a non-empty channel + non-empty text.
    validate: (r) =>
      r &&
      Array.isArray(r.variants) &&
      r.variants.length >= 1 &&
      isStr(r.variants[0]?.channel) &&
      isStr(r.variants[0]?.text),
  },
  {
    id: "local-review-reply",
    tier: "fast",
    label: "Odpověď na recenzi",
    system:
      "Jsi český správce reputace lokální firmy. Píšeš veřejné odpovědi na recenze v Google firemním profilu — vřele děkuješ za dobrá hodnocení a s pochopením reaguješ na kritiku. Piš česky a vracej pouze validní JSON dle schématu.",
    prompt:
      "Napiš veřejnou odpověď na recenzi v Google firemním profilu. Lokalita: Ostrava. Typ podnikání: montáž a servis klimatizací. Hodnocení: 2 z 5 hvězd. Text recenze: „Technik přijel o dvě hodiny později a nezavolal předem. Oprava nakonec dopadla v pořádku, ale komunikace vázla.“ Jde o kritickou recenzi — uznej zkušenost zákazníka, omluv se a nabídni vyřešení mimo veřejné vlákno. Vrať pole reply (celá veřejná odpověď k publikaci).",
    schema: {
      type: Type.OBJECT,
      properties: {
        reply: { type: Type.STRING },
      },
      required: ["reply"],
    },
    // Lenient: a single non-empty Czech reply string.
    validate: (r) => r && isStr(r.reply),
  },
  {
    id: "article-draft",
    label: "Rozepsání briefu do článku",
    system:
      "Jsi český obsahový stratég a copywriter. Z hotového SEO briefu rozepisuješ plnohodnotný koncept článku jako sekvenci typovaných bloků. Piš česky a vracej pouze validní JSON dle schématu.",
    prompt:
      "Rozepiš tento brief do STRUČNÉHO konceptu článku (krátké odstavce, max ~10 bloků). Titulek: „Skladování ořechů: jak je udržet čerstvé“. Meta description: „Praktický návod, jak skladovat ořechy a semínka, aby vydržely déle čerstvé.“ Osnova: ## Proč na skladování záleží (- žluknutí, - vlhkost); ## Jak ořechy skladovat (- chlad a tma, - vzduchotěsné nádoby). Vrať pole blocks, kde každý blok je objekt s polem type (jedno z: p, h2, h3, ul, ol, callout, cta) a podle typu poli text, items (pole řetězců), variant, title nebo cta. Vrať také pole faq (objekty question + answer). Vrať POUZE jeden JSON objekt.",
    schema: {
      type: Type.OBJECT,
      properties: {
        blocks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              text: { type: Type.STRING },
              items: { type: Type.ARRAY, items: { type: Type.STRING } },
              variant: { type: Type.STRING },
              title: { type: Type.STRING },
              cta: { type: Type.STRING },
            },
            required: ["type"],
          },
        },
        faq: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING },
            },
            required: ["question", "answer"],
          },
        },
      },
      required: ["blocks", "faq"],
    },
    // Lenient/structural: assert the tool's real contract — it keeps well-formed
    // blocks and drops the rest (the production normalize needs ≥1). So require a
    // non-empty body with at least a few blocks that map cleanly onto the typed
    // Block union, rather than demanding EVERY block be perfect: a single
    // off-shape block (an unrecognised `type`, or a `cta` carrying text only in
    // its button field) is dropped in production and must not fail this test —
    // a strict every() did exactly that intermittently under model variance.
    validate: (r) => {
      if (!r || !Array.isArray(r.blocks) || r.blocks.length === 0) return false;
      const KINDS = new Set(["p", "h2", "h3", "ul", "ol", "callout", "cta"]);
      const wellFormed = (b) => {
        if (!b || typeof b !== "object") return false;
        const t = typeof b.type === "string" ? b.type.toLowerCase() : "";
        if (!KINDS.has(t)) return false;
        if (t === "ul" || t === "ol") return isStrArr(b.items, 1);
        return isStr(b.text);
      };
      const valid = r.blocks.filter(wellFormed).length;
      return valid >= 3;
    },
  },
  {
    id: "cohort-diagnosis",
    label: "Diagnostika kohort (CAC → LTV)",
    system:
      "Jsi český analytik jednotkové ekonomiky (CAC, LTV, návratnost). Děláš stručnou diagnostiku akvizičních kohort. Vycházej jen z předaných čísel, nevymýšlej žádné hodnoty a vracej pouze validní JSON dle schématu.",
    prompt:
      "Reálná data kohort (od nejstarší): 2025-01: CAC 1 200 Kč, LTV 5 400 Kč, LTV:CAC 4,5×, návratnost 4 měs., M3 retence 62 %, 180 registrací. 2025-02: CAC 1 600 Kč, LTV 3 800 Kč, LTV:CAC 2,4×, návratnost 7 měs., M3 retence 48 %, 210 registrací. 2025-03: CAC 2 100 Kč, LTV 2 200 Kč, LTV:CAC 1,0×, návratnost > horizont (nevrací se), M3 retence 31 %, 240 registrací. Souhrn: blended CAC 1 650 Kč, průměrné LTV:CAC 2,6×. Povolené názvy kohort pro „worstCohort“: 2025-01, 2025-02, 2025-03. Urči nejproblematičtější kohortu a jednu nejúčinnější páku. Vrať pole summary (krátký odstavec), worstCohort (přesný název kohorty z dat) a recommendation (jedno konkrétní doporučení).",
    schema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        worstCohort: { type: Type.STRING },
        recommendation: { type: Type.STRING },
        risks: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["summary", "worstCohort", "recommendation"],
    },
    // Lenient: non-empty summary + recommendation, and worstCohort must be one of
    // the cohort labels supplied in the prompt (the model can't invent a cohort).
    validate: (r) => {
      if (!r || !isStr(r.summary) || !isStr(r.recommendation) || !isStr(r.worstCohort)) return false;
      const LABELS = new Set(["2025-01", "2025-02", "2025-03"]);
      return LABELS.has(r.worstCohort.trim());
    },
  },
  {
    id: "keyword-clusters",
    tier: "fast",
    label: "Seskupení klíčových slov do klastrů",
    system:
      "Jsi český SEO stratég. Z plochého seznamu klíčových slov skládáš tematické klastry (pilíř + podpůrná slova). Pracuj jen s předanými slovy, žádné si nevymýšlej, a vracej pouze validní JSON dle schématu.",
    prompt:
      "Seskup tato klíčová slova do tematických klastrů (pilíř + podpůrná slova). Hlavní téma: ořechy. Klíčová slova (hledanost za měsíc): vlašské ořechy (2400/měs), vlašské ořechy cena (900/měs), vlašské ořechy zdraví (600/měs), mandle (1800/měs), mandle cena (700/měs), mandle pražené (400/měs). Vrať pole clusters, kde každý klastr je objekt s polem topic (název tématu), pillar (jedno hlavní slovo z předaného seznamu) a supporting (pole zbývajících slov klastru ze seznamu). Použij POUZE slova z uvedeného seznamu, doslova.",
    schema: {
      type: Type.OBJECT,
      properties: {
        clusters: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              intent: { type: Type.STRING },
              pillar: { type: Type.STRING },
              supporting: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["topic", "pillar", "supporting"],
          },
        },
      },
      required: ["clusters"],
    },
    // Lenient: at least one cluster, each with a topic and a pillar that is one of
    // the keywords supplied in the prompt (the model can't invent a keyword).
    validate: (r) => {
      if (!r || !Array.isArray(r.clusters) || r.clusters.length === 0) return false;
      const INPUT = new Set(
        [
          "vlašské ořechy",
          "vlašské ořechy cena",
          "vlašské ořechy zdraví",
          "mandle",
          "mandle cena",
          "mandle pražené",
        ].map((k) => k.toLowerCase())
      );
      return r.clusters.every(
        (c) =>
          c &&
          typeof c === "object" &&
          isStr(c.topic) &&
          isStr(c.pillar) &&
          INPUT.has(c.pillar.trim().toLowerCase()) &&
          Array.isArray(c.supporting)
      );
    },
  },
  {
    id: "comparison-outline",
    label: "Kostra srovnávací stránky",
    system:
      "Jsi český SEO obsahový stratég pro srovnávací stránky s vysokým nákupním záměrem (X vs Y, alternativy, ceník, recenze). Z jednoho cílového dotazu připravuješ kostru srovnávací stránky připravenou k publikaci, ne obecný brief. Nemáš konkrétní data o konkurentech — drž obsah obecný a doplnitelný. Piš česky a vracej pouze validní JSON dle schématu.",
    prompt:
      "Připrav kostru srovnávací stránky pro cílový dotaz „monday.com vs trello“. Záměr dotazu: Srovnání (vs). Měsíční hledanost: 880. Vrať h1 (nadpis stránky), sections (4–7 sekcí, každá objekt heading + points jako pole odrážek), comparisonCriteria (4–8 kritérií pro porovnání), verdict (1–2 věty shrnujícího doporučení) a faq (3–5 dotazů, každý objekt q + a). Žádná konkrétní konkurenční data nemáš — drž obsah obecný a doplnitelný redaktorem. Vrať POUZE jeden JSON objekt.",
    schema: {
      type: Type.OBJECT,
      properties: {
        h1: { type: Type.STRING },
        sections: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              heading: { type: Type.STRING },
              points: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["heading", "points"],
          },
        },
        comparisonCriteria: { type: Type.ARRAY, items: { type: Type.STRING } },
        verdict: { type: Type.STRING },
        faq: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              q: { type: Type.STRING },
              a: { type: Type.STRING },
            },
            required: ["q", "a"],
          },
        },
      },
      required: ["h1", "sections", "comparisonCriteria", "verdict", "faq"],
    },
    // Lenient/structural: a non-empty h1, at least one section (with a heading),
    // and at least one FAQ entry (with a question + answer).
    validate: (r) => {
      if (!r || !isStr(r.h1)) return false;
      if (!Array.isArray(r.sections) || r.sections.length === 0) return false;
      if (!isStr(r.sections[0]?.heading)) return false;
      if (!Array.isArray(r.faq) || r.faq.length === 0) return false;
      return isStr(r.faq[0]?.q) && isStr(r.faq[0]?.a);
    },
  },
  {
    id: "lp-variant-ideas",
    label: "Návrh variant landing page",
    system:
      "Jsi český CRO specialista a copywriter pro landing pages. Z tématu a klíčových slov navrhuješ konkurenční varianty (challengery) pro A/B test proti kontrolní variantě. Každá varianta testuje jinou hypotézu a liší se od kontroly. Nevymýšlej žádná čísla. Piš česky a vracej pouze validní JSON dle schématu.",
    prompt:
      "Navrhni konkurenční varianty (challengery) landing page pro A/B test. Téma / klastr: projektové řízení nástroj. Klíčová slova: projektové řízení, řízení projektů software, nástroj na úkoly. Stávající kontrolní varianta: A · Kontrola (obecný popis produktu), konverzní poměr 2,1 %. Dosavadní poražené varianty (čeho se vyvarovat): B · Sleva 20 % (konverze 1,4 %); C · Dlouhý formulář (konverze 1,1 %). Vrať pole variants se 2–3 odlišnými koncepty, kde každý koncept je objekt s polem label (název konceptu), hypothesis (testovatelná hypotéza), headline (návrh hlavního nadpisu), primaryCTA (text hlavního tlačítka) a rationale (jednou větou proč koncept dává smysl). Každá varianta ať testuje jinou hypotézu, liší se od kontroly i od dosavadních poražených variant a snaží se překonat konverzní poměr kontroly. Nevymýšlej žádná čísla. Vrať POUZE jeden JSON objekt.",
    schema: {
      type: Type.OBJECT,
      properties: {
        variants: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              hypothesis: { type: Type.STRING },
              headline: { type: Type.STRING },
              primaryCTA: { type: Type.STRING },
              rationale: { type: Type.STRING },
            },
            required: ["label", "hypothesis", "headline", "primaryCTA", "rationale"],
          },
        },
      },
      required: ["variants"],
    },
    // Lenient: at least one challenger concept, with a non-empty label + a
    // non-empty hypothesis (the two fields the production normalize requires).
    validate: (r) =>
      r &&
      Array.isArray(r.variants) &&
      r.variants.length >= 1 &&
      isStr(r.variants[0]?.label) &&
      isStr(r.variants[0]?.hypothesis),
  },
  {
    id: "lead-source-diagnosis",
    label: "Diagnostika zdroje leadů",
    system:
      "Jsi český analytik kvality leadů. Diagnostikuješ JEDEN podvýkonný zdroj leadů. Vycházej jen z předaných čísel, nevymýšlej žádné hodnoty a vracej pouze validní JSON dle schématu.",
    prompt:
      "Reálná data jednoho zdroje leadů. Zdroj: Meta lead formuláře. Leadů celkem: 540. Z toho kvalifikovaných (SQL): 130 (míra kvalifikace 24,1 %). Z toho uzavřených (won): 14 (win rate 10,8 %). Náklady (spend): 96 000 Kč. CPL (cena za lead): 178 Kč. CPQL (cena za kvalifikovaný lead): 738 Kč. Pro srovnání ostatní zdroje (od nejvýkonnějšího): Google Search — míra kvalifikace 41,0 %, win rate 19,2 %, CPQL 392 Kč; Doporučení (referral) — míra kvalifikace 55,0 %, win rate 24,0 %, CPQL 210 Kč. Povolené hodnoty pole „likelyCause“: spam, mis-targeting, pricing, volume, ok. Urči nejpravděpodobnější příčinu, proč je zdroj podvýkonný, a jednu konkrétní akci; v doporučení pojmenuj konkrétní výkonnější zdroj podle jeho čísel. Vrať summary (krátký odstavec), likelyCause (jedna z povolených hodnot) a recommendation (jedno konkrétní doporučení).",
    schema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        likelyCause: { type: Type.STRING },
        recommendation: { type: Type.STRING },
        severity: { type: Type.STRING },
      },
      required: ["summary", "likelyCause", "recommendation"],
    },
    // Lenient: non-empty summary + recommendation, plus a non-empty likelyCause
    // string. likelyCause is COERCED to a known cause in production (unknowns map
    // to a default, never a hard fail), so we only assert it is present — not that
    // it is one specific label, which would flake under model variance.
    validate: (r) =>
      r && isStr(r.summary) && isStr(r.recommendation) && isStr(r.likelyCause),
  },
];
