# L1 Simulated UAT — Marek (prospective buyer) · evaluate-whether-to-adopt

**Level:** L1 (theoretical, code-grounded, no browser)
**Date:** 2026-07-07 · post-phases (Phase 3 integration probes, Phase 1 usage/spend, Phase 4 account/security)
**Character:** Marek — founder/CFO of a mid-size Czech e-shop, the economic buyer. External, skeptical, ROI-first, ~2–3 min before he bounces.
**Journey:** Is this worth adopting, and can I trust it enough to take the next step? Public surfaces only, no auth.

---

## Marek, first person

Přišel jsem sem z odkazu s jedinou otázkou: *co to je, funguje to pro e-shop jako můj, co to stojí, a je to vůbec reálný produkt, nebo něčí portfolio?* Mám na to dvě, tři minuty.

**Domovská stránka.** Vypadá dobře — tmavý monolit, „Stand adamant. Ads that never crack." Jenže… je to celé anglicky. Jsem Čech, ceník mi to jinde ukazuje v korunách, ale hero, podnadpis i tlačítka („See it work", „Start free", „Works across") jsou natvrdo v angličtině (`BrandLanding.tsx:115–145`). Přežiju to, v martechu se anglicky čte, ale první dojem „je to lokalizované pro mě?" dostane škrábanec. Co oceňuju: proof band je **poctivě označený** — „the same numbers the dashboard renders… illustrative case-study data" (`BrandLanding.tsx:176–178`). Nikdo mi netvrdí, že to je testimonial reálného klienta. To je vzácná upřímnost. Zvláštní ale je, že jako „case-study client" použili **Mionelo** (`demo/projects.ts:20`) — to je reálná značka. Když to čtu jako skeptik, ptám se: jsou opravdu klient, nebo si jen půjčili jméno? Označené jako ilustrativní to sice je, takže menší věc, ale zaregistroval jsem to.

**Ceník.** Tady mě chtěli získat a málem se jim to povedlo: **tři tarify, ceny na očích, v korunách** — Free 0, Vlastní klíč 125, Pro 490, u každého co obsahuje (`cena/page.tsx` + `plans.ts:60–104`). Přesně to, co po dodavateli chci a co většina neukáže. Žádná „contact us" zeď. A pak to přijde — dole na stránce, pro každého viditelně: *„Případová studie: platební brána (Stripe) není napojená — upgrade je tenká vrstva nad polem `plan`…"* (`cena/page.tsx:27–29, 205–209`). To je přesně moje noční můra: **produkt mi sám říká, že se nedá koupit.** Placená tlačítka jsou `mailto:` (`cena/page.tsx:189–190`). A ještě to jde na **obchod@systedo.cz** — počkat, celý web se jmenuje *Adamant*, podpora jinde je *podpora@adamant.app*. Dvě firmy? Pro kupujícího dělajícího due diligence je to zmatek.

**„See it work" → živá ukázka.** Tohle je pro mě klíčové — >50 % z nás si to napřed vyzkouší. Demo bez přihlášení, celý produkt v levém railu, ukázková data. Super nápad. Klikám na to, co mě jako CFO zajímá nejvíc: **Spotřeba** (co mě AI bude stát), **Integrace** (co je vlastně napojené), **Účet & zabezpečení** (jsou moje data v bezpečí). A tady to spadne: nadpis nahoře říká „Spotřeba", ale obsah je… **přehled portfolia projektů.** Totéž „Integrace", totéž „Účet". Klikací položky v menu jsou, titulek sedí, ale tělo ukazuje něco úplně jiného (`DemoModule.tsx:386–396` — pro tyhle moduly není case, padá to do defaultu = ProjectOverview; menu je nabízí v `DemoShell.tsx:101,170–178`). Takže přesně ty tři věci, na kterých mi jako kupujícímu záleží — **kolik to stojí za provoz, co je reálně připojené, a jak je to se zabezpečením — v ukázce vůbec neuvidím.** Ostatní moduly (kampaně, obsah, zisk…) demo ukazuje bohatě a vypadají jako práce seniora. Ale ty „důvěryhodnostní" jsou slepé odkazy.

