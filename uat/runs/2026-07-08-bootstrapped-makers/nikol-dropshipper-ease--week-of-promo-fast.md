# L1 UAT — Nikol (dropshipper, ease-of-use probe) · Journey: week-of-promo-fast

- **Character:** nikol-dropshipper-ease (non-technical, zero-patience, "just do it for me")
- **Surface:** `eshop` / demo-eshop
- **Cert level:** L1 (code-grounded, no browser)
- **Modules judged (reachable per `src/lib/projects/modules.ts`):** Sociální sítě, Kreativa, Produktová kreativa, Přehled
- **Verdict:** L1-pass (conditional strength — the fast paths are genuinely fast; two grounding/label snags)

## Nikol's review (first person)

Okay so I need a week of posts and I don't want to think. I clicked **Sociální sítě**. First thing on the screen after the accounts bar is **"Plán týdne"** — it literally says *"Zadejte témata (jedno na řádek), AI z nich napíše příspěvky a rozloží je na následující dny."* Yes. I type four lines, there's a green box that already says **"Píše na značku"** with my shop's voice pulled in — I didn't set that up, nice — I hit **"Naplánovat týden"** and it fills the calendar. That's the whole job in like two clicks. This is the thing I'd actually keep doing. `WeekPlanner.tsx:26,110,348`

If I want just one post there's a **Composer** right below: type a topic, hit **"Navrhnout s AI"**, click **"Použít"**, hit **"Zveřejnit teď"**. Clear. Nothing asked me to connect anything — there's a little "Ukázkový režim" note but it still works. Good, no wall. `SocialClient.tsx:459,491,547`

Then I went to **Kreativa** because I want a nice product pic. There's a **"Vyplnit ukázku"** link that fills the prompt for me, then a big **"Vygenerovat vizuál"** button. Two clicks, I get pictures, one's marked **"Nejlepší"**, I can **Stáhnout**. The empty state even tells me to do exactly that. Love it. `CreativeStudio.tsx:421,583,54`

Then I opened **Produktová kreativa** thinking "product creative = product posts/pics." Nope. It's… ad text? There's **"PMax / RSA"**, **"Asset group"**, headlines with little **30/30** counters, an **"Exportovat CSV"** for some Google Ads thing, and a footer about "limity Google Ads" and "/api/ai". I have no idea what PMax or RSA is and I don't have a Google Ads account. The button **"Generovat AI texty"** is obvious enough, but this isn't what the name promised and it's marketer-land. I'd back out. And when I did generate copy for my *cashew nuts*, the vibe felt like it was written for baby gear — weird. `CatalogModule.tsx:36,276,164,203`

**Net:** the two screens I care about (Sociální sítě, Kreativa) are exactly "it did it for me." Produktová kreativa is misnamed for me and full of ad jargon, and its copy is grounded to the wrong customer.

## Findings

### STR-1 (strength) — One-shot "Plán týdne" batch is a true do-it-for-me flow
- type: strength · dimension: Effort/Completion/Time-saved · severity: n/a
- Enter topics one-per-line → **"Naplánovat týden"** → a week of scheduled posts, brand voice auto-derived from the catalog and shown up front ("Píše na značku"). Minimal input, zero config, plain language. This is the single thing that makes her repeat weekly — protect it.
- evidence: `src/components/social/WeekPlanner.tsx:26,110,201,270,348`, `src/components/social/SocialClient.tsx:459,547`
- verdict: confirmed

### STR-2 (strength) — Kreativa: two-click visual with a teaching empty state
- type: strength · dimension: Clarity/Effort · severity: n/a
- **"Vyplnit ukázku"** pre-fills the prompt, **"Vygenerovat vizuál"** runs it; empty state hint literally says try Fill-example then Generate. Winner is auto-marked, one-click download.
- evidence: `src/components/ai/CreativeStudio.tsx:421,583,54,111`
- verdict: confirmed

