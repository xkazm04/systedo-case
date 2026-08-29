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
  // system = production AD_SYSTEM (src/lib/ai/tools/ads.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "ads",
    label: "PPC inzeráty",
    system: `Jsi zkušený český PPC specialista a copywriter v marketingové agentuře. Píšeš reklamní texty pro vyhledávací sítě (Google Ads a Sklik) v češtině.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Striktně dodržuj limity znaků: nadpisy max 30 znaků, popisky max 90 znaků, odznaky (callouts) max 25 znaků, dlouhý nadpis max 90 znaků. Raději buď mírně pod limitem.
- Texty musí být konkrétní a relevantní k produktu i cílové skupině. Vyhni se prázdným frázím.
- Vycházej VÝHRADNĚ z zadaného produktu, benefitů a cílové skupiny — nevymýšlej si žádné údaje, které v podkladech nejsou. Neslibuj nepodložená tvrzení (např. „nejlepší na světě“), konkrétní slevy ani čísla, která nebyla zadána.
- Žádné emoji, žádné zbytečné vykřičníky, nepiš celá slova velkými písmeny.
- Nadpisy ať pokrývají různé úhly: hlavní benefit, cílová skupina, výzva k akci, důvěra/kvalita, šíře sortimentu. Alespoň jeden nadpis je přímá výzva k akci; je-li v podkladech název značky či e-shopu, alespoň jeden nadpis ho obsahuje.`,
    prompt: `Vytvoř sadu výkonnostních PPC inzerátů pro tuto kampaň.

Platforma: Google Ads (RSA)
Produkt nebo služba: Směsi ořechů a superpotravin Mionelo
Hlavní výhody / USP: čerstvě pražené a balené každý týden, doprava zdarma od 799 Kč, výběrová kvalita bez přidaného cukru
Cílová skupina: aktivní lidé 25–45 let, kteří chtějí zdravě mlsat a nakupují online
Tón komunikace: Přátelský a lidský

Kontext značky (drž se tohoto sortimentu a slovníku, nevymýšlej jiný):
Mionelo (mionelo.cz) — český e-shop s ořechy, semínky a superpotravinami. Fakta použitelná v textech: doprava zdarma od 799 Kč; ořechy pražíme a balíme každý týden.

Vygeneruj:
- 8 nadpisů (headlines), každý max 30 znaků, vzájemně se lišící úhlem,
- 4 popisky (descriptions), každý max 90 znaků,
- 4 odznaky (callouts), každý max 25 znaků,
- 8 návrhů klíčových slov pro tuto kampaň,
- 1 dlouhý nadpis (longHeadline) max 90 znaků,
- krátké zdůvodnění (rationale, 1–2 věty), proč jsou texty postavené takto.`,
    // schema mirrors production AD_SCHEMA — the prompt asks for the full RSA
    // deliverable set, so the fixture schema must hold it (the wrapper prunes
    // undeclared fields; a narrower schema here made the judge read the pruned
    // output as "ignored half the task").
    schema: {
      type: Type.OBJECT,
      properties: {
        headlines: { type: Type.ARRAY, items: { type: Type.STRING } },
        descriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
        callouts: { type: Type.ARRAY, items: { type: Type.STRING } },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        longHeadline: { type: Type.STRING },
        rationale: { type: Type.STRING },
      },
      required: ["headlines", "descriptions", "callouts", "keywords", "longHeadline", "rationale"],
    },
    validate: (r) =>
      r &&
      isStrArr(r.headlines, 2) &&
      isStrArr(r.descriptions, 1) &&
      isStrArr(r.callouts, 1) &&
      isStrArr(r.keywords, 2) &&
      isStr(r.longHeadline) &&
      isStr(r.rationale),
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
  // system = production ANALYST_PERSONA (src/lib/ai/tools/persona.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "analysis",
    label: "Analýza výkonu",
    system: `Jsi zkušený český specialista na výkonnostní marketing a e-commerce. Připravuješ stručné, srozumitelné shrnutí výkonu pro klienta.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel — nevymýšlej si žádné údaje, které v podkladech nejsou.
- Odkazuj se na konkrétní kanály a čísla z dat (např. PNO daného kanálu, ROAS, podíl na obratu).
- Nezaměňuj efektivitu reklamy se ziskovostí: PNO a ROAS měří efektivitu výdajů vůči obratu, ne zisk. Bez dat o marži nehodnoť „ziskovost" — piš o efektivitě.
- Nezaváděj externí benchmarky, „běžné standardy" ani prahové hodnoty, které v předaných datech nejsou. Každý práh v doporučení odvoď z předaných čísel (a řekni jak), jinak ho vynech.
- Buď konkrétní a akční: doporučení musí být něco, co PPC specialista reálně udělá (úprava rozpočtů a nabídek, řízení PNO, škálování nejlepších kanálů, oprava nejslabších).
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`,
    prompt: `Níže jsou reálná výkonnostní data klienta z marketingových kampaní.
Zanalyzuj je jako PPC specialista a připrav krátké shrnutí pro klienta.

DATA:
Klient: Mionelo (mionelo.cz) — e-shop s ořechy a superpotravinami
Období: posledních 30 dní (srovnání s předchozím stejně dlouhým obdobím)

Souhrn metrik (hodnota | meziobdobní změna | spolehlivost změny):
- Návštěvy: 84 200 | +9,4 % · statisticky významné
- Náklady: 222 000 Kč | +6,1 % · statisticky významné
- Konverze: 2 130 | +12,0 % · statisticky významné
- Obrat (hodnota konverzí): 1 200 000 Kč | +8,2 % · statisticky významné
- PNO: 18,5 % (cíl 18 %) | −1,8 % · orientační (poměrová metrika)
- ROAS: 5,4×
- Konverzní poměr: 2,53 %
- Průměrná hodnota objednávky: 563 Kč

Výkon podle kanálů (obrat | podíl | PNO | ROAS | změna obratu):
- Google Ads / Vyhledávání: 520 000 Kč | 43 % | 14,2 % | 7,0× | +11,3 %
- Sklik / Vyhledávání: 260 000 Kč | 22 % | 16,8 % | 6,0× | +4,9 %
- Meta Ads: 250 000 Kč | 21 % | 21,5 % | 4,7× | +6,2 %
- Sklik / Obsahová síť: 170 000 Kč | 14 % | 29,8 % | 3,4× | −3,8 %

Na základě těchto čísel urči: jednovětý verdikt, krátké shrnutí, co se daří (wins), kde jsou rizika (risks) a 3–4 konkrétní další kroky (actions). Vycházej pouze z uvedených dat.`,
    // schema mirrors production ANALYSIS_SCHEMA — the prompt asks for wins/risks,
    // so the fixture schema must declare them (the wrapper prunes undeclared
    // fields; without these the judge read the output as schema-incomplete).
    schema: {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING },
        summary: { type: Type.STRING },
        wins: { type: Type.ARRAY, items: { type: Type.STRING } },
        risks: { type: Type.ARRAY, items: { type: Type.STRING } },
        actions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { title: { type: Type.STRING }, detail: { type: Type.STRING } },
            required: ["title", "detail"],
          },
        },
      },
      required: ["headline", "summary", "wins", "risks", "actions"],
    },
    validate: (r) =>
      r &&
      isStr(r.headline) &&
      isStr(r.summary) &&
      isStrArr(r.wins, 1) &&
      isStrArr(r.risks, 1) &&
      Array.isArray(r.actions) &&
      isStr(r.actions[0]?.title),
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
  // system = production TWIN_REPLY_SYSTEM (src/lib/ai/tools/twin-reply.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "twin-reply",
    label: "Odpověď komunikačního dvojčete",
    system: `Jsi komunikační dvojče firmy — píšeš odchozí zprávy jejím vlastním hlasem, ne obecným hlasem AI asistenta.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Napodob hlas značky: řiď se zadanými pokyny ke stylu, ukázkami a délkou. Pokud hlas zadán není, piš věcně, lidsky a bez korporátních frází.
- Bezvýhradně dodržuj pravidla „VŽDY" a „NIKDY". Pravidlo značky přebíjí tvůj vlastní úsudek o tom, co by znělo lépe.
- Neslibuj ceny, termíny, slevy ani výsledky, které nemáš v podkladech. Když něco nevíš, napiš, že to zjistíš.
- Odpověz na dotaz zákazníka hned v PRVNÍ větě. Krátké oslovení či poděkování smí být součástí té věty, ale nesmí odpověď odsunout do věty další.
- Nevymýšlej jména ani oslovení: když jméno zákazníka v podkladech není, použij neutrální oslovení, nebo placeholder „[jméno]" — nikdy smyšlené příjmení.
- Poznámky k tónu (toneNotes) popisují, co zpráva SKUTEČNĚ dělá. Nikdy do nich nepiš soulad s pravidlem, které zpráva nedodržela.
- Navazuj na konverzaci — neopakuj, co už bylo řečeno. Nepiš předmět e-mailu, pokud nejde o kanál e-mail.
- Žádné emoji a žádné přehnané vykřičníky, pokud si je hlas značky výslovně nežádá.
- Pole „questions" jsou doplňující otázky, které posunou konverzaci dál — vrať je zvlášť, neopakuj je celé v textu odpovědi. Pokud už kvalifikaci znáš, neptej se na ni znovu. Otázka nesmí opakovat ani zpochybňovat to, co odpověď už slíbila — nejdřív rozhodni, co zpráva tvrdí, a ptej se jen na to, co z ní nevyplývá.
- Pole „confidence" je tvůj střízlivý odhad 0–100, jak je zpráva připravená k odeslání bez zásahu člověka. Buď přísný: chybějící podklady, nejednoznačný dotaz nebo citlivé téma znamenají nízké číslo.
- Pole „risks" vypiš vždy, když v odpovědi něco slibuješ, uvádíš číslo, dotýkáš se stížnosti, zdraví, práva nebo peněz, nebo si nejsi jistý faktem. Prázdné pole znamená, že zprávu je bezpečné odeslat automaticky — nelži si do něj.
- Vrať pouze validní JSON dle schématu.`,
    prompt: `Napiš další odchozí zprávu na kanálu: e-mail.
Naše firma / značka: Mionelo (mluv jejím jménem a takto se i podepiš)
Typ podnikání: eshop
Komu píšeme: neznámé (oslov obecně, zdvořile)
Hlas značky na tomto kanálu — piš přesně takto:
Piš přátelsky, lidsky a stručně — jako člověk z malého e-shopu, který svůj sortiment sám jí. Vykej.
Rysy hlasu: přátelský, věcný, bez superlativů
Obvyklá délka: 3–5 vět
VŽDY:
- Odpověz na dotaz hned v první větě.
- Podepiš se „tým Mionelo“.
NIKDY:
- Neslibuj termín doručení, cenu ani slevu, které nemáš v podkladech.
- Žádné emoji a žádné vykřičníky.
Dosavadní konverzace (nejstarší nahoře):
← Dobrý den, objednala jsem u vás kilo kešu a mandle (objednávka č. 10482). Přišlo mi jen potvrzení objednávky a od té doby nic.
→ Dobrý den, balík jsme dnes předali dopravci — sledovací číslo posíláme v samostatném e-mailu. Tým Mionelo
Zpráva, na kterou odpovídáš:
Dobrý den, sledovací číslo nefunguje a balík pořád nikde. Kdy zásilku dostanu? A šlo by k té objednávce ještě přiobjednat vlašské ořechy?
Vrať „reply" (celá zpráva připravená k odeslání), „questions" (1–3 otázky, které posunou konverzaci dál), „confidence", „risks" a „toneNotes".`,
    schema: {
      type: Type.OBJECT,
      properties: {
        reply: { type: Type.STRING },
        questions: { type: Type.ARRAY, items: { type: Type.STRING } },
        confidence: { type: Type.NUMBER },
        risks: { type: Type.ARRAY, items: { type: Type.STRING } },
        toneNotes: { type: Type.STRING },
      },
      required: ["reply", "questions", "confidence", "risks", "toneNotes"],
    },
    // Lenient on purpose: `risks` may legitimately be empty (a safe message), and
    // confidence is a judgement call — assert shape + range, never exact wording.
    validate: (r) =>
      r &&
      isStr(r.reply) &&
      isStrArr(r.questions, 1) &&
      Number.isFinite(num(r.confidence)) &&
      num(r.confidence) >= 0 &&
      num(r.confidence) <= 100 &&
      Array.isArray(r.risks) &&
      isStr(r.toneNotes),
  },
  {
    id: "twin-style",
    label: "Trénink hlasu dvojčete",
    system:
      "Jsi lingvista a stratég značky. Z reálných zpráv firmy vytáhneš její komunikační styl a zapíšeš ho jako návod pro jazykový model. Popisuj jen to, co je v ukázkách vidět; co nevíš, vyžádej si v poli gapQuestions. Pole kind smí být pouze „do“ nebo „dont“. Piš česky a vracej pouze validní JSON dle schématu.",
    prompt:
      "Vytáhni komunikační styl značky pro kanál: e-mail. Typ podnikání: leadgen. Reálné zprávy, které firma poslala (2): --- Ukázka 1 --- Dobrý den, pane Nováku, díky za poptávku. Revizi zvládneme do 14 dnů, přesný termín potvrdím zítra po obhlídce. --- Ukázka 2 --- Dobrý den, paní Dvořáková, cenu za servis čtyř jednotek pošlu do pátku. Kdyby cokoliv, volejte. Vrať summary, directives, traits, lengthHint, constraints, examples a gapQuestions.",
    schema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        directives: { type: Type.STRING },
        traits: { type: Type.ARRAY, items: { type: Type.STRING } },
        lengthHint: { type: Type.STRING },
        constraints: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { kind: { type: Type.STRING }, rule: { type: Type.STRING } },
            required: ["kind", "rule"],
          },
        },
        examples: { type: Type.ARRAY, items: { type: Type.STRING } },
        gapQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["summary", "directives", "traits", "lengthHint", "constraints", "examples", "gapQuestions"],
    },
    validate: (r) =>
      r &&
      isStr(r.summary) &&
      isStr(r.directives) &&
      isStrArr(r.traits, 1) &&
      isStr(r.lengthHint) &&
      Array.isArray(r.constraints) &&
      r.constraints.every((c) => c && isStr(c.rule) && (c.kind === "do" || c.kind === "dont")) &&
      isStrArr(r.examples, 1) &&
      isStrArr(r.gapQuestions, 1),
  },
  // system = production REPURPOSE_SYSTEM (src/lib/ai/tools/repurpose.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "repurpose",
    tier: "fast",
    label: "Přepracování článku do kanálů",
    system: `Jsi český obsahový stratég a copywriter. Z jednoho zdrojového článku připravuješ varianty „na míru" pro jednotlivé distribuční kanály.

Pravidla:
- Piš výhradně česky, gramaticky správně, s diakritikou a bez prázdných korporátních frází.
- Pro KAŽDÝ požadovaný kanál napiš právě jednu variantu v jeho přirozeném stylu:
  - Newsletter = řádek „Předmět:" + krátký uvozující odstavec + výzva k přečtení článku;
  - LinkedIn = profesionálně a věcně, klidně s odrážkami, minimum emoji;
  - Instagram = vizuálně, s emoji a 3–6 relevantními hashtagy na konci;
  - X / Twitter = velmi stručně a údernĕ;
  - Facebook = přátelsky a konverzačně, s lehkými emoji.
- Vycházej z předaného názvu a textu článku — neopisuj je doslova, převyprávěj to nejdůležitější.
- Nepřekračuj limit znaků daného kanálu (raději mírně pod ním). Do textu nevkládej odkaz s UTM — ten doplní aplikace.
- Vrať pouze validní JSON dle schématu — právě jednu variantu na každý požadovaný kanál.`,
    prompt: `Přepracuj tento zdrojový článek do variant pro uvedené kanály.

Název článku: Skladování ořechů: jak je udržet dlouho čerstvé
Tón: Přátelský a lidský

Text / výňatek článku:
Ořechy obsahují velký podíl nenasycených tuků, a právě ty se na světle, v teple a na vzduchu kazí nejrychleji — tuk žlukne a ořech zhořkne. Základem správného skladování je proto chlad, tma a vzduchotěsná nádoba. Ve spíži při pokojové teplotě vydrží loupané ořechy zhruba měsíc, v lednici tři až šest měsíců a v mrazáku klidně rok, aniž by ztratily chuť. Nejcitlivější na žluknutí jsou vlašské ořechy a pekany, mandle a kešu snesou o něco víc.

Druhým nepřítelem je vlhkost: navlhlé ořechy plesniví a plíseň nemusí být na první pohled vidět. Skladujte je proto vždy dobře uzavřené a nepřesypávejte je do nádoby, která je po mytí ještě vlhká. Vyplatí se také kupovat menší balení, které spotřebujete do pár týdnů — čerstvě pražené ořechy (v Mionelo je pražíme a balíme každý týden) chutnají nejlépe krátce po otevření.

Jak poznat, že ořech není v pořádku? Hořká „stará“ chuť, zatuchlý pach nebo tmavší skvrny na povrchu. Takový ořech vyhoďte — žluklé tuky tělu neprospívají. A tip na závěr: mražené ořechy není nutné rozmrazovat, do pečení i müsli je můžete sypat rovnou.

Kanály (limit znaků):
- LinkedIn | max 3000 znaků
- Instagram | max 2200 znaků

Vrať pole „variants", jeden objekt { channel, text } pro každý kanál. channel musí být přesně jeden z: LinkedIn, Instagram.`,
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
  // system = production ARTICLE_DRAFT_SYSTEM (src/lib/ai/tools/article-draft.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "article-draft",
    label: "Rozepsání briefu do článku",
    system: `Jsi český obsahový stratég a copywriter. Z hotového SEO briefu rozepisuješ plnohodnotný koncept článku připravený k publikaci.

Pravidla:
- Piš výhradně česky, gramaticky správně, s diakritikou a bez prázdných korporátních frází.
- Vyjdi z předané osnovy (H2 sekce a jejich odrážky): pro KAŽDOU sekci osnovy vytvoř nadpis (blok typu „h2") a pod ním 1–2 odstavce (bloky typu „p") plus případně seznam (blok typu „ul" nebo „ol").
- Hned na začátku napiš úvodní odstavec (perex) navazující na meta description.
- Zařaď přesně jeden blok typu „callout" (užitečný tip nebo varování) a na konci přesně jeden blok typu „cta" s pobídkou k akci.
- Volitelně zařaď NEJVÝŠE jeden blok typu „figure" (obrázek) tam, kde by vizuál článku pomohl — typicky za úvodem nebo u klíčové sekce. Do pole „alt" napiš stručný popis toho, co by měl obrázek zachycovat; NEVYMÝŠLEJ URL ani cestu k souboru — obrázek doplní uživatel z knihovny vizuálů. Pokud se vizuál nehodí, „figure" vynech.
- Klíčová slova z briefu zapracuj přirozeně do textu — žádné keyword stuffing.
- Text musí být věcný, čtivý a užitečný, ne výplň.
- Každý blok je objekt s polem „type". Podle typu vyplň:
  - „p": pole „text" (odstavec).
  - „h2" / „h3": pole „text" (nadpis sekce / podsekce).
  - „ul" / „ol": pole „items" (pole řetězců — odrážky).
  - „callout": pole „variant" („tip" | „info" | „warn"), volitelně „title", a pole „text".
  - „cta": pole „text" (pobídka), „cta" (text tlačítka); odkaz doplní aplikace.
  - „figure": pole „alt" (popis navrhovaného obrázku), volitelně „caption" (popisek pod obrázkem); „src" nevyplňuj.
- Odstavce drž krátké (2–4 věty). Celkem vrať nejvýše ~16 bloků — buď stručný a věcný, ne mnohomluvný.
- Vrať POUZE jeden validní JSON objekt dle schématu (pole „blocks" a „faq") — žádný text okolo, žádné markdown bloky, žádné komentáře.`,
    prompt: `Rozepiš tento hotový brief do plnohodnotného konceptu článku.

Titulek (H1): Skladování ořechů: jak je udržet dlouho čerstvé
Title tag: Skladování ořechů: praktický průvodce | Mionelo
Meta description: Praktický návod, jak skladovat ořechy a semínka, aby vydržely déle čerstvé — teplota, světlo, vzduchotěsné nádoby i mražení.
Cílová skupina: domácí kuchaři a zákazníci e-shopu, kteří nakupují ořechy ve větším balení
Typ obsahu: Blogový článek
Kontext značky (piš v jejím světě, drž se sortimentu a slovníku): Mionelo — e-shop s ořechy, semínky a superpotravinami; doprava zdarma od 799 Kč

Osnova, kterou článek dodrží (každý nadpis = jedna sekce H2):
## Proč na skladování záleží
  - žluknutí tuků na světle a v teple
  - vlhkost a plíseň
## Jak ořechy skladovat doma
  - chlad, tma a stabilní teplota
  - vzduchotěsné nádoby a sklenice
  - mražení pro dlouhodobé zásoby
## Jak poznat, že ořechy nejsou v pořádku
  - hořká chuť a zatuchlý pach
  - změna barvy a povrchu

Klíčová slova k přirozenému zapracování: skladování ořechů, jak skladovat ořechy, žluknutí ořechů, vlašské ořechy skladování
Časté dotazy, které článek zodpoví (vrať je v poli „faq“):
- Jak dlouho vydrží ořechy ve spíži?
- Dají se ořechy mrazit?

Vrať objekt s polem „blocks" (tělo článku jako sekvence bloků) a polem „faq" (otázka + odpověď).
Pořadí bloků: úvodní odstavec, pak pro každou sekci osnovy nadpis h2 + odstavce/seznam, jeden callout a na konci jeden cta.`,
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
      "Jsi český analytik jednotkové ekonomiky (CAC, LTV, návratnost). Děláš stručnou diagnostiku akvizičních kohort. Vycházej jen z předaných čísel, nevymýšlej žádné hodnoty. Je-li uveden rozpad podle kanálů, urči kanál, který kohortu nejvíc táhne dolů; z retenční křivky čti tvar poklesu. Vracej pouze validní JSON dle schématu.",
    prompt:
      "Reálná data kohort (od nejstarší): 2025-01: CAC 1 200 Kč, LTV 5 400 Kč, LTV:CAC 4,5×, návratnost 4 měs., M3 retence 62 %, 180 registrací. 2025-02: CAC 1 600 Kč, LTV 3 800 Kč, LTV:CAC 2,4×, návratnost 7 měs., M3 retence 48 %, 210 registrací. 2025-03: CAC 2 100 Kč, LTV 2 200 Kč, LTV:CAC 1,0×, návratnost > horizont (nevrací se), M3 retence 31 %, 240 registrací; kanály: Google Ads CAC 2 600 Kč LTV:CAC 0,8× 150 akvizic, Organic zdarma LTV:CAC 6,0× 90 akvizic; retenční křivka M0 100 %, M1 70 %, M2 48 %, M3 31 % (dál modelováno). Souhrn: blended CAC 1 650 Kč, průměrné LTV:CAC 2,6×. Povolené názvy kohort pro „worstCohort“: 2025-01, 2025-02, 2025-03. Urči nejproblematičtější kohortu a jednu nejúčinnější páku. Vrať pole summary (krátký odstavec), worstCohort (přesný název kohorty z dat) a recommendation (jedno konkrétní doporučení).",
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
  // system = production COMPARISON_OUTLINE_SYSTEM (src/lib/ai/tools/comparison-outline.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "comparison-outline",
    label: "Kostra srovnávací stránky",
    system: `Jsi český SEO obsahový stratég specializovaný na srovnávací stránky s vysokým nákupním záměrem (typu „X vs Y", „alternativy k X", „ceník X", „recenze X"). Z jednoho cílového dotazu připravuješ kostru srovnávací stránky připravenou k publikaci — ne obecný brief.

Pravidla:
- Piš výhradně česky, gramaticky správně, s diakritikou a bez prázdných korporátních frází.
- Přizpůsob strukturu ZÁMĚRU dotazu:
  - „srovnání" (vs): přímé srovnání hlava na hlavu — kritéria vedle sebe, kdy zvolit které řešení, závěr s jasným doporučením.
  - „alternativa": přehled alternativ + úhel migrace (proč a jak přejít, na co si dát pozor při přechodu).
  - „cena": rozbor cen a balíčků — z čeho se cena skládá, skryté náklady, poměr cena/výkon, pro koho se vyplatí.
  - „recenze": recenze s verdiktem — silné a slabé stránky, pro koho ano / pro koho ne, jasný verdikt.
- Vrať „h1" — výstižný nadpis stránky odpovídající dotazu a záměru.
- Vrať „sections" — 4–7 logicky řazených sekcí. Každá sekce má „heading" (nadpis H2) a „points" (2–5 konkrétních odrážek, co sekce pokryje).
- Vrať „comparisonCriteria" — 4–8 kritérií, podle kterých se řešení porovnávají (např. cena, funkce, podpora, integrace, náročnost nasazení). Krátká, konkrétní.
- Vrať „verdict" — 1–2 věty se shrnujícím doporučením / závěrem stránky.
- Vrať „faq" — 3–5 častých dotazů (q) a stručných odpovědí (a) navázaných na téma a záměr.
- Jsou-li uvedeny KONKURENT a/nebo VAŠE POZICE, ber je jako reálná data: jmenuj konkurenta a opři srovnání, kritéria i verdikt o uvedené odlišnosti. Nejsou-li uvedeny, nevymýšlej si konkrétní fakta, ceny ani názvy produktů — mluv obecně („daný nástroj", „alternativní řešení") a obsah ať je kostra k doplnění redaktorem. Zástupné formulace typu „redaktor doplní" ale nikdy nepiš do samotného obsahu — každá odrážka je konkrétní pokyn, CO sekce pokryje, i bez dodaných dat.
- Vrať POUZE jeden validní JSON objekt dle schématu — žádný text okolo, žádné markdown bloky, žádné komentáře.`,
    prompt: `Připrav kostru srovnávací stránky pro tento cílový dotaz.
Cílový dotaz (hlavní klíčové slovo): chia semínka vs lněná semínka
Záměr dotazu: Srovnání (vs)
Měsíční hledanost: 590
Sestav kostru přizpůsobenou záměru (viz pravidla):
- h1: nadpis stránky,
- sections: 4–7 sekcí, každá { heading, points[] },
- comparisonCriteria: 4–8 kritérií pro porovnání,
- verdict: shrnující doporučení (1–2 věty),
- faq: 3–5 dotazů { q, a }.
Žádná konkrétní konkurenční data nemáš — drž obsah obecný a doplnitelný redaktorem.`,
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
      "Jsi český analytik kvality leadů. Diagnostikuješ JEDEN podvýkonný zdroj leadů. Vycházej jen z předaných čísel, nevymýšlej žádné hodnoty. Je-li uveden vývoj oproti minulému období nebo upozornění (drift), zohledni ho: zhoršující se zdroj je naléhavější. Vracej pouze validní JSON dle schématu.",
    prompt:
      "Reálná data jednoho zdroje leadů. Zdroj: Meta lead formuláře. Leadů celkem: 540. Z toho kvalifikovaných (SQL): 130 (míra kvalifikace 24,1 %). Z toho uzavřených (won): 14 (win rate 10,8 %). Náklady (spend): 96 000 Kč. CPL (cena za lead): 178 Kč. CPQL (cena za kvalifikovaný lead): 738 Kč. Vývoj oproti minulému období: CPQL +66,5 %, kvalifikace −28,3 %, win rate −5,0 %. Rychlost lead → uzavřeno: ø 56 dní. Upozornění (drift): CPQL zdroje „Meta lead formuláře” vzrostlo o 67 % oproti minulému období. Pro srovnání ostatní zdroje (od nejvýkonnějšího): Google Search — míra kvalifikace 41,0 %, win rate 19,2 %, CPQL 392 Kč; Doporučení (referral) — míra kvalifikace 55,0 %, win rate 24,0 %, CPQL 210 Kč. Povolené hodnoty pole „likelyCause“: spam, mis-targeting, pricing, volume, ok. Urči nejpravděpodobnější příčinu, proč je zdroj podvýkonný, a jednu konkrétní akci; v doporučení pojmenuj konkrétní výkonnější zdroj podle jeho čísel. Vrať summary (krátký odstavec), likelyCause (jedna z povolených hodnot) a recommendation (jedno konkrétní doporučení).",
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
  {
    id: "ads-diagnosis",
    label: "Diagnóza výkonu reklam",
    // system = production ADS_DIAGNOSIS_SYSTEM (src/lib/ai/tools/ads-diagnosis.ts),
    // with the shared antiFabrication fragment resolved — keep in sync with the tool.
    system:
      "Jsi zkušený český PPC stratég. Děláš stručnou diagnostiku CELÉHO placeného portfolia klienta (Google Ads a Sklik dohromady) za posledních 30 dní.\n\nPravidla:\n- Vycházej VÝHRADNĚ z předaných čísel — nevymýšlej si žádné údaje, které v podkladech nejsou.\n- Nikdy nesčítej částky napříč měnami. Je-li uvedeno, že sítě mají různé měny, souhrn platí jen pro hlavní síť a ostatní sítě porovnávej pouze poměrovými ukazateli (ROAS, PNO).\n- Urči JEDNU nejpravděpodobnější příčinu, proč portfolio nedosahuje cíle — a klasifikuj ji do jedné z těchto kategorií (pole „likelyCause\"):\n  - „waste-zero-conv\" = podstatná část rozpočtu teče do kampaní bez konverzí.\n  - „budget-misallocation\" = peníze sedí v podvýkonných kampaních, zatímco ty výkonné by unesly víc.\n  - „efficiency-drift\" = efektivita se zhoršuje oproti minulému období (náklady rostou rychleji než hodnota konverzí).\n  - „tracking-gap\" = čísla ukazují na chybějící měření (výdaje a prokliky jsou, konverze či jejich hodnota chybí).\n  - „platform-imbalance\" = jedna síť nese velkou část nákladů s výrazně horším ROAS než druhá.\n  - „healthy\" = portfolio nemá zásadní problém.\n- Doporuč JEDNU nejúčinnější, konkrétní akci (např. vypnout / omezit konkrétní kampaň, přesunout rozpočet ke jmenované výkonnější kampani, dorovnat měření konverzí) — akčně, ne obecně.\n- Jmenuj konkrétní kampaně podle jejich názvů a čísel; pole „affectedCampaignIds\" smí obsahovat POUZE id kampaní uvedená v datech.\n- Je-li uvedeno minulé období, zohledni vývoj: zhoršující se portfolio je naléhavější a mění doporučení i závažnost.\n- Odkazuj se na konkrétní čísla z dat (náklady, ROAS, PNO, konverze, cíl PNO).\n- Vrať „severity\" (high | medium | low) podle závažnosti.\n- Piš česky, věcně, bez vaty a marketingových frází.\n- Drž se zadaného JSON schématu.",
    prompt:
      "Reálná, již spočítaná data placeného portfolia za posledních 30 dní. Souhrn portfolia (měna CZK): náklady 412 000 Kč; konverze 318 v hodnotě 1 640 000 Kč; ROAS 3,98× · PNO 25,1 %. Cílové PNO: 18,0 %. Minulé období: náklady 356 000 Kč, konverze 341, hodnota 1 712 000 Kč. Sítě (každá ve své vlastní měně): Google Ads — 9 kampaní, náklady 318 000 Kč, ROAS 4,42×; Sklik — 4 kampaně, náklady 94 000 Kč, ROAS 2,49×. Nejvíc pálící kampaně (od nejvyššího nevyužitého rozpočtu): [c-71] „PMax – Výprodej“ (Google Ads, Performance Max): náklady 86 000 Kč, konverze 0, hodnota 0 Kč, ROAS 0,00×, PNO 0 %, CTR 1,1 %, denní rozpočet 3 000 Kč, náklady +42,0 % oproti minulé synchronizaci; [c-33] „Sklik – Obsahová síť“ (Sklik, Obsahová síť): náklady 61 000 Kč, konverze 6, hodnota 74 000 Kč, ROAS 1,21×, PNO 82,4 %, CTR 0,4 %; [c-12] „Search – Značka konkurence“ (Google Ads, Vyhledávání): náklady 48 000 Kč, konverze 11, hodnota 128 000 Kč, ROAS 2,67×, PNO 37,5 %, CTR 2,9 %. Nejvýkonnější kampaně (kam lze případně přesunout rozpočet): [c-04] „Search – Vlastní značka“ (Google Ads, Vyhledávání): náklady 52 000 Kč, konverze 141, hodnota 690 000 Kč, ROAS 13,27×, PNO 7,5 %, CTR 9,8 %; [c-19] „Shopping – Bestsellery“ (Google Ads, Nákupy): náklady 74 000 Kč, konverze 96, hodnota 462 000 Kč, ROAS 6,24×, PNO 16,0 %, CTR 1,4 %. Povolené hodnoty pole „likelyCause“: waste-zero-conv, budget-misallocation, efficiency-drift, tracking-gap, platform-imbalance, healthy. Urči nejpravděpodobnější příčinu, proč portfolio nedosahuje cíle, a jednu konkrétní akci. Vrať summary (krátký odstavec), likelyCause (jedna z povolených hodnot), recommendation (jedno konkrétní doporučení), severity (high | medium | low) a affectedCampaignIds (id kampaní pouze z uvedených dat).",
    // schema mirrors production ADS_DIAGNOSIS_SCHEMA verbatim (descriptions and
    // propertyOrdering included), so the golden fingerprints the real contract.
    schema: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: "Krátký odstavec shrnující, proč portfolio nedosahuje cíle",
        },
        likelyCause: {
          type: Type.STRING,
          description: "Hlavní příčina, jedna z: waste-zero-conv | budget-misallocation | efficiency-drift | tracking-gap | platform-imbalance | healthy",
        },
        recommendation: {
          type: Type.STRING,
          description: "Jedna nejúčinnější konkrétní akce k řešení",
        },
        severity: {
          type: Type.STRING,
          description: "Závažnost problému: high | medium | low",
        },
        affectedCampaignIds: {
          type: Type.ARRAY,
          description: "Id dotčených kampaní, pouze z předaných dat (nejvýš 6)",
          items: { type: Type.STRING },
        },
      },
      required: ["summary", "likelyCause", "recommendation"],
      propertyOrdering: ["summary", "likelyCause", "recommendation", "severity", "affectedCampaignIds"],
    },
    // Lenient: non-empty summary + recommendation + likelyCause (production COERCES
    // an unknown cause to a default rather than failing, so asserting one specific
    // label would flake under model variance), and — the anti-fabrication half —
    // every returned campaign id must be one the prompt actually supplied.
    validate: (r) => {
      if (!r || !isStr(r.summary) || !isStr(r.recommendation) || !isStr(r.likelyCause)) return false;
      const IDS = new Set(["c-71", "c-33", "c-12", "c-04", "c-19"]);
      const ids = Array.isArray(r.affectedCampaignIds) ? r.affectedCampaignIds : [];
      return ids.every((id) => IDS.has(id));
    },
  },
  {
    id: "local-diagnosis",
    label: "Lokální diagnóza (mapa-pack + recenze)",
    system:
      "Jsi český specialista na lokální SEO a Google Business Profile (mapa-pack, pokrytí služeb v lokalitách, recenze). Děláš stručnou diagnostiku lokální viditelnosti. Vycházej jen z předaných čísel, nevymýšlej žádné hodnoty ani lokality. Urči JEDNU mezeru v pokrytí (kombinaci služba×lokalita) k uzavření jako první — pole „worstGap“ musí být jeden z povolených názvů. Vracej pouze validní JSON dle schématu.",
    prompt:
      "Reálná, spočítaná data lokální viditelnosti. Podnik: Zubní klinika Dentalis. Pokrytí: 43 % (3 z 7 sledovaných kombinací služba×lokalita má vlastní stránku). Objem hledání bez pokrytí (v mezerách): 3 100 / měsíc. Mezery v pokrytí (od nejvyššího objemu; „worstGap“ musí být jeden z těchto názvů): Bělení zubů — Praha: 1 400 hledání/měs., bez stránky; Dentální hygiena — Brno: 900 hledání/měs., bez stránky; Implantáty — Ostrava: 800 hledání/měs., bez stránky. Mapa-pack pozice [zdroj: živá data]: v top 3 je 2 z 5 kombinací (40 %), na 1. místě 1; průměrná pozice 6,2. Trend za 30 dní: 1 zlepšeno, 3 zhoršeno (čistý posun −5). Recenze [zdroj: živá data]: 214 hodnocení, průměr 4,3★; pozitivních 170, neutrálních 22, negativních 22. Urči, kterou mezeru uzavřít jako první, a jednu nejúčinnější akci. Vrať summary (krátký odstavec), worstGap (přesný název mezery z dat) a recommendation (jedno konkrétní doporučení).",
    schema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        worstGap: { type: Type.STRING },
        recommendation: { type: Type.STRING },
        risks: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["summary", "worstGap", "recommendation"],
    },
    // Lenient: non-empty summary + recommendation, and worstGap must be one of the
    // gap labels supplied in the prompt (the model can't invent a gap).
    validate: (r) => {
      if (!r || !isStr(r.summary) || !isStr(r.recommendation) || !isStr(r.worstGap)) return false;
      const LABELS = new Set([
        "Bělení zubů — Praha",
        "Dentální hygiena — Brno",
        "Implantáty — Ostrava",
      ]);
      return LABELS.has(r.worstGap.trim());
    },
  },
  // system = production CHAT_SYSTEM (src/lib/ai/tools/chat.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "chat",
    label: "Datový report — chat",
    system: `Jsi zkušený český specialista na výkonnostní marketing a e-commerce. Připravuješ stručné, srozumitelné shrnutí výkonu pro klienta.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel — nevymýšlej si žádné údaje, které v podkladech nejsou.
- Odkazuj se na konkrétní kanály a čísla z dat (např. PNO daného kanálu, ROAS, podíl na obratu).
- Nezaměňuj efektivitu reklamy se ziskovostí: PNO a ROAS měří efektivitu výdajů vůči obratu, ne zisk. Bez dat o marži nehodnoť „ziskovost" — piš o efektivitě.
- Nezaváděj externí benchmarky, „běžné standardy" ani prahové hodnoty, které v předaných datech nejsou. Každý práh v doporučení odvoď z předaných čísel (a řekni jak), jinak ho vynech.
- Buď konkrétní a akční: doporučení musí být něco, co PPC specialista reálně udělá (úprava rozpočtů a nabídek, řízení PNO, škálování nejlepších kanálů, oprava nejslabších).
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.

Teď vedeš navazující konverzaci nad tímto reportem. Navíc platí:
- Odpovídej konverzačně a stručně (2–5 vět), jako v chatu — žádné markdown nadpisy ani odrážkové seznamy, pokud o ně klient výslovně nepožádá.
- Vycházej VÝHRADNĚ z předaných čísel. Pokud odpověď z dat nevyplývá, řekni to na rovinu a navrhni, co by bylo potřeba změřit.
- Nikdy nekonči pouhým konstatováním. Poslední věta je vždy jeden konkrétní další krok: buď akce vyvoditelná z předaných čísel, nebo přesně co doměřit/doplnit, aby šla otázka zodpovědět.
- Drž se poslední otázky klienta; neopakuj celý report.`,
    prompt: `Níže jsou reálná výkonnostní data klienta z marketingových kampaní.

DATA:
Klient: Mionelo (mionelo.cz) — e-shop s ořechy a superpotravinami
Období: posledních 30 dní (srovnání s předchozím stejně dlouhým obdobím)

Souhrn metrik (hodnota | meziobdobní změna | spolehlivost změny):
- Návštěvy: 84 200 | +9,4 % · statisticky významné
- Náklady: 222 000 Kč | +6,1 % · statisticky významné
- Konverze: 2 130 | +12,0 % · statisticky významné
- Obrat (hodnota konverzí): 1 200 000 Kč | +8,2 % · statisticky významné
- PNO: 18,5 % (cíl 18 %) | −1,8 % · orientační (poměrová metrika)
- ROAS: 5,4×
- Konverzní poměr: 2,53 %
- Průměrná hodnota objednávky: 563 Kč

Výkon podle kanálů (obrat | podíl | PNO | ROAS | změna obratu):
- Google Ads / Vyhledávání: 520 000 Kč | 43 % | 14,2 % | 7,0× | +11,3 %
- Sklik / Vyhledávání: 260 000 Kč | 22 % | 16,8 % | 6,0× | +4,9 %
- Meta Ads: 250 000 Kč | 21 % | 21,5 % | 4,7× | +6,2 %
- Sklik / Obsahová síť: 170 000 Kč | 14 % | 29,8 % | 3,4× | −3,8 %

KONVERZACE (nejstarší nahoře, poslední řádek je aktuální dotaz klienta):
Asistent: Za posledních 30 dní obrat 1 200 000 Kč při nákladech 222 000 Kč, PNO 18,5 % těsně nad cílem 18 %. Nejslabší kanál je Sklik / Obsahová síť s PNO 29,8 %, nejlepší návratnost má Google Ads / Vyhledávání (ROAS 7,0×).
Klient: Dobře. A vyplatí se nám Meta Ads i po započtení marže? Jaká je tam ziskovost?

Odpověz na POSLEDNÍ dotaz klienta. Vycházej pouze z uvedených dat.`,
    schema: {
      type: Type.OBJECT,
      properties: {
        reply: { type: Type.STRING },
      },
      required: ["reply"],
    },
    // Lenient on purpose: assert shape/presence, not exact wording — strict
    // every()-style checks flake under model variance (see article-draft).
    validate: (r) => r && isStr(r.reply),
  },
  // system = production MONTHLY_RECAP_SYSTEM (src/lib/ai/tools/monthly-recap.ts) @ 2026-08-05 — keep in sync when the tool's prompt changes.
  {
    id: "monthly-recap",
    label: "Měsíční rekapitulace",
    system: `Jsi zkušený český marketingový stratég. Připravuješ měsíční rekapitulaci výkonu pro klienta.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel a z typu podnikání klienta — nevymýšlej si žádné údaje, které v podkladech nejsou.
- Přizpůsob rámování typu podnikání: u e-shopu mluv o obratu, PNO a ROAS; u lokálního podniku, leadgenu nebo obsahového webu spíš o poptávkách, návštěvnosti, viditelnosti a konverzích — nepředpokládej e-commerce, pokud to data nedokládají.
- Nezaváděj externí benchmarky ani „běžné tržní standardy", které v předaných datech nejsou — highlight i watchout musí stát na předaných číslech (srovnání období, kanálů, trendů), ne na obecných tvrzeních o trhu.
- Buď konkrétní a akční: priority musí být něco, co tým reálně příští měsíc udělá.
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`,
    prompt: `Níže je měsíční přehled výkonu klienta z marketingových kampaní.
Typ podnikání klienta: e-shop.
Připrav měsíční rekapitulaci a rámuj ji podle tohoto typu podnikání.

DATA:
Klient: Mionelo (mionelo.cz) — e-shop s ořechy a superpotravinami
Období: posledních 30 dní (srovnání s předchozím stejně dlouhým obdobím)

Souhrn metrik (hodnota | meziobdobní změna | spolehlivost změny):
- Návštěvy: 84 200 | +9,4 % · statisticky významné
- Náklady: 222 000 Kč | +6,1 % · statisticky významné
- Konverze: 2 130 | +12,0 % · statisticky významné
- Obrat (hodnota konverzí): 1 200 000 Kč | +8,2 % · statisticky významné
- PNO: 18,5 % (cíl 18 %) | −1,8 % · orientační (poměrová metrika)
- ROAS: 5,4×
- Konverzní poměr: 2,53 %
- Průměrná hodnota objednávky: 563 Kč

Výkon podle kanálů (obrat | podíl | PNO | ROAS | změna obratu):
- Google Ads / Vyhledávání: 520 000 Kč | 43 % | 14,2 % | 7,0× | +11,3 %
- Sklik / Vyhledávání: 260 000 Kč | 22 % | 16,8 % | 6,0× | +4,9 %
- Meta Ads: 250 000 Kč | 21 % | 21,5 % | 4,7× | +6,2 %
- Sklik / Obsahová síť: 170 000 Kč | 14 % | 29,8 % | 3,4× | −3,8 %

Minulé období (předchozích 30 dní) pro srovnání: návštěvy 76 900, náklady 209 000 Kč, konverze 1 900, obrat 1 109 000 Kč, PNO 18,8 %, ROAS 5,3×.

Na základě těchto čísel urči: jednovětý verdikt (headline), odstavec shrnutí (summary), 3–4 hlavní úspěchy (highlights), 2–3 věci k hlídání (watchouts) a 3–4 priority na příští měsíc (priorities). Vycházej pouze z uvedených dat.`,
    schema: {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING },
        summary: { type: Type.STRING },
        highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
        watchouts: { type: Type.ARRAY, items: { type: Type.STRING } },
        priorities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { title: { type: Type.STRING }, detail: { type: Type.STRING } },
            required: ["title", "detail"],
          },
        },
      },
      required: ["headline", "summary", "highlights", "watchouts", "priorities"],
    },
    validate: (r) =>
      r &&
      isStr(r.headline) &&
      isStr(r.summary) &&
      isStrArr(r.highlights, 1) &&
      isStrArr(r.watchouts, 1) &&
      Array.isArray(r.priorities) &&
      isStr(r.priorities[0]?.title),
  },
  // system + schema + prompt are the PRODUCTION contract, mirrored byte-for-byte from
  // src/lib/ai/tools/channel-research.ts (CHANNEL_RESEARCH_SYSTEM, CHANNEL_RESEARCH_SCHEMA,
  // buildChannelResearchPrompt(CHANNEL_RESEARCH_FIXTURE_REQUEST)) @ 2026-08-28. This file is
  // loaded by bare `node` (llm-gate / llm-eval), so it cannot import the TS module — the copy
  // is kept honest by test-unit/llm-fixture-fidelity.test.mjs, which fails when the two
  // diverge. Update both together, then `npm run llm:eval:update -- --reason "..."`.
  {
    id: "channel-research",
    label: "Výzkum bezplatných kanálů viditelnosti",
    system: `Jsi český stratég pro organickou (bezplatnou) viditelnost. Firmě sestavuješ plán kanálů, kde se může zviditelnit ZDARMA — bez rozpočtu na reklamu (placené PPC řeší jiný modul).

Uvažuj o těchto typech kanálů:
- katalogy a zápisy (Google Business Profile, Firmy.cz, Mapy.cz, oborové katalogy),
- porovnávače / marketplace se zdarma výpisem (Zboží.cz, Heureka),
- komunity (Facebook skupiny, Reddit, oborová fóra, Product Hunt),
- vlastní obsah (SEO/blog, YouTube, newsletter),
- organické sociální sítě,
- PR a hostování (podcasty, hostující články, reference),
- partnerství a spolupráce (tvůrci, okolní/nekonkurenční podniky).

Pravidla:
- Doporuč 6–9 KONKRÉTNÍCH kanálů vhodných přesně pro tuto firmu a její typ. Preferuj kanály relevantní na českém trhu.
- Vycházej VÝHRADNĚ z předaného kontextu (typ podnikání, značka, popis firmy, nabídka, publikum, lokality, konkurence, klíčová slova) — nevymýšlej si žádné údaje, které v podkladech nejsou. Zejména si nevymýšlej čísla ani fakta o konkurenci.
- Každý kanál musí být bezplatný na vstup (žádné placené PPC/nákup médií).
- Pro každý kanál vrať: „name" (název kanálu), „category" (jedna z: directory | marketplace | community | content | social | pr | partnership), „fit" (0–100, jak dobře sedí této firmě), „effort" (low | medium | high), „rationale" (jednou větou proč sedí PRÁVĚ této firmě), „payoff" (co konkrétně přinese) a „firstActions" (2–4 konkrétní první kroky).
- Seřaď kanály od nejvyššího „fit" po nejnižší. Nedávej dva stejné kanály.
- Volitelně u kanálu vrať „url" (kam se zapsat) a „contentAngle" (námět příspěvku k předání do tvorby obsahu).
- Vrať i „summary": jednu větu, kde má firma největší bezplatnou příležitost.
- Piš česky, věcně, bez marketingových frází, a vracej POUZE jeden validní JSON objekt dle schématu — žádný text okolo.`,
    prompt: `Sestav plán bezplatných (organických) kanálů viditelnosti pro tuto firmu.
Typ podnikání: lokální podnik / služby s provozovnou
Značka / firma: Dentalis
Čím se firma zabývá: Zubní ordinace v Brně s vlastní dentální hygienou; ošetřujeme děti i dospělé.
Nabídka: zubní ordinace, dentální hygiena, implantáty
Cílové publikum: dospělí v Brně a okolí, kteří hledají stálého zubaře
Lokality: Brno
Konkurence (jen pro rámec, nevymýšlej si o ní čísla): Zubovo, SmileClinic
Klíčová slova, která publikum hledá: zubař Brno, dentální hygiena Brno, zubní implantáty
Vrať „summary" (jedna věta o největší bezplatné příležitosti) a „channels" — 6–9 kanálů seřazených podle „fit" sestupně, každý s poli name, category, fit, effort, rationale, payoff, firstActions (volitelně url, contentAngle).`,
    schema: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: "Jedna věta o největší bezplatné příležitosti firmy",
        },
        channels: {
          type: Type.ARRAY,
          description: "Bezplatné kanály viditelnosti, seřazené podle fit sestupně",
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: "Název kanálu",
              },
              category: {
                type: Type.STRING,
                description: "Kategorie kanálu, jedna z: directory | marketplace | community | content | social | pr | partnership",
              },
              fit: {
                type: Type.NUMBER,
                description: "Vhodnost pro tuto firmu, 0–100",
              },
              effort: {
                type: Type.STRING,
                description: "Náročnost: low | medium | high",
              },
              rationale: {
                type: Type.STRING,
                description: "Proč kanál sedí právě této firmě",
              },
              payoff: {
                type: Type.STRING,
                description: "Co konkrétně kanál přinese",
              },
              firstActions: {
                type: Type.ARRAY,
                description: "2–4 konkrétní první kroky",
                items: {
                  type: Type.STRING,
                },
              },
              url: {
                type: Type.STRING,
                description: "Kam se zapsat (volitelné)",
              },
              contentAngle: {
                type: Type.STRING,
                description: "Námět příspěvku k předání do tvorby obsahu (volitelné)",
              },
            },
            required: ["name", "category", "fit", "effort", "rationale", "payoff", "firstActions"],
            propertyOrdering: [
              "name",
              "category",
              "fit",
              "effort",
              "rationale",
              "payoff",
              "firstActions",
              "url",
              "contentAngle",
            ],
          },
        },
      },
      required: ["summary", "channels"],
      propertyOrdering: ["summary", "channels"],
    },
    // Lenient/structural: a non-empty summary and at least three named channels,
    // each with a non-empty name + rationale + at least one first action. category
    // and effort are COERCED to known sets in production (unknowns map to a default,
    // never a hard fail), so we don't assert their exact values under model variance.
    validate: (r) => {
      if (!r || !isStr(r.summary) || !Array.isArray(r.channels)) return false;
      const ok = r.channels.filter(
        (c) => c && typeof c === "object" && isStr(c.name) && isStr(c.rationale) && isStrArr(c.firstActions, 1)
      );
      return ok.length >= 3;
    },
  },
  {
    id: "onboarding-scan",
    label: "Sken webu na profil firmy",
    system:
      "Jsi český business analytik pro marketingový nástroj. Z textu domovské stránky webu vytáhneš stručný, věcný profil firmy. Vycházej jen z předaného textu, nevymýšlej si nic, co v textu není, a vracej pouze validní JSON dle schématu.",
    prompt:
      "Vytáhni profil firmy z textu její domovské stránky. URL: https://dentalis.cz. Titulek stránky: Dentalis — zubní ordinace Brno. TEXT STRÁNKY: Vítejte v ordinaci Dentalis v Brně. Poskytujeme komplexní zubní péči: dentální hygienu, záchovnou stomatologii, zubní implantáty a bělení zubů. Objednejte se online, ošetříme děti i dospělé. Moderní vybavení, příjemné prostředí, individuální přístup. Vrať profil firmy dle schématu: businessName, summary, offering, audience, toneOfVoice, keywords (4–8), competitors (0–5 návrhů k potvrzení; když si nejsi jistý, prázdné pole) a suggestedType (eshop | app | leadgen | content | local). Vrať POUZE jeden JSON objekt.",
    schema: {
      type: Type.OBJECT,
      properties: {
        businessName: { type: Type.STRING },
        summary: { type: Type.STRING },
        offering: { type: Type.STRING },
        audience: { type: Type.STRING },
        toneOfVoice: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        competitors: { type: Type.ARRAY, items: { type: Type.STRING } },
        suggestedType: { type: Type.STRING },
      },
      required: ["businessName", "summary", "offering", "audience", "toneOfVoice", "keywords", "competitors"],
    },
    // Lenient/structural: the core fields are present and keywords is a non-empty
    // list. competitors may legitimately be empty (the model was unsure), and
    // suggestedType is coerced/optional — so we don't assert either here.
    validate: (r) =>
      r &&
      isStr(r.businessName) &&
      isStr(r.summary) &&
      isStr(r.offering) &&
      isStr(r.audience) &&
      isStr(r.toneOfVoice) &&
      isStrArr(r.keywords, 1) &&
      Array.isArray(r.competitors),
  },
];

/** The exact `ChannelResearchRequest` the `channel-research` fixture's `prompt` was
 *  built from, so the fidelity test can rebuild it from the production builder rather
 *  than compare against a second hand-written copy. It carries `businessSummary` and
 *  `audience` deliberately: those are the two fields the onboarding scan contributes,
 *  the reason a URL-first tenant with an empty catalog gets a grounded plan at all,
 *  and the paraphrased fixture exercised neither. */
export const CHANNEL_RESEARCH_FIXTURE_REQUEST = {
  projectType: "local",
  brand: "Dentalis",
  businessSummary: "Zubní ordinace v Brně s vlastní dentální hygienou; ošetřujeme děti i dospělé.",
  offering: "zubní ordinace, dentální hygiena, implantáty",
  audience: "dospělí v Brně a okolí, kteří hledají stálého zubaře",
  localities: ["Brno"],
  competitors: ["Zubovo", "SmileClinic"],
  keywords: ["zubař Brno", "dentální hygiena Brno", "zubní implantáty"],
};
