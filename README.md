# Adamant — AI inteligence pro reklamu

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38BDF8?logo=tailwindcss&logoColor=white)
![Quality gate](https://img.shields.io/badge/check-typecheck%20%C2%B7%20lint%20%C2%B7%20build-2ea44f)

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

## Historie projektu

Adamant vznikl z případové studie („Systedo case study“). Původní zadání,
zdůvodnění stacku a popis jednotlivých úkolů jsou zachované beze změn v
[`docs/case-study.md`](./docs/case-study.md).
