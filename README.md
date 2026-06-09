# Systedo · Case study — pozice AI Vibecoder

Krátký web, kde **každý úkol ze zadání žije na samostatné stránce**. Celá studie je
záměrně postavená kolem jednoho fiktivního klienta — e-shopu **Mionelo** (ořechy,
semínka a superpotraviny) — aby působila jako reálná zakázka agentury, ne jako tři
nesouvisející dema. Dashboard ukazuje jeho výkon, článek míří na jeho web a AI nástroj
generuje jeho inzeráty.

| Stránka | Cesta | Úkol |
| --- | --- | --- |
| Přehled / rozcestník | `/` | — |
| Výkonnostní dashboard | `/dashboard` | 1 |
| Článek pro mionelo.cz | `/clanek` | 2 |
| AI generátor PPC inzerátů | `/ai-asistent` | 3 |

Stránky jsou navzájem prolinkované přes navigaci v hlavičce, patičku i odkazy přímo
v obsahu.

---

## Proč Next.js (zdůvodnění volby)

Zadání nechává volbu nástroje na kandidátovi. Zvolil jsem **Next.js 16 (App Router) +
TypeScript + Tailwind v4**, protože jediný framework čistě pokryje tři odlišné potřeby:

- **Stránka = soubor.** Routing podle souborů přesně sedí na „každý úkol = jedna
  stránka". Navigace a prolinkování jsou triviální a typově bezpečné.
- **Bezpečné volání LLM.** Route Handler drží `GEMINI_API_KEY` na serveru (Node
  runtime). Klíč nikdy neopustí backend — produkční vzor pro práci s AI.
- **Data bez databáze.** JSON v repozitáři je jediný zdroj pravdy, staticky
  importovaný a typovaný. Funguje stejně lokálně i na Vercelu, bez infrastruktury.
- **Výkon a SEO.** Obsahové stránky (článek) se renderují na serveru a jsou
  indexovatelné; interaktivní je jen dashboard a AI nástroj, kde to dává smysl.

---

## Rychlý start

```bash
npm install
npm run dev          # http://localhost:3000
```

Data dashboardu i obsah článku jsou už v repozitáři, takže web běží **bez jakékoli
konfigurace**. AI asistent funguje i bez klíče (ukázkový režim) — viz níže.

```bash
npm run build        # produkční build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run seed         # přegeneruje src/data/performance.json
```

---

## AI asistent (Úkol 3) — Gemini

Generátor PPC inzerátů pro Google Ads a Sklik. Pohání ho **`gemini-3-flash-preview`**
přes oficiální **`@google/genai`** SDK.

Co stojí za pozornost z pohledu AI-asistovaného vývoje:

- **Strukturovaný výstup** — model vrací JSON podle schématu (`responseSchema`),
  výsledek je rovnou typovaný a validovaný, žádné křehké parsování textu.
- **Doménová pravidla** — limity Google Ads (30 / 90 / 25 znaků) jsou zapečené
  v promptu a UI je navíc barevně kontroluje.
- **Klíč zůstává na serveru** — volání běží v `/api/ai` (Route Handler, Node runtime).
- **Funguje i bez klíče** — bez `GEMINI_API_KEY` se vrátí deterministická ukázka
  v limitech, jasně označená jako demo. Stránka je tak plně použitelná z repa.
- **Transparentnost** — UI umí zobrazit přesný prompt poslaný modelu.

### Nastavení klíče

```bash
cp .env.example .env.local
# doplňte GEMINI_API_KEY=...   (klíč zdarma: https://aistudio.google.com/apikey)
```

---

## Co který úkol řeší

**1 · Dashboard (`/dashboard`)** — headline metriky (návštěvy, náklady, konverze,
hodnota konverzí, **PNO**) se srovnáním vůči předchozímu období, interaktivní graf
vývoje s přepínáním metrik, rozpad výkonu podle kanálů, vyhodnocení PNO vůči cíli a
automaticky generované postřehy. Přepínač období (7 dní / 30 dní / 90 dní / 12 měsíců)
umožní rychlou orientaci i pohled do historie.

**2 · Článek (`/clanek`)** — publikovaný článek vhodný pro web mionelo.cz se správnou
webovou strukturou (perex, H2/H3, obsah, FAQ, CTA), interními kotvami v rámci článku,
odkazy na kategorie e-shopu i prolinkem na ostatní stránky webu. Obsahuje strukturovaná
data (`Article` + `FAQPage` JSON-LD) pro SEO.

**3 · AI asistent (`/ai-asistent`)** — viz výše.

---

## Data: jak vznikají a proč jsou konzistentní

Dashboard čte jediný JSON (`src/data/performance.json`), který generuje
`scripts/generate-data.mjs` (seedovaný PRNG → reprodukovatelné). Vše je odvozené z jedné
denní časové řady (2 roky), takže metriky vždy sedí dohromady:

```
hodnota konverzí = konverze × AOV
náklady          = obrat × PNO
konverze         = návštěvy × konverzní poměr
PNO              = náklady / obrat
```

Příběh dat je realistický: návštěvy a obrat rostou, konverzní poměr se zlepšuje a PNO
postupně klesá — přesně to, co klient čeká po převzetí účtu agenturou. Rozpad podle
kanálů se počítá z podílů, které se promítají na zvolené období, takže tabulka kanálů
vždy odpovídá headline metrikám.

> Čísla jsou ilustrativní, vymyšlená pro účely případové studie.

---

## Struktura projektu

```
src/
  app/
    page.tsx               # Přehled / rozcestník + zdůvodnění stacku
    dashboard/page.tsx     # Úkol 1
    clanek/page.tsx        # Úkol 2
    ai-asistent/page.tsx   # Úkol 3
    api/ai/route.ts        # serverové volání Gemini
    layout.tsx, globals.css, icon.svg
  components/
    site/                  # Nav, Footer
    dashboard/             # KPI karty, graf, tabulka kanálů, orchestrátor
    article/               # renderer strukturovaného obsahu
    ai/                    # AdGenerator (klientské UI)
    charts/                # Sparkline (bez závislostí)
    ui.tsx, icons.tsx
  lib/
    metrics.ts             # čistá analytická vrstva
    format.ts              # české formátování (Kč, %, čísla)
    data.ts, article.ts    # načítání JSON
    gemini.ts              # integrace Gemini (server-only)
    ai-types.ts, types.ts, nav.ts
  data/
    performance.json       # „databáze" dashboardu (generovaná)
    article.json           # obsah článku (headless-CMS model)
scripts/generate-data.mjs  # seed dat
```

---

## Nasazení (Vercel)

1. Naimportujte repozitář na [vercel.com/new](https://vercel.com/new).
2. (Volitelně) přidejte proměnnou prostředí `GEMINI_API_KEY` pro reálné generování
   inzerátů. Bez ní poběží AI asistent v ukázkovém režimu.
3. Deploy — žádná databáze ani další konfigurace nejsou potřeba.

---

## Použité technologie

Next.js 16 · React 19 (React Compiler) · TypeScript · Tailwind CSS v4 ·
`@google/genai` (Gemini) · vlastní SVG grafy (bez chart knihovny).
