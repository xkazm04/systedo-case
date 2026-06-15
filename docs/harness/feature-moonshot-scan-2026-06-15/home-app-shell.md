# Feature + Moonshot Scan — Home, App Shell & Transitions

> Context: ctx_1781547850483_lvnrj7h
> Lenses: Feature Scout 🔍 + Moonshot Architect 🌙
> Total: 5

## 1. Live "stav klienta" pásek nad rozcestníkem (pacing + projekce z monthlyPacing)
- **Severity**: High
- **Lens**: feature-scout
- **Category**: feature
- **Effort**: M (1-3d)
- **File**: src/app/page.tsx (Hero `heroStats` / client snapshot card) + src/lib/metrics.ts (`monthlyPacing`)
- **Scenario**: Hodnotitel přijde na rozcestník a vidí čtyři statické součty za rok (`totalsOf(trailingYear)`) a obrat za 30 dní. Mezitím v `metrics.ts` leží plnohodnotný `monthlyPacing()` engine s prorated cílem, seasonality-weighted projekcí měsíce a `onPace`/`willHitGoal` flagy — ale na home page se nepoužije vůbec. Domovská stránka tak vypadá méně chytře než data, která má k dispozici.
- **Opportunity**: Do client snapshot karty přidat jeden živý "pacing" řádek: "Tento měsíc: {mtd} / cíl {goal} — {onPace ? 'na plán' : 'pod plánem'}, projekce {projection} ({attainment})". Použít existující `monthlyPacing(performance.daily, goal)` (goal už existuje v datasetu, ten samý čte dashboard) a barevně označit přes `goodDirection` logiku. Žádná nová data, jen napojení hotového výpočtu na hero.
- **Impact**: Rozcestník okamžitě působí jako produkt, ne jako odkazovník — návštěvník vidí "appku, která myslí" dřív, než klikne. Demonstruje, že kandidát staví derived metriky z jednoho zdroje pravdy (silný signál pro PPC/analytics roli).
- **Implementation sketch**: V `HomePage()` zavolat `monthlyPacing(performance.daily, performance.client.monthlyGoal)` (ověřit přesný název goal pole v datasetu/`types.ts`), přidat řádek do client snapshot karty mezi obrat a `heroStats`, formátovat přes `fmtCZKCompact`/`fmtPct`. Reuse `Pill tone` pro on/off-pace badge.

## 2. OG-image, sitemap a indexovatelnost app shellu (sdílení case study)
- **Severity**: High
- **Lens**: feature-scout
- **Category**: integration
- **Effort**: M (1-3d)
- **File**: src/app/layout.tsx (`metadata`, `robots`) + nový `src/app/opengraph-image.tsx` + `src/app/sitemap.ts` + src/lib/site.ts (`canonical`)
- **Scenario**: `layout.tsx` definuje pěkné OG title/description, ale **chybí OG obrázek** — sdílení odkazu na case study (LinkedIn, e-mail náboráři) vykreslí prázdný/generický náhled. Navíc `robots: { index: false, follow: false }` a žádná `sitemap.ts`/`robots.ts`, takže nasazená studie není dohledatelná ani správně sdílitelná. `site.ts` přitom už exportuje `canonical()` a `SITE_URL` přesně pro tyto absolutní odkazy.
- **Opportunity**: Přidat dynamický `opengraph-image.tsx` (Next.js ImageResponse) renderující značku + headline hero stat (např. roční ROAS z `totalsOf`) na brandované pozadí; přidat `sitemap.ts` generovanou z `NAV_ITEMS` (reuse `canonical(item.href)`); zvážit přepnutí `robots.index` na true pro produkční doménu (env-gated přes `SITE_URL`).
- **Impact**: Case study se stává sdílitelným artefaktem — náborář vidí profesionální náhled místo prázdného rámečku. Generování OG z `NAV_ITEMS` + reálných metrik ukazuje stejnou "single source of truth" disciplínu jako navigace.
- **Implementation sketch**: `src/app/opengraph-image.tsx` s `export const size`/`contentType` a `ImageResponse`; číst `totalsOf(performance.daily.slice(-365))` pro číslo v obrázku. `src/app/sitemap.ts` mapuje `NAV_ITEMS` → `{ url: canonical(i.href) }`. Env-gate `robots` v `layout.tsx` podle `process.env.NEXT_PUBLIC_SITE_URL`.

## 3. Směrová "view transition" napříč routami místo prostého opacity fade
- **Severity**: Medium
- **Lens**: feature-scout
- **Category**: functionality
- **Effort**: M (1-3d)
- **File**: src/app/template.tsx + src/app/globals.css (`.animate-fade-in`, `@keyframes fadeIn`)
- **Scenario**: `template.tsx` re-mountuje na každou navigaci a hraje jednotný `animate-fade-in` (opacity 0.4s) — komentář správně vysvětluje, proč žádný transform (sticky TOC, tooltipy). Je to ale stejné pro každý přechod a nevyužívá nativní View Transitions API (Next 16 + React 19 ho podporují). Přechod je tak "kosmetika", ne "řemeslo", které footer slibuje.
- **Opportunity**: Zapnout `experimental.viewTransition` / `unstable_ViewTransition` a obalit `children` ve `template.tsx`, plus pár `::view-transition-group` pravidel v `globals.css` pro jemný shared-element morph loga/headeru. Zachovat opacity-only fallback pro prohlížeče bez podpory a respektovat už existující `prefers-reduced-motion` blok (ten dnes fade efektivně vypíná — žádaná vlastnost).
- **Impact**: Navigace mezi dashboardem ↔ článkem ↔ AI nástrojem působí jako jedna aplikace, ne čtyři stránky. Pro "AI Vibecoder" pozici je to viditelný důkaz znalosti nejnovějšího Next/React rendering modelu — přesně to, co `STACK_REASONS` slovy tvrdí.
- **Implementation sketch**: V `next.config` povolit View Transitions; ve `template.tsx` podmíněně použít `<ViewTransition>` wrapper s feature-detekcí (`document.startViewTransition`); přidat `@view-transition { navigation: auto; }` + brandované `::view-transition-old/new(root)` keyframes do `globals.css` vedle stávajících `@keyframes fadeIn`. Ponechat `.animate-fade-in` jako fallback třídu.

