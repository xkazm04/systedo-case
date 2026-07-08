# UAT L1 — Ilona (handmade e-shop maker) · Journey: "A week of promo, fast"

- **Character:** Ilona — one-person handmade maker, marketing/analytics novice, hates jargon, wants pretty + fast + human.
- **Surface:** `eshop` (demo-eshop = "Mionelo", nuts/seeds/superfoods catalog)
- **Cert level:** L1 (theoretical, code-grounded, no browser)
- **Journey:** `uat/journeys/week-of-promo-fast.md`
- **Date:** 2026-07-08

---

## Ilona's review (in her voice)

Okay, so I opened this at 10pm with a cup of tea, dreading it a bit — the last "AI marketing" thing drowned me in charts. But the thing I landed on first (the **Přehled**) had "ROAS" and "PNO" in big numbers right at the top, and my stomach dropped a little. *I don't know what PNO is and I don't want to.* I almost closed it. But there's a nice sidebar with a **Tvorba** ("make stuff") group, and under it: **Sociální sítě**. That's my happy place, so I clicked.

And honestly? This is the good part. There's a **"Plán týdne"** box — I type a few post ideas, one per line ("Nová zimní směs ořechů", "Tip: ořechy do ranní kaše", a little brand story), pick Instagram, pick a friendly tone and a time, and hit **"Naplánovat týden."** It writes a caption for each and drops them onto a little 7-day calendar. One click, a week of posts. That is *exactly* the thing I never have time to do. And there's a green box that says **"Píše na značku"** and actually lists what I sell and how I talk — so I believe it knows it's *my* shop, not some generic company. That's the bit that won me: it didn't hand me a blank box and say "good luck."

Two things poked me, though. First, I also wanted **pretty pictures**, not just words. The **Kreativa** studio is a blank prompt box — "describe the scene, style, colors, mood." That's the exact overwhelm I hate; I'm a maker, not a photographer-writer. There's a "Fill example" button and I *can* upload my own product photo to keep it, which is lovely, but it doesn't know anything about my shop on its own — I have to describe everything from scratch.

Second, I saw **"Produktová kreativa"** and thought *ooh, make posts from my products!* Nope. It's "Asset group", "PMax / RSA", "headline 30 znaků", "Export CSV for Google Ads Editor." That's not for me at all — that's for someone who runs Google Ads. And it decided my audience is "parents looking for quality baby equipment"… but I sell **cashews and chia seeds**. So even the bit that *is* about my products is talking to the wrong people.

So: the caption-batching is a genuine "I'd do this every Sunday" win. The pretty-pictures side still feels like homework, and one of my "home" tabs is really an ad-manager's tab in disguise.

---

## Reachability check (eshop)

All four of Ilona's home modules resolve for `eshop` (`src/lib/projects/modules.ts`):
- `socialni` — availableFor includes `eshop` (line 130) ✓
- `kreativa` — `["eshop","content"]` (line 140) ✓
- `produktova-kreativa` — `["eshop"]` (line 181) ✓
- `klicova-slova` — `ALL` (line 90) ✓

No dead ends. **Reachability: pass.**

## Grounding audit (per AI surface)

| Surface | Real product reaches prompt? | Score |
|---|---|---|
| Social draft (WeekPlanner + Composer) | Yes — brand-voice field, **auto-derived catalog voice** (brand name, sortiment, price band, differentiators, channels), perf + competitor grounding, `projectId` all flow to `socialSystem()`/grounding block | **5/5** |
| Creative Studio (Kreativa) | No auto-grounding — prompt + brand-kit are blank/manual; no catalog or product picker. Only a manual reference-image upload | **0/1 auto** |
| Produktová kreativa (ads copy) | Product title + USPs reach the `ads` tool, **but `audience` is hardcoded** to baby-equipment shoppers while the catalog is nuts/seeds | **2/3** |

**Journey grounding: strong on the path she'd actually use (social), weak-to-wrong on both visual/product surfaces.**

## Jargon / ease audit

- Her fastest path (Sociální sítě → Plán týdne) is **plain-language, no analytics jargon, no "connect ad account" wall** — a big win. Template + AI both work keyless.
- The **Přehled** landing tile she sees first foregrounds `ROAS` and `PNO` (`KPI_PRESETS.eshop`, `modules.ts:412-417`) — her exact pet peeve, on the first screen.
- **Produktová kreativa** is wall-to-wall ad jargon (Asset group / PMax / RSA / char limits / Google Ads Editor CSV).

---

## Findings

