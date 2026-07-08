# L1 UAT — Alena (solo local service owner) · Journey: Own my local map

- **Character:** alena-solo-local-service
- **Journey:** own-my-local-map
- **Cert level:** L1 (theoretical, code-grounded, no browser)
- **Surface:** `local` project type — demo-local, "Dentalis" (dental clinic)
- **Date:** 2026-07-08
- **Modules walked:** Mapa & pozice, Recenze, Lokální dominance (+ glance at Obsah — plán)

## Reachability check
All four of my rooms are wired into the `local` sidebar. `src/lib/projects/modules.ts` gives `local` the modules `recenze` (110), `mapa` (264), `lokalni` (254), `obsah-plan` (120), `rychla-reakce` (244) plus the shared set. No dead links — I can reach every surface the journey names. Good start.

## First person (Alena)
I've got maybe twenty minutes before my next patient. First question, always: **am I showing up on the map or not, and who's above me?**

**Mapa & pozice.** There's a real map — actual OpenStreetMap tiles, my pin ringed, five businesses in the pack with ranks, ratings, review counts, share of clicks, and a keyword ladder underneath. That's genuinely the picture I want. But when I read the names of who's beating me — "Studio Alfa", "Atelier Vega", "Centrum Nova" — I don't recognize a single one, and none of them sound like a dental practice. My whole reason for opening this is "why is the place *down the street* above me?" and these names can't answer that, because they're made up. The footer does say "ukázková pozice / ilustrativní data," so at least it's honest, but it means I can't act on the ranking. And nowhere does the map tell me **what to fix first** — it shows me the standings and stops. I have to go hunting in another module for the "so what."

**Recenze.** This is the part that would actually make me keep the app. My inbox, sentiment bar up top, filter by rating/area/unanswered. I hit "Navrhnout odpověď" on a review and it drafts a reply that references what the reviewer actually said — I can edit it, there are quick macros, I copy it and mark it answered, and the state sticks. That's the "answer three reviews in ninety seconds" I never manage by hand. No complaints here.

**Lokální dominance.** The coverage table is exactly my language: each of my services (Dentální hygiena, Implantáty, Ortodoncie, Pohotovost) × each city, colour-coded by rank, plus a **gaps** table listing locality, service, monthly search volume, and "chybí stránka." Concrete gaps, sorted by volume — not a mystery "SEO score." That's what I want to see. But then the "Nejnovější recenze" panel at the bottom shows reviews about **air-conditioning installation** ("Rychlá montáž klimatizace, technici dorazili na čas"), and when I ask it to draft a reply it's clearly writing for an AC company, not a dental clinic. For a tool that's supposed to know my business, that's a jolt — it's the exact "generic reply that could be for any business" I can't stand, except worse, because it's confidently the *wrong* business.

**Verdict in my head:** the review inbox and the gaps table are keepers. The map's fake competitor names and the wrong-industry reputation panel make me trust it less, and the map never tells me the one thing to do first.

## Findings

### F-ALENA-MAP-01 — Map pack shows fictional, non-local competitor names
- **type:** trust · **severity:** major
- **expected:** the map pack names real local competitors I'd recognize ("the place down the street") so I can see who's outranking me and why.
- **got:** rivals are drawn from a fixed six-name placeholder list — "Centrum Nova / Studio Alfa / Klinika Prima / Rodinné centrum / Expert Plus / Atelier Vega" — none real, none dental-flavoured. Coordinates are real; the names are not.
- **evidence:** `src/lib/mappack/sample.ts:22-29` (RIVAL_NAMES), `src/lib/mappack/sample.ts:63-66` (pickRivals), `src/lib/mappack/sample.ts:77-91` (packForArea assigns rivals), `src/components/app/modules/MapPackClient.tsx:33` ("Ilustrativní data")
- **code_check:** confirmed — competitor names are a static placeholder array; the real seam is a SERP/Places aggregator (noted in the file header).
- **verdict:** confirmed
- **scope_note:** fixture/integration seam — honest "ukázková pozice" labelling reduces but does not remove the trust hit; my signature question stays unanswerable.
- **l2_priority:** high