## 4. Stack-justifikace jako interaktivní, ověřitelný důkaz (moonshot — "case study, která se sama dokazuje")
- **Severity**: High
- **Lens**: moonshot-architect
- **Category**: user_benefit
- **Effort**: L (>3d)
- **File**: src/app/page.tsx (`STACK_REASONS`, "Jak to spustit" sekce, task cards) + nová `src/app/proc-stack/` data vrstva
- **Scenario**: Sekce `#proc-stack` tvrdí čtyři věci ("Stránka = soubor", "Server-side klíče", "Data bez DB", "Výkon a SEO") jako statické claimy v `STACK_REASONS`. Náborář je musí brát na slovo. Footer i hero slibují "produkční řemeslo" a "datovou konzistenci", ale rozcestník zatím jen tvrdí, nedokazuje.
- **Opportunity**: Proměnit každý stack claim na živý, klikací důkaz: u "Server-side klíče" tlačítko, které spustí reálné API volání a ukáže, že klíč v Network tabu není; u "Výkon a SEO" živé Lighthouse/Web Vitals číslo (z `web-vitals` reportéru) přímo na kartě; u "Data bez DB" odkaz "ukázat zdroj" otevírající skutečný JSON soubor; u "Stránka = soubor" mini-mapa `NAV_ITEMS` → cesta souboru. Případně přidat skrytý `?audit=1` mód, který každou kartu doplní o měřený fakt.
- **Impact**: Z portfolio stránky se stává sebe-ověřující demo — kandidát neříká "umím produkční Next", stránka to **změří před očima hodnotitele**. To je kategorie-definující rozdíl mezi "hezkým case study" a "nejlepší case study, jakou agentura viděla", a přímo plní příslib z hero ("produkční řemeslo").
- **Implementation sketch**: Klient komponenta `StackProof` nahradí statické dlaždice; integrovat `web-vitals` (`onLCP`/`onINP`) do hero a publikovat čísla do karty; přidat malou route handler `/api/stack-check` demonstrující server-only klíč; zdrojové odkazy generovat z `NAV_ITEMS.href` → odpovídající `src/app/.../page.tsx`. Začít S verzí (Web Vitals badge), pak vrstvit důkazy.

## 5. App shell jako konfigurovatelná case-study šablona / "portfolio-in-a-box" (moonshot — platforma)
- **Severity**: Medium
- **Lens**: moonshot-architect
- **Category**: automation
- **Effort**: L (>3d)
- **File**: src/lib/nav.ts (`NAV_ITEMS`, `categoryHubPath`, `slugify`) + src/lib/site.ts + src/app/layout.tsx (`metadata`) + src/app/page.tsx (`STACK_REASONS`, `heroStats`)
- **Scenario**: Celý app shell už je řízený daty: `NAV_ITEMS` je jediný zdroj pravdy pro header/footer/home karty, `site.ts` resolvuje origin z env, metadata jsou centralizovaná, a `categoryHubPath`/`slugify` napovídají plánovaný blog hub. Všechna značka, claimy a klient (`Mionelo`) jsou ale rozeseté jako hard-coded řetězce po `page.tsx`. Pro jednoho člověka je to případová studie; jako šablona je to nevyužitý multiplikátor.
- **Opportunity**: Extrahovat brand/klient/claim obsah do jednoho `src/lib/case.ts` (název klienta, segment, hero copy, `STACK_REASONS`, tagy stacku) a celý shell (layout metadata, hero, rozcestník, footer) z něj generovat. Tím vznikne "vyměň jeden config a máš novou case study" šablona, kterou může agentura Systedo použít pro každého uchazeče/klienta — případně i veřejný generátor "vytvoř si marketingovou case study".
- **Impact**: Z jednorázové žádosti o práci se stává znovupoužitelný produkt a network-effect artefakt: každá další case study postavená na šabloně je reklamou na kandidáta/agenturu. Demonstruje produktové myšlení (ne jen "splnil jsem zadání"), což je nejsilnější diferenciátor pro seniorní marketingově-technickou roli.
- **Implementation sketch**: Vytvořit typovaný `CaseConfig` v `src/lib/case.ts`; přesměrovat `metadata` v `layout.tsx`, `heroStats`/`STACK_REASONS`/copy v `page.tsx` a footer texty na config; `NAV_ITEMS` rozšířit o per-case enable flagy. Pak doložit "druhou case study" jako důkaz znovupoužitelnosti (stejný shell, jiný config) — minimální MVP platformy.
```
