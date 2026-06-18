# Feature Scout — Klíčová slova (`/app/[projectId]/klicova-slova`)

> Module: src/components/app/modules/KeywordsModule.tsx
> Project type: all
> Total: 5 ideas

## 1. Sémantické shluky klíčových slov (intent clustering → pilíř + podtémata)
- **Category**: feature
- **Impact**: 9
- **Effort**: 5
- **Risk**: 3
- **Gap today**: Výsledek je jediný plochý seznam seřazený podle příležitosti (`KeywordResearch.tsx:280-289`), členěný jen třemi filtry záměru (`intentsPresent`, `KeywordResearch.tsx:262-278`). Slova jako „ořechy recenze“, „nejlepší ořechy“, „ořechy srovnání“ se nikde nesdruží do jednoho tématu — uživatel ručně přebírá 16+ návrhů a sám hádá, co patří na jednu stránku.
- **Proposal**: Server-side shlukování přes existující LLM wrapper (`generateStructured`, `src/lib/llm/index.ts:129`) nad `result.ideas`: vrátí 3–6 shluků (název tématu, pilířové slovo, podslova, součet objemu, dominantní záměr). UI nad/místo plochého seznamu zobrazí rozbalitelné karty shluků; „Vytvořit brief“ pak může jet po celém shluku, ne jen po zaškrtnutém výběru (rozšíření `createBrief`, `KeywordResearch.tsx:96-111`). Deterministický fallback (n-gram/kořen slova) zachová chování bez klíče.
- **User value**: Z výzkumu rovnou vznikne struktura obsahu (pilíř + podstránky) místo seznamu, který se musí ručně rozkrájet — to je hlavní práce SEO specialisty.
- **Fit**: Přímo navazuje na předání do obsahového modulu (`onCreateBrief` → `/obsah`); shluk = brief. Pasuje na všechny typy projektů.

## 2. SERP / competitor gap — kde rankuje konkurence a vy ne
- **Category**: feature
- **Impact**: 9
- **Effort**: 7
- **Risk**: 5
- **Gap today**: Formulář už přijímá „Cílovou URL“ (`KeywordResearch.tsx:173-182`) a planner ji posílá jako `urlSeed`/`keywordAndUrlSeed` (`keyword-planner.ts:61-63`), ale URL se používá jen k seedování — výsledek neukáže, kde web rankuje ani co pokrývá konkurent. Vedlejší modul `seo-compare` má model `rank`/`difficulty` (`src/lib/seo-compare/sample.ts`), ale Klíčová slova ho nevyužívají.
- **Proposal**: Druhé pole „URL konkurence“ → endpoint vrátí ke každému návrhu příznak „pokrývá vy / pokrývá konkurent / mezera“ (přes URL seed obou domén, příp. Search Console pro vlastní rank). Nový sloupec v `IdeaRow` (`KeywordResearch.tsx:311-361`) a filtr „Jen mezery“. Bez živých dat deterministický sample (po vzoru `seo-compare/sample.ts`).
- **User value**: Nejvyšší motivace u marketéra — „co umí konkurence, co my ne“. Mění nástroj z generátoru nápadů na konkurenční zbraň.
- **Fit**: Využívá už zapojené Ads/URL seedování a sjednocuje datový model se sousedním SEO modulem.

## 3. Sezónnost a trend objemu (kdy publikovat)
- **Category**: user_benefit
- **Impact**: 7
- **Effort**: 5
- **Risk**: 4
- **Gap today**: Zobrazuje se jen jediné `avgMonthlySearches` (`KeywordResearch.tsx:339`, `types.ts:25`) — žádný trend ani špička. Pro sezónní e-shop (ořechy/superpotraviny: Vánoce, dárky, novoroční „zdravě“) je načasování klíčové, ale uživatel ho z nástroje nevyčte. V repu už přitom existuje `src/lib/metrics/seasonality.ts` k využití.
- **Proposal**: Rozšířit `RawKeywordIdea` o `monthlySearches: number[12]` (Ads Keyword Planner vrací měsíční řadu; sample dogeneruje sezónní křivku přes `metrics/seasonality.ts`). V řádku mini-sparkline + štítek „Špička: prosinec“ a odvozený `trend` (rostoucí/klesající). Filtr/řazení „Sezónní příležitost teď“ podle nadcházejících měsíců.
- **User value**: Naplánuje obsah a kampaně s předstihem na špičku poptávky místo reakce pozdě.
- **Fit**: Sezónnost je jádro e-shop/leadgen plánování; opírá se o existující sezónní knihovnu a Ads data, která už klient stahuje.

## 4. Automatická těžba vylučovacích slov (negative-keyword mining)
- **Category**: functionality
- **Impact**: 7
- **Effort**: 4
- **Risk**: 3
- **Gap today**: Tag „Vylučovací“ se přiřazuje výhradně ručně klik po kliku (`SavedKeywordLists.tsx:166-180`); `aggregateNegatives` jen sjednotí, co člověk označil (`types.ts:92-102`). Nástroj nikdy nenavrhne irelevantní dotazy (zdarma, práce, recept, bazar, výroba…), které pálí rozpočet — uživatel je musí znát zpaměti.
- **Proposal**: Server vyhodnotí návrhy proti seznamu nekomerčních/irelevantních markerů (a volitelně LLM klasifikace „nákupní záměr ano/ne“) a u kandidátů zobrazí badge „Návrh: vyloučit“ + tlačítko „Označit všechny návrhy jako vylučovací“. Rozšíří mining i o dlouhý ocas z URL seedu. Výstup teče do existujícího CSV exportu pro Google Ads (`SavedKeywordLists.tsx:88-89`).
- **User value**: Šetří rozpočet hned na startu kampaně bez ručního pročítání stovek dotazů.
- **Fit**: Posiluje stávající negative/CSV workflow a most do modulu Kampaně (sdílený tenant + Ads connection).

## 5. Sledování pozic uložených slov + detekce kanibalizace
- **Category**: feature
- **Impact**: 8
- **Effort**: 7
- **Risk**: 6
- **Gap today**: Uložený seznam je statický snímek metrik z chvíle uložení (`types.ts:67-75`, „metrics snapshotted at save time“) — žádný `rank`, žádný vývoj v čase, žádná vazba na to, která URL na slovo míří. „Klíčové“ slova se po uložení nikdy znovu nezměří, takže uživatel nepozná pokles ani to, že na jedno slovo soutěží dvě vlastní stránky.
- **Proposal**: Periodické (nebo on-demand) doplnění pozice u tagovaných „core“ slov ze Search Console na úrovni tenanta; v `SavedKeywordLists` sloupec pozice + delta od minula. Detekce kanibalizace: když na jedno slovo rankuje >1 vlastní URL, červené upozornění „kanibalizace“ s návrhem konsolidace (prolink do modulu Obsah). Rozšíří `SavedKeyword`/`store.ts` o historii pozic.
- **User value**: Uložené seznamy se stanou živým monitoringem výsledků, ne jen archivem výzkumu — uzavře smyčku výzkum → publikace → měření.
- **Fit**: Mění jednorázový nástroj v „returning workflow“ (přesně cíl deklarovaný v `SavedKeywordLists.tsx:24-27`); opírá se o tenant + Google napojení, které modul už má.