### F-1 — "Produktová kreativa" is a name/expectation mismatch buried in Google Ads jargon
- type: confusion · dimension: Clarity/Missing-pieces · severity: major
- impact: frequency=high (one of her two gravitational modules), reachability=high (eshop sidebar, "Tvorba"), trust_erosion=med
- expected: "Product creative" makes product posts/visuals with minimal input.
- got: a Google Ads RSA/PMax asset-group copy tool — pill **"PMax / RSA"**, sections "Headliny/Dlouhé headliny/Popisky/Odznaky", char-count badges (30/30), **"Exportovat CSV"** (Google Ads Editor), footer about "limity Google Ads" and "/api/ai". No plain-language framing; assumes a Google Ads account/vocabulary she doesn't have.
- evidence: `src/components/app/modules/CatalogModule.tsx:36,49,164,276,52`; module blurb `src/lib/projects/modules.ts:181` ("sestavte PMax asset group")
- code_check: primary CTA exists and is obvious ("Generovat AI texty"), so this is a label→content clarity finding, not missing-feature.
- l2_priority: high · verdict: confirmed

### F-2 — Produktová kreativa AI copy is grounded to the WRONG audience (baby gear, not the nuts catalog)
- type: trust · dimension: Trust/Senior-quality · severity: major
- impact: frequency=high (every generate on this surface), reachability=high, trust_erosion=high
- expected: ad copy grounded in her actual shop (nuts/superfoods; SAMPLE_PRODUCTS are Kešu/Mandle/Chia).
- got: `generate()` hardcodes `audience: "Rodiče a budoucí rodiče hledající kvalitní dětské vybavení"` (parents seeking baby equipment) and the export/finalUrl is hardcoded `mionelo.cz` (a baby brand). Product title + USPs are grounded correctly, but the audience the model targets is a different business entirely → copy "sounds like nobody"/wrong customer.
- evidence: `src/components/app/modules/CatalogModule.tsx:203-204` (audience), `:121` (`finalUrl = mionelo.cz`)
- code_check: confirmed hardcoded literal; not derived from product/catalog.
- grounding: 2/4 fields grounded (product ✓, benefits ✓, audience ✗ hardcoded, url ✗ hardcoded)
- l2_priority: high · verdict: confirmed

### F-3 — "Seam" jargon leaks into the sample-data note she'd read
- type: confusion · dimension: Clarity · severity: polish
- got: SampleDataNote default text ends "…(viz poznámky „Seam“)" — an internal engineering term shown to a non-technical user.
- evidence: `src/components/app/SampleDataNote.tsx:8`
- l2_priority: low · verdict: confirmed

## Grounding audit (do-it-for-me surfaces)

| Surface | Required input | Grounded? | Score |
|---|---|---|---|
| Sociální sítě — Plán týdne | topics (one/line) | brand voice auto from catalog + projectId passed to `/api/social/draft` | 4/4 |
| Sociální sítě — Composer | topic | brand auto-fallback, projectId passed | 4/4 |
| Kreativa | prompt (or Fill-example) | brand kit optional; prompt-driven | 3/3 (input-light) |
| Produktová kreativa | pick SKU | product+USPs grounded, **audience+URL hardcoded to a different brand** | 2/4 |

**Journey grounding: 3 of 4 surfaces well-grounded; Produktová kreativa mis-grounds the audience.**

## Verdict

- **L1-pass** (conditional). Her two core surfaces (Sociální sítě, Kreativa) hit "it just did it for me" with obvious primary actions, minimal input, and no connect-wall. Produktová kreativa fails her on clarity (name/jargon) and trust (wrong-audience grounding) but has an obvious CTA, so it's friction not a block.
- **Clicks-to-result (if it worked):** week of posts ≈ 2 clicks (type topics → Naplánovat týden); a visual ≈ 2 clicks (Vyplnit ukázku → Vygenerovat vizuál). Well under her one-minute patience budget. **Confidence: high** (paths and defaults are in code).