**Závěr za mě:** cena je transparentní (palec nahoru), demo je široké a vypadá seriózně, upřímnost proof bandu se cení. Ale ceník mi černé na bílém říká „tohle je case study, nekoupíš", brand se jmenuje jednou Adamant, jednou Systedo, a tři věci, kterými byste mě jako opatrného kupce měli přesvědčit (náklady / integrace / bezpečnost), jsou za přihlášením a v demu vedou na špatnou stránku. **Druhý pohled? Možná — kvůli ceně a šíři dema. Peněženku ale nevytáhnu.**

---

## Reachable-surface set (before judging)

| Surface | Reachable for Marek? | File |
|---|---|---|
| `/` homepage (hero, proof, crossroad) | ✅ public | `src/components/brand/BrandLanding.tsx` |
| `/cena` pricing (3 tiers, CZK) | ✅ public | `src/app/cena/page.tsx` |
| `/clanek`, `/ai-asistent` (proof / try-it) | ✅ public | `src/app/clanek/*`, `src/app/ai-asistent/page.tsx` |
| `/dashboard` no-login demo | ✅ public | `src/app/dashboard/page.tsx` |
| Demo → most modules (kampane, zisk, obsah…) | ✅ render richly | `src/components/demo/DemoModule.tsx` |
| **Demo → Spotřeba (Phase 1)** | ❌ menu link → falls to portfolio overview | `DemoModule.tsx:386` (no case) |
| **Demo → Integrace (Phase 3)** | ❌ menu link → falls to portfolio overview | `DemoModule.tsx:386` (no case) |
| **Demo → Účet & zabezpečení (Phase 4)** | ❌ menu link → falls to portfolio overview | `DemoModule.tsx:386` (no case) |
| `/app/[projectId]/{spotreba,integrace,ucet}` | ❌ auth-gated (buyer won't sign in) | `src/app/app/layout.tsx:28–31`, `guard.ts:20` |

**Key consequence:** the three phases this pass exists to test are, for the buyer persona, *not reachable at all* — auth-gated in the real product, and silently swallowed into the portfolio overview in the public demo.

---

## Findings

| # | Title | Severity | Type | Verdict | Evidence | Impact | Ceiling (best case if fixed) |
|---|---|---|---|---|---|---|---|
| 1 | Demo silently redirects the very Phase-1/3/4 surfaces to the portfolio overview (title says "Spotřeba"/"Integrace"/"Účet", body shows a project list) | **major** | broken-flow / confusion | confirmed | `DemoModule.tsx:386–396` (no `case` for spotreba/integrace/ucet/branding/aktivita/mesicni-report → `default` = ProjectOverview); links rendered in `DemoShell.tsx:101,170–178` | The cost/integration/security work Marek most wants to inspect is invisible to him; he sees a mislabeled overview, which reads as a broken product | Buyer sees the real usage/integration/security views (even read-only) → the phase work actually builds confidence instead of being dead weight |
| 2 | `/cena` disclaimer tells every visitor it's a "case study" and can't be bought; paid CTAs are `mailto:` | **major** | trust | confirmed | `cena/page.tsx:27–29, 205–209` ("Case study: the payment gateway (Stripe) is not wired up"), `:186–199` mailto CTAs | Directly confirms Marek's #1 pet peeve ("is this a portfolio, not a product?"); kills purchase intent | Even a "join the waitlist / start trial" that reads as a live product removes the portfolio smell |
| 3 | Brand identity split — buyer-facing contacts say both **Systedo** and **Adamant** | minor | trust | confirmed | `cena/page.tsx:189–190` `obchod@systedo.cz` vs `AccountSecurity.tsx:14` `podpora@adamant.app` | A due-diligence buyer sees two company names and wonders who he'd actually be buying from | Single consistent brand + domain across contact points |
| 4 | Homepage hero is hardcoded English for a Czech (`cs`) visitor | minor | quality-gap / locale | confirmed | `BrandLanding.tsx:115–145` (headline, subhead, CTAs, "Works across" not localized; only `T` proof labels are) | Value-prop legibility dinged for a Czech reader; rubric flags Czech vocabulary explicitly | Localized hero → value prop legible in his language within seconds |
| 5 | Real brand name/domain (Mionelo, mionelo.cz) presented as "case-study client" | polish | trust / credibility | confirmed | `BrandLanding.tsx:176–178`, `demo/projects.ts:20` | Labeled "illustrative", but a buyer who knows the brand may question whether they're really a customer | Use an obviously-fictional client, or a real one with a real, cited result |

### Honesty done right (noted, not findings — but unreachable to the buyer)
- **Integration status is genuinely honest** — `manual`/`planned`/`optional` states, live probes degrade to `false` on error, no overclaim (`integrations/compute.ts:48–82`, `status.ts:18–71`). No connector is shown "connected" that isn't. Marek just never sees it.
- **Account security checklist is honest about its own gaps** — dev-auth reads "unavailable" not fake-green, 2FA delegated to Google, GDPR deletion is an explicit *manual* request (`account/compute.ts:21–29`, `AccountSecurity.tsx:161–185`). Trustworthy — *if* a buyer could reach it.
- **Pricing transparency itself meets his #1 demand** (`cena/page.tsx`, `plans.ts:60–104`) and the proof band is honestly framed as illustrative, not a testimonial.

---

## Journey verdict (seven dimensions)

| Dimension | Score | Note |
|---|---|---|
| Completion | ⚠️ partial | Can state what/who/price/next-step in ~3 min; **cannot** verify cost-of-AI, integrations, or security — the demo dead-ends them |
| Effort | ✅ low-ish | Pricing legible fast, demo one click away; wasted clicks on 3 broken system links |
| Clarity | ⚠️ | Hero half-English; demo title/body mismatch is actively confusing |
| Trust | ❌ | `/cena` "case study / Stripe not wired" + Systedo/Adamant split + unreachable trust surfaces |
| Missing pieces | ⚠️ | By buyer norm he expects to *see* running cost & security in a trial; present in code, absent from his path |
| Time-saved (designed) | ✅ for his team | The reachable modules look senior-grade; the tool would plausibly save his team time |
| Senior-quality (designed) | ✅ where reachable | Rich, coherent module output; ❌ the broken system links read as junior/unfinished |

**Adopt / don't-adopt:** **Don't adopt now.** Worth a *second look* purely on transparent pricing + demo breadth, but he won't commit budget.

**Single biggest trust blocker:** the `/cena` disclaimer that openly states it's a case study with no live payment — it tells a buyer, in plain Czech, that this isn't a product he can buy.

---

## Grounding score

**4.5 / 5** where the buyer can actually see it. Every reachable number reconciles to a single source (homepage proof = `buildSnapshot("90d")`, the same the dashboard renders; pricing derived from `PLANS` constants; spend shaped after the real cost model; integration/security states derived, not faked). No fabrication. The failure is **reachability and flow**, not honesty of the numbers.

---

## Estimated time-saved

**Evaluation itself:** fast enough — what / who / price / next-step land inside his 2–3 min window. But it ends in *doubt*, not confidence, so the fast eval works against adoption here.
**For his team (as designed):** the reachable demo modules would plausibly beat his manual, LLM-less workflow — but the buyer surface undercuts belief before he can bank that.

---

## Phase-fix status (the reason for this pass)

| Phase | Landed in code? | Honest? | **Reachable by the buyer?** | Net for Marek |
|---|---|---|---|---|
| **3 — Integration status (live probes)** | ✅ `status.ts` live BYOM/ads/warehouse probes, honest statuses | ✅ no overclaim | ❌ demo swallows `integrace` → overview; else auth-gated | **Invisible.** Good work he never sees |
| **1 — Usage / spend transparency** | ✅ live `llmTelemetry` rollup + seed fallback, CSV | ✅ per-op/per-model, honest cost model | ❌ demo swallows `spotreba` → overview; else auth-gated | **Cost stays invisible** to the one persona (CFO) who most wants it |
| **4 — Account & security** | ✅ checklist, sign-out-everywhere, GDPR request | ✅ dev-auth caveats, manual-deletion honesty | ❌ demo swallows `ucet` → overview; else auth-gated | Trustworthy *if seen*; the honesty (manual GDPR, 2FA delegated) would give a careful buyer mild pause |

**Bottom line:** all three phases shipped and are honest in code, but for the *buyer's* journey **fix-landed ≠ reachable ≠ unblocks.** The single highest-leverage fix for this persona is not more phase work — it's exposing these three (read-only) in the public demo instead of routing their sidebar links to the portfolio overview.
