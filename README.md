# Adamant — AI inteligence pro reklamu

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)
![Quality gate](https://img.shields.io/badge/check-typecheck%20%C2%B7%20lint%20%C2%B7%20build-2ea44f)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

**Adamant** je AI pracovní prostor pro reklamu — vzácný druh v adtech. Změří
výkon účtu, vysvětlí, co čísla znamenají, a vygeneruje podklady, které z nich
plynou: inzeráty, články, posty, kreativu i lokální SEO — v jednom workspace
místo dashboardu, tabulky a chat okna vedle sebe.

Úroveň podpory kanálů uvádíme vždy výslovně: **Google Ads** je živý datový
konektor, **Sklik** má kontroly limitů inzerátů a návrhy klíčových slov,
**Meta** a **TikTok** jsou publikační plochy.

- Produktový profil a positioning: [`PRODUCT.md`](./PRODUCT.md)
- Hodnotová argumentace vs. konkurence: [`docs/value-case.md`](./docs/value-case.md)
- **Cena: během validace zdarma** v plném rozsahu (férové denní limity — viz `/cena`).

> **Ukázková data.** Veřejné ukázky (homepage, `/dashboard`, mikrosite) běží nad
> fiktivním klientem **Mionelo** (e-shop s ořechy a superpotravinami). Všechna
> ukázková čísla jsou ilustrativní a takto označená — nejde o výsledky reálného
> zákazníka.

## Co uvnitř je

- **Výkonnostní dashboard a metriky** — návštěvy, náklady, konverze, obrat, PNO,
  srovnání období, rozpad podle kanálů, automatické postřehy.
- **Kampaňová inteligence** — triáž kampaní Google Ads, AI vyhodnocení po
  řádcích i za portfolio, doporučené přesuny rozpočtu, sdílené klientské reporty.
- **AI generování** — PPC inzeráty s hlídáním limitů Google Ads i Sklik, SEO
  brief a články, sociální posty, Creative Studio (vizuály), brand-voice twin.
- **Multi-tenant `/app`** — přihlášení přes Google (Auth.js), perzistence ve
  Firestore, projekty s vlastními daty, cron synchronizace s e-mail alerty
  (Resend), BYOM (vlastní API klíč, šifrovaný AES-256-GCM).

### Benchmark modelů — BYOM kandidáti (měřeno 5. 8. 2026)

Skóre LLM rozhodčího (1–10, Claude CLI Sonnet, 1 rozhodčí/buňku) přes všech
20 produkčních AI operací, spuštěno skutečným wrapperem (`npm run llm:quality`
s vendor-prefixovanými cíli). `claude-cli` = nativní CLI cesta (subscription);
`qwen:*` = Qwen Cloud API; `ollama` = lokální LFM2.5-8B-A1B. `✗` = model
operaci neobsloužil.

| operace | sonnet | opus | qwen3.8-max | glm-5.2 | deepseek-v4 | lfm2.5:8b |
|---|--:|--:|--:|--:|--:|--:|
| ads | 7.0 | 7.0 | 6.0 | 7.0 | 6.5 | 1.0 |
| brief | 8.5 | 9.0 | 8.0 | 7.5 | 7.0 | 1.0 |
| analysis | 7.5 | 6.0 | 7.0 | 6.5 | 6.0 | 3.0 |
| campaign-eval | 8.0 | 8.5 | 7.0 | 7.0 | 7.0 | 3.5 |
| social | 8.0 | 8.0 | 6.5 | 5.5 | 6.0 | 1.5 |
| twin-reply | 6.0 | 7.0 | 6.0 | 5.0 | 7.0 | 1.0 |
| twin-style | 8.0 | 8.0 | 7.5 | 5.0 | 6.0 | 2.0 |
| repurpose | 7.5 | 7.0 | 7.0 | 7.0 | 7.0 | 1.0 |
| local-review-reply | 8.5 | 8.7 | 6.5 | 6.0 | 6.0 | 1.0 |
| article-draft | 7.3 | 7.5 | 8.0 | 6.5 | 8.0 | 1.0 |
| cohort-diagnosis | 8.0 | 8.0 | 6.0 | 6.5 | 7.0 | 1.0 |
| keyword-clusters | 10.0 | 7.0 | 8.0 | 8.0 | 8.0 | 1.0 |
| comparison-outline | 7.8 | 7.0 | 6.5 | 7.0 | 6.0 | 1.0 |
| lp-variant-ideas | 8.0 | 9.0 | 8.5 | 5.0 | 7.0 | 1.0 |
| lead-source-diagnosis | 8.0 | 8.0 | 8.0 | 7.5 | 8.0 | 2.0 |
| local-diagnosis | 8.0 | 7.5 | 8.5 | 4.0 | 5.0 | 2.0 |
| chat | 7.5 | 7.0 | 7.0 | 5.0 | 5.0 | 1.0 |
| monthly-recap | 7.0 | 6.5 | 6.0 | 6.0 | 6.0 | 1.5 |
| channel-research | 8.0 | 7.0 | ✗ | ✗ | 7.0 | 2.0 |
| onboarding-scan | 9.0 | 8.0 | 9.0 | 8.0 | 8.0 | 3.0 |
| **průměr** | **7.88** | **7.58** | **7.21** | **6.32** | **6.67** | **1.57** |

Čtení: Sonnet zůstává stropem kvality; Opus ho neporáží (a rozhodčí je jeho
sourozenec — home-team bias u obou CLI sloupců). **qwen3.8-max je nejsilnější
BYOM kandidát** (7.21, ~$0.21 za celý průchod), deepseek-v4-flash je cenový
outlier (6.67 při ~$0.012). Lokální 8B model je pro česky-first produkt
**nepoužitelný** — rozhodčí dokládá pseudočeštinu, únik CJK znaků a anglické
fallbacky; tentýž model přitom na anglických úlohách sesterského projektu
dosahoval ~4.9/10. Kompletní reporty: `test-llm/quality/reports/`, metodika:
[`docs/testing/llm-quality-matrix.md`](docs/testing/llm-quality-matrix.md).

## Rychlý start

```bash
npm install
npm run dev          # http://localhost:3000
```

Veřejné stránky běží **bez jakékoli konfigurace** (ukázková data jsou v repu).
AI funguje i bez klíče v deterministickém ukázkovém režimu; s klíčem viz níže.

```bash
npm run build        # produkční build
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run test:unit    # jednotkové testy (node --test)
npm run check:ci     # celá CI brána jedním příkazem
npm run doctor       # preflight: co tvůj .env.local zapíná
```

## Stack

**Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind v4.**
Data: Firestore (produkt) + JSON v repu (ukázky) + `node:sqlite` (lokální
rate-limit). Bez chart knihovny — vlastní SVG grafy. Dvojjazyčné cs/en přes
kolokované slovníky (`src/lib/i18n/`).

### LLM wrapper — jeden chokepoint

Všechna volání LLM jdou přes `src/lib/llm`: v devu **Claude Code CLI** (využívá
předplatné), v produkci **Gemini**; BYOM uživatelé přepínají OpenAI / Gemini /
Claude vlastním klíčem. Strukturovaný výstup podle schématu, stejný kontrakt u
všech providerů. Každý call site má test proti reálnému modelu s prove-once
bránou v pre-commitu (`npm run llm:gate`).

```bash
# Dev — stačí přihlášené Claude Code:
claude            # ověřte přihlášení
npm run dev

# Produkce — Gemini:
cp .env.example .env.local   # doplňte GEMINI_API_KEY
```

## Nasazení (Vercel)

1. Import repozitáře na [vercel.com/new](https://vercel.com/new) — veřejné
   stránky nasadíte bez další konfigurace.
2. Plné `/app` rozhraní vyžaduje `AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`,
   Firestore a `CRON_SECRET` (+ volitelně Resend a Creative Studio klíče).
   Kompletní postup: [`SETUP.md`](./SETUP.md).

Kanonická URL se řeší env-first (`NEXT_PUBLIC_SITE_URL` →
`VERCEL_PROJECT_PRODUCTION_URL` → fallback) — viz `src/lib/site.ts`.

## License & self-hosting

*(Anglicky — tato sekce míří na open-source publikum; detaily jsou v
[`docs/open-source/`](./docs/open-source/).)*

Adamant is licensed under **AGPL-3.0-only** ([`LICENSE`](./LICENSE)).

**It is meant to run on your machine, on your models, on your data.** Nothing is
held back from this repository to sell elsewhere: the reporting, the campaign
intelligence, the content engine and all of its AI operations, Creative Studio,
the brand-voice twin, keywords, local SEO and the catalog spine are the whole
product, not a trial edition. A self-hosted install is intended to be **unmetered
— no plans, no quotas** — because the metering that exists is cost control on the
operator's own provider bill, and in a self-hosted install that operator is you.
There is no analytics SDK in the tree and nothing phones home by default.

A **hosted version** exists for teams who would rather not run servers. It is the
same software with the operations handled — hosting, backups, upgrades, managed
crons, a public HTTPS origin, and the approved provider credentials (a Google Ads
developer token, a Sklik token, reviewed platform apps) that cannot be shipped
inside an open repository. It is not a better version.

> **Status: not there yet.** A production build currently *requires* Firestore
> and Google OAuth, so self-hosting does not work today. What has to change,
> with file-level evidence, is in
> [`docs/open-source/impact.md`](./docs/open-source/impact.md); the agreed design
> for the fix — self-host mode, the auth seam, SQLite as a production store,
> BYOM/Ollama, packaging, crons, and a full external-egress inventory — is in
> [`docs/open-source/self-hosting.md`](./docs/open-source/self-hosting.md).

> **Note on the AGPL.** Run it internally however you like. If you modify Adamant
> and offer it to others over a network, §13 requires you to offer those users
> your modified source.

Contributions are welcome under a CLA — see [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for the setup and the verification gate, [`CLA.md`](./CLA.md) for why the CLA
exists, and [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). Security issues go
through [`SECURITY.md`](./SECURITY.md), never a public issue.

## Historie projektu

Adamant vznikl z případové studie („Systedo case study“). Původní zadání,
zdůvodnění stacku a popis jednotlivých úkolů jsou zachované beze změn v
[`docs/case-study.md`](./docs/case-study.md).