### F1 — STRENGTH: "Plán týdne" delivers a postable week in one click, on-brand by default
- **type:** strength · **dimension:** completion / time-saved · **severity:** polish
- **expected:** From products → a batch of postable captions in one short sitting, in her voice, no ad account.
- **got:** `WeekPlanner` fans N topics × selected platforms into one AI run, schedules them onto a 7-day calendar, and defaults the brand voice to the auto-derived catalog context ("Píše na značku" green strip) — `src/components/social/WeekPlanner.tsx:201-256, 268-279`; server grounding in `src/app/api/social/draft/route.ts:178-195`; brand derivation `src/lib/brand/context.ts:37-88`.
- **verdict:** confirmed · **l2_priority:** high (verify the captions actually read human/on-brand live)

### F2 — Creative Studio is a blank canvas with no link to her catalog
- **type:** quality-gap (confusion) · **dimension:** effort / senior-quality · **severity:** minor
- **impact:** frequency=high, reachability=high, trust_erosion=low
- **expected:** Point at a product → get pretty, on-brand product visuals (her second job: "good-looking posts").
- **got:** `CreativeStudio` opens on an empty prompt + empty manual brand-kit; no product/catalog picker and no auto-brand (unlike Social). Mitigated by a "Fill example" prompt and an optional product-photo upload, but she must author the whole scene herself. `src/components/ai/CreativeStudio.tsx:180-186, 429-503`.
- **evidence:** `src/components/ai/CreativeStudio.tsx:429-438`, `:491-503`
- **verdict:** confirmed · **l2_priority:** medium
- **scope_note:** Social auto-grounds from the catalog; Creative Studio does not — the two "Tvorba" surfaces are inconsistent.

### F3 — The only product-grounded creative surface is an ad-manager tool with an off-brand audience
- **type:** quality-gap + trust · **dimension:** senior-quality / clarity · **severity:** major
- **impact:** frequency=medium, reachability=high (it's one of her four home tabs), trust_erosion=high
- **expected:** "Produktová kreativa" reads to a maker as "make creative from my products."
- **got:** It generates Google Ads asset groups — "Asset group · PMax / RSA", headline/description char limits, "Export CSV" for Google Ads Editor — pure ad-ops jargon (`src/components/app/modules/CatalogModule.tsx:25-84, 276-303, 378-382`). Worse, the AI call **hardcodes** `audience: "Rodiče a budoucí rodiče hledající kvalitní dětské vybavení"` (parents seeking baby equipment) while the seeded catalog is nuts/seeds/superfoods (`CatalogModule.tsx:197-207` vs `src/lib/catalog/sample.ts:29-93`) — an off-brand grounding leftover from the real Mionelo brand. The `ads` tool faithfully renders whatever audience it's handed (`src/lib/ai/tools/ads.ts:36`).
- **evidence:** `src/components/app/modules/CatalogModule.tsx:204`, `src/lib/catalog/sample.ts:36-38`, `src/lib/ai/tools/ads.ts:36`
- **verdict:** confirmed · **l2_priority:** high

### F4 — Her landing screen leads with ROAS/PNO
- **type:** confusion · **dimension:** clarity / first-impression · **severity:** minor
- **impact:** frequency=high (every visit), reachability=high, trust_erosion=medium (her "makes me feel stupid → I'm gone" trigger)
- **expected:** A maker's overview greets her with something she recognizes.
- **got:** `KPI_PRESETS.eshop` puts `Obrat, ROAS, PNO, Konverze` as the four headline tiles — two are acronyms she explicitly rejects (`src/lib/projects/modules.ts:412-417`). She *can* navigate to Sociální sítě, so it's not a blocker, but it's a bad first two seconds for exactly this persona.
- **verdict:** confirmed · **l2_priority:** low

---

## Verdict

- **Journey verdict:** **L1-pass** — her fastest, most-likely path (Sociální sítě → Plán týdne) fully satisfies the journey's Definition of Done: a batch of on-brand, plain-language captions in one sitting, with no ad account and no margins, and it's designed to be repeated weekly. The failings (F2–F4) sit on the *visual* half of her job and on adjacent tabs, not on the caption-batching critical path.
- **Grounding score:** Social **5/5** (strong); Creative **0/1** auto; Product-creative **2/3** (off-brand audience). Path-weighted: strong.
- **Time-saved if it works:** ~2 hrs of weekly caption writing → ~15–20 min of typing topics + tweaking. **High confidence** for captions; **low confidence** the visuals half saves her time (still a blank-canvas + manual brand kit).
- **Biggest L2 risk:** whether the AI captions actually sound human/on-brand rather than robotic (F1), and the off-brand audience in Produktová kreativa (F3).
