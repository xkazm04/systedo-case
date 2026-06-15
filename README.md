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
| Přehled kampaní (Google Ads + AI) | `/kampane` | bonus |

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

## AI asistent (Úkol 3) — Claude / Gemini přes LLM wrapper

**Tři nástroje v jednom rozhraní**, každý odpovídá jednomu pilíři Systedo. Pohání je
**LLM wrapper** (`src/lib/llm`), který přepíná providera podle prostředí — v devu
**Claude Code CLI** (model `sonnet`, přes měsíční předplatné), v produkci **Gemini**
(`gemini-3-flash-preview`). Viz sekce **LLM wrapper** níže.

- **PPC inzeráty** (výkonnostní reklama) — nadpisy, popisky a klíčová slova s hlídáním
  limitů znaků pro Google Ads i Sklik.
- **Obsahový brief** (tvorba obsahu) — SEO title/meta v limitech, náhled ve vyhledávání,
  osnova H2, FAQ a návrhy interních odkazů.
- **Analýza dat** (analýzy a strategie) — interpretace **reálných dat z dashboardu**;
  model dostává jen skutečná čísla a nesmí žádná vymýšlet.

Co stojí za pozornost z pohledu AI-asistovaného vývoje:

- **Strukturovaný výstup** — model vrací JSON podle schématu (`responseSchema`),
  výsledek je rovnou typovaný a validovaný, žádné křehké parsování textu.
- **Doménová pravidla** — limity Google Ads i SEO jsou zapečené v promptu a UI je
  navíc barevně kontroluje.
- **Klíč/přístup zůstává na serveru** — volání běží v `/api/ai` (Route Handler, Node
  runtime), s jediným `generateStructured()` chokepointem pro všechny nástroje.
- **Funguje i bez providera** — když není dostupný (v devu chybí Claude CLI, v produkci
  klíč), vrátí se deterministická ukázka, jasně označená jako demo.
- **Animovaný časovač** — při čekání se plní kruhový indikátor; výsledek se zobrazí ihned
  po doručení, po 60 s se ukáže stylizovaná hláška o vypršení limitu (sazba pro Claude
  v devu).
- **Transparentnost** — UI umí zobrazit přesný prompt poslaný modelu.

### Nastavení

```bash
# Vývoj (dev) — žádný klíč není potřeba, stačí přihlášené Claude Code:
claude            # ověřte, že jste přihlášení (subscription)
npm run dev

# Produkce — Gemini:
cp .env.example .env.local
# doplňte GEMINI_API_KEY=...   (klíč zdarma: https://aistudio.google.com/apikey)
```

---

## Kampaně (bonus) — Google Ads přehled + AI vyhodnocení

Stránka `/kampane` je kompaktní přehled marketingových kampaní klienta s napojením na
**Google Ads**, srovnáním čísel **podle kampaní i podle typů** (Search, Performance Max,
Shopping, Display, Demand Gen, Video) a **AI vyhodnocením po řádcích** i pro celé
portfolio — s konkrétními doporučenými dalšími kroky. Data se ukládají do **lokální
SQLite**, takže přežijí reload i restart serveru.

Co stojí za pozornost:

- **Konektor jako adaptér.** `src/lib/campaigns/connector.ts` má jedno rozhraní a dva
  poskytovatele: ukázkový (deterministická, realistická data — funguje hned z repa) a
  reálný Google Ads. Reálný se aktivuje, jakmile jsou v prostředí `GOOGLE_ADS_*`
  proměnné (viz `.env.example`); samotné volání API je připravený, jasně označený seam.
- **AI vyhodnocení.** Čtvrtý nástroj pohání stejný **LLM wrapper** jako AI asistent
  (Claude v devu / Gemini v produkci, strukturovaný výstup dle schématu, **funguje i bez
  providera** v ukázkovém režimu). Vrací skóre 0–100, verdikt, silné stránky, slabiny a
  doporučení s prioritou — to vše **výhradně z reálných čísel** dané kampaně / portfolia.
- **Lokální dev režim.** Persistuje se přes vestavěné **`node:sqlite`** (Node 22.5+/24),
  takže žádná nová závislost ani build krok. Databáze žije v `.data/systedo.db`
  (gitignored); smazáním složky `.data` se přehled vyresetuje do prázdného stavu.

> Pozn.: kvůli SQLite na disku je tato stránka určená pro lokální běh — zbytek webu
> (dashboard, článek, AI asistent) zůstává bez databáze a nasaditelný na Vercel.

```bash
npm run dev          # /kampane → „Synchronizovat z Google Ads" → analýza po řádcích
```

---

## LLM wrapper (Claude v devu, Gemini v produkci)

Všechna volání LLM v aplikaci jdou přes **jeden wrapper** (`src/lib/llm`), který přepíná
providera podle prostředí:

| Prostředí | Provider | Model | Proč |
| --- | --- | --- | --- |
| `development` | **Claude Code CLI** (`claude -p`) | `claude-sonnet` (latest Sonnet, *medium thinking*) | využívá měsíční předplatné — výrazně lepší cena za token při lokální práci |
| `production` | **Google Gemini API** | `gemini-3-flash-preview` | bezserverové nasazení (Vercel) |

- **Jeden chokepoint.** Vrstva nástrojů (`src/lib/gemini.ts`) volá jen
  `generateStructured()`; přístup k providerům (`@google/genai`, spouštění `claude`) je
  uzavřený ve `src/lib/llm/{gemini,claude}.ts`. Hlídá to test (viz níže).
- **Claude přes `cmd`.** `src/lib/llm/claude.ts` spouští `claude -p - --model sonnet
  --max-turns 1`, prompt jde přes stdin, JSON se robustně vytáhne z výstupu. Pro vnořené
  spuštění se čistí `CLAUDECODE` / `CLAUDE_CODE_ENTRYPOINT` a nastaví `MAX_THINKING_TOKENS`.
- **Stejný kontrakt.** Schéma se u Gemini předává jako `responseSchema`, u Claude se vloží
  do promptu; obě cesty vrací stejně typovaný, normalizovaný výsledek.

### Test suite + pre-commit brána

Cíl: každé místo, které používá wrapper, má test proti **reálnému Claude** — ale jakmile
jednou projde, už se znovu nespouští (každé volání modelu trvá), dokud se LLM kód nezmění.

```bash
npm run llm:list           # vypíše všechna místa volající wrapper (call sites)
npm run test:llm:coverage  # statická brána (rychlá): každý call site je otagovaný + má test
npm run test:llm           # spustí nástroje proti reálnému Claude (pomalé)
npm run llm:gate           # brána: coverage + (jen při změně LLM kódu) reálný běh
```

- **Kontrakt pokrytí.** Každý `generateStructured(` call site nese tag `// llm-tool: <id>`
  a každý `id` má záznam v `test-llm/registry.mjs` (= test). Nový LLM nástroj bez testu
  bránu shodí. (`test-llm/callsites.mjs` to staticky ověří.)
- **Prove-once.** `scripts/llm-gate.mjs` spočítá hash LLM-relevantních souborů; když se
  shoduje s posledním úspěchem (`.llm-gate-cache.json`, verzovaný), reálné testy
  **přeskočí**. Změna LLM kódu hash změní → testy se přehrají a cache se obnoví.
- **Pre-commit.** `.husky/pre-commit` spouští `node scripts/llm-gate.mjs` (po
  `lint-staged`). Coverage běží vždy; reálný běh jen když je potřeba.

> Reálné testy potřebují přihlášené Claude Code (`claude`). Bez něj spadnou —
> přesně to brána hlídá.

---

## Testy (Playwright E2E)

End-to-end testy pro `/ai-asistent` ověřují všechny tři nástroje proti **reálnému
Gemini API** — dev server si nastartují samy:

```bash
# 1) do .env.local doplňte GEMINI_API_KEY
# 2) spusťte
npm run test:e2e
```

Pokrývají: vykreslení záložek, generování inzerátů / briefu / analýzy živým modelem
(včetně kontroly, že nejde o ukázkový režim), zachování stavu při přepínání nástrojů
a stylizovanou hlášku po vypršení 30s limitu. Bez `GEMINI_API_KEY` se testy proti
modelu přeskočí; strukturální test a test timeoutu poběží i tak.

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
    kampane/page.tsx       # Bonus — přehled kampaní
    api/ai/route.ts        # serverové volání LLM (přes wrapper)
    api/campaigns/         # GET/POST sync + analyze (SQLite, server-only)
    layout.tsx, globals.css, icon.svg
  components/
    site/                  # Nav, Footer
    dashboard/             # KPI karty, graf, tabulka kanálů, orchestrátor
    article/               # renderer strukturovaného obsahu
    ai/                    # AdGenerator (klientské UI)
    campaigns/             # tabulka, srovnání podle typu, AI report (klient)
    charts/                # Sparkline (bez závislostí)
    ui.tsx, icons.tsx
  lib/
    metrics.ts             # čistá analytická vrstva
    format.ts              # české formátování (Kč, %, čísla)
    data.ts, article.ts    # načítání JSON
    llm/                   # LLM wrapper: index (switch) + claude/gemini providery + models
    gemini.ts              # vrstva AI nástrojů (volá wrapper, server-only)
    db.ts                  # node:sqlite připojení (server-only)
    campaigns/             # model, konektor, store, sample data, prompty
    ai-types.ts, types.ts, nav.ts
  data/
    performance.json       # „databáze" dashboardu (generovaná)
    article.json           # obsah článku (headless-CMS model)
scripts/generate-data.mjs  # seed dat
scripts/llm-gate.mjs       # pre-commit brána pro LLM wrapper (coverage + prove-once)
test-llm/                  # node:test suite proti reálnému Claude + registry call sites
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