### F-ALENA-MAP-02 — Map/rankings view gives no "fix this first" action
- **type:** confusion (missing on-surface) · **severity:** minor
- **expected:** per my acceptance bar, the map view pairs "where I stand vs competitors" with **a clear first action**.
- **got:** MapPackModule renders the map, ranked pack, share-of-voice and keyword ladder — no recommendation or prioritized next step. The concrete next actions live one module away (Lokální dominance gaps table).
- **evidence:** `src/components/app/modules/MapPackModule.tsx:33-48`, `src/components/app/modules/MapPackClient.tsx:154-245` (no action affordance), cross-ref `src/components/app/modules/LocalModule.tsx:175-210` (gaps table lives elsewhere)
- **code_check:** confirmed — no prescriptive action on the map surface.
- **verdict:** confirmed
- **l2_priority:** medium

### F-ALENA-LOKAL-03 — Lokální dominance reputation panel is hardcoded to the wrong industry (AC/electrical) for a dental clinic
- **type:** trust (broken grounding) · **severity:** major
- **expected:** the reputation reviews and the AI reply context match Dentalis (dental).
- **got:** `LocalModule` passes `businessType="montáž a servis klimatizací a elektroinstalací"` into `LocalReviews`, and the recent-reviews fixture is about air-conditioning installation. The `local-review-reply` prompt therefore receives the wrong business type; replies read as if for an AC company.
- **evidence:** `src/components/app/modules/LocalModule.tsx:229` (hardcoded businessType), `src/lib/local/sample.ts:70-99` (AC-themed SAMPLE_RECENT_REVIEWS), `src/components/app/modules/LocalReviews.tsx:111-117` (feeds businessType into the run), `src/lib/ai/tools/local-review-reply.ts:42-43` (businessType → prompt)
- **code_check:** confirmed — literal AC/electrical string in a dental-clinic project.
- **verdict:** confirmed
- **scope_note:** secondary review surface; the primary Recenze inbox is correctly grounded (businessType from the catalog category), so the blast radius is the Lokální dominance panel only.
- **l2_priority:** high

### STRENGTH — Recenze inbox: review replies fully grounded + approve-and-send
- **type:** quality (positive) · **dimension:** Trust / Senior-quality
- The reply prompt receives the **actual review text**, rating, area, a clean business name, and the catalog business-type; per-review draft editor, saved-reply macros, copy, mark-answered, and server-side persistence make it a real seconds-long approve-and-send. An empty model reply self-repairs once before the canned floor.
- **evidence:** `src/components/app/modules/ReviewInbox.tsx:176-188`, `src/lib/ai/tools/local-review-reply.ts:30-53,98-101`, `src/app/api/ai/route.ts:317-319`

### STRENGTH — Lokální dominance surfaces concrete service×location gaps, not a score
- **type:** quality (positive) · **dimension:** Missing pieces / Clarity
- The gaps table is locality × service × monthly volume × "chybí stránka," built from the real Dentalis catalog (`targetsFromCatalog`), sorted by opportunity — exactly the concrete gap list her bar demands.
- **evidence:** `src/components/app/modules/LocalModule.tsx:175-210`, `src/app/app/[projectId]/lokalni/page.tsx:21-23`, `src/lib/catalog/seeds.ts:133-170`

## Grounding audit (per AI/data surface)
- **Recenze review reply:** 5/5 — actual review text + rating + area + clean brand + catalog business-type all reach the prompt.
- **Map pack:** 1/2 — real geo/coordinates, but competitor **names are placeholders**; no AI on this surface.
- **Lokální dominance matrix/gaps:** 1/1 — catalog-grounded dental services × localities.
- **Lokální dominance reputation reply:** 0/1 — wrong-industry (AC) businessType injected.

**Journey grounding: 7/9.**

## Time-saved (if it worked)
Manual map-position checks + writing review replies by hand is ~2–3 h she never finds; the Recenze inbox + gaps table genuinely compress the review + gap-triage half to ~10 min. **Time-saved: high, confidence medium** — the review workflow is real senior-grade; the map's fake names and the AC reputation panel cost trust on the "where do I stand" half.

## Verdict: **L1-conditional**
She can see her position and answer reviews brilliantly, and the gaps table is exactly right. But fictional competitor names undercut the core "who's beating me and why," the map offers no first action, and the Lokální reputation panel drafts wrong-industry replies. Fix the three findings and this is an L1-pass.
