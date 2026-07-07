# L1 Simulated UAT — Marta (local-services owner) · "Dominate local search"

- **Level:** L1 (theoretical, code-grounded, no browser)
- **Character:** Marta — owner, 3-location dental & aesthetics clinic (Dentalis)
- **Project:** `demo-local` "Dentalis (demo)" · type `local` · accent `#0891b2` (seed-local-db.mjs:51)
- **Journey:** where am I invisible, fix it, get reviews answered like a human, no enquiry left waiting
- **Date:** 2026-07-07
- **Focus:** Phase 6 Review Inbox persistence (the prior-run global-localStorage leak), the Map & rankings module, local-SEO reachability

---

## Marta's review (first person)

Tak jsem si otevřela Dentalis. Konečně — **Recenze** na jednom místě: filtr podle hvězd, podle lokality, sentiment nahoře („Průměr 4,3 ★, 5 bez odpovědi"). To je přesně to, co v pondělí lovím po telefonu. Kliknu na kritickou recenzi, dám „Navrhnout odpověď" a přijde česky psaná, vstřícná omluva s nabídkou ozvat se na pobočku — ne to robotí „Děkujeme za Vaši zpětnou vazbu". U pětihvězdičkové zase vřelé, konkrétní poděkování. Tohle bych odeslala skoro bez úprav. Označím pár k vyřízení, u jedné dám „Označit majiteli" — a když se druhý den vrátím, **stav tam pořád je**. To minule nefungovalo (a bála jsem se, že mi to leze mezi kliniky). Teď je to schované u tohohle projektu a jen moje. Dobře.

Co mě brzdí: v odpovědích se objevuje název „Dentalis (demo)" — to „(demo)" bych nahoru nad recenzí nechtěla vidět, působí to jako testovací účet. A **Mapa & pozice** je hezká — reálná mapa, my vs. konkurence, podíl na proklicích, žebříček slov — ale je to jen ukázka: nemůžu s tím nic udělat a nevím, jestli tak fakt vypadá Žižkov. Nahoře svítí „Živá mapa", dole „Ilustrativní data" — to si trochu odporuje.

A hlavní díra: „aby žádná poptávka nečekala" — **tady na klinice tu schránku poptávek s časovačem vůbec nemám.** To je půlka důvodu, proč jsem přišla.

---

## Reachable-surface set for `local` (before judging)

`requireProjectModule` gates each route; availability from `modules.ts`:

| Module | route | availableFor local? | evidence |
|---|---|---|---|
| Recenze | `/recenze` | ✅ | modules.ts:120 |
| Mapa & pozice | `/mapa` | ✅ | modules.ts:271 |
| Lokální dominance | `/lokalni` | ✅ | modules.ts:262 |
| Pobočky | `/pobocky` | ✅ | modules.ts:80 |
| **Rychlá reakce** (speed-to-lead) | `/rychla-reakce` | ❌ leadgen only | modules.ts:254 |
| **Kvalita leadů** | `/kvalita-leadu` | ❌ leadgen only | modules.ts:242 |

`demo-local` "Dentalis", type `local`, exists and seeds cleanly (seed-local-db.mjs:51). recenze + mapa + lokalni + pobocky all reachable.

---

## Surface model (file:line)

**Reviews path**
- Route: `src/app/app/[projectId]/recenze/page.tsx:14` — `requireProjectModule(projectId, "recenze")`; loads persisted triage `getProjectState<ReviewInboxState>(uid, projectId, "reviews")` (:23); passes `businessName={project.name}`, `businessType={services[0]?.category}` (:35-36).
- Component: `src/components/app/modules/ReviewInbox.tsx` — persists to `/api/projects/${projectId}/state/reviews` (:127); drafts debounced 700ms (:145); `toggleFlag`/`toggleAnswered` save immediately with a feed event (:195, :203).
- State API: `src/app/api/projects/[id]/state/[key]/route.ts` — key `reviews` whitelisted (:15), ownership-checked (:26-32), 256KB cap (:24); named events `reply-published`/`flagged` emit to the activity feed (:19-22, :60-69).
- Store: `src/lib/project-state/store.ts` (dispatcher) → `store.local.ts` composite PK `(user_id, project_id, key)` (:13-36) — per-user AND per-project.
- AI op: `src/lib/ai/tools/local-review-reply.ts` — Czech system prompt tiers 4-5★ vs ≤3★ (:22-24); prompt carries businessName/area/businessType/rating/reviewText (:38-52).

**Map path**
- Route: `src/app/app/[projectId]/mapa/page.tsx:14` — `requireProjectModule(projectId, "mapa")`; `packsForProject` + `keywordLadder` from `src/lib/mappack/sample.ts`.
- Render: `MapPackModule.tsx` → `MapPackClient.tsx` (real OSM/CARTO tiles via Leaflet) + `RankLadder`. **No writes, no persistence, no actions** — read-only.

### Grounding score — review-reply surface: **5/5**
All available signals reach the prompt: `reviewText` ✅, `rating` ✅, `area` ✅, `businessName` ✅ (`project.name`), `businessType` ✅ (`services[0].category`). Caveat: `businessName` is the literal `"Dentalis (demo)"` and the system prompt says *"mluv jeho jménem"* — the `(demo)` suffix can surface in a would-be-published reply (quality, not grounding, gap).

---

## Walkthrough vs rubric + Marta's scored criteria

| Marta's acceptance criterion | Verdict | Notes |
|---|---|---|
| Coverage grid: real per-area/per-service rank, names specific gaps, not uniform/fake | Partial | `/mapa` shows per-city rank + share-of-voice, seeded per project×locality so it **varies** (not uniform — passes her fake-data peeve visually), but explicitly *"Ilustrativní data"* — read-only, can't act, not her real GBP rank. `/lokalni` (not deep-traced here) is her true coverage grid. |
| AI review replies human, tiered by star, good Czech, sendable with light edits | ✅ (designed) | Strong Czech system prompt; correct 4-5★ warm vs ≤3★ de-escalate + offline-contact; no emoji/klišé rules. Senior-front-desk quality on the designed level. Minor: `(demo)` in the name. |
| Speed-to-lead: response clock unmistakable + usable draft | ❌ unreachable | `/rychla-reakce` is leadgen-only; **not present on the `local` project** — this leg of her journey has no home on Dentalis. |
| Faster + clearer than Monday phone-Googling, no jargon | Partial ✅ | Reviews leg is a clear win (filter+sentiment+AI draft+persistent triage). Map is glance-level only. No unexplained jargon in these surfaces. |

**Trust / persistence (the headline fix):** triage is now per-`(user, project)` and server-persisted; the old global `localStorage["reviewinbox:v1"]` is **gone** (grep of `src/components/app/modules` for `localStorage`/`reviewinbox:v1` does not match `ReviewInbox.tsx`). Flag + mark-answered are immediate and land on the activity feed; drafts debounce. No remaining leak, no cross-project bleed.

---

## Findings

| # | Title | Severity | Type | Verdict | Evidence | Impact on Marta | Ceiling |
|---|---|---|---|---|---|---|---|
| F1 | Speed-to-lead / enquiry-clock has no home on a `local` project | major | missing-feature (reachability) | confirmed | modules.ts:254 (`rychla-reakce` leadgen-only), :242 (`kvalita-leadu` leadgen-only) | ~⅓ of her stated JTBD ("no enquiry waits") is unreachable on Dentalis; she'd have to run a separate `leadgen` project | Design: enquiry inbox is bound to `leadgen`; `local` gets calls KPI but no inbox |
| F2 | Map & rankings is read-only illustrative data under a "Živá mapa" header | minor | trust / quality-gap | confirmed | MapPackClient.tsx:24 ("Živá mapa"), :33/:46 ("Ilustrativní data" / "Illustrative data"); mappack/sample.ts:1 ("Illustrative … data") | She sees rank/share but can't act and can't trust it as her real Žižkov rank; "Live" vs "illustrative" reads contradictory | Intentional Phase-6 ceiling — no GBP/SERP integration; read-only demo |
| F3 | `businessName` passed as literal "Dentalis (demo)" into the review-reply prompt | minor | quality-gap | confirmed | recenze/page.tsx:35 (`businessName={project.name}`) + local-review-reply.ts:41 ("mluv jeho jménem") | A published-looking reply may carry "(demo)" in the clinic's name — hits her "sounds like a test/robot" peeve | Demo project naming; real projects won't carry "(demo)" |
| F4 | Review triage persistence — GLOBAL localStorage leak (prior run) | — | trust | **resolved** | ReviewInbox.tsx:127 (per-project API), store.local.ts:13 (composite PK) — no `localStorage` in the component | Triage now survives reload AND stays private to this clinic | n/a — fix landed & reachable |

Adversarial pass: F1 — skeptic says "out of scope, she's a local project now"; but her character `maps_to` and the journey explicitly include speed-to-lead ("no enquiry waits"), so the hole is real for *her* journey → **confirmed**. F2 — could argue the footer disclosure is enough; but the "Živá mapa" header overstates and the data is un-actionable, so it's a genuine (if intentional) ceiling → confirmed minor. F3 — verified the prompt instructs the model to speak in the business's name, so the suffix genuinely can surface → confirmed. F4 — verified by absence: grep shows no localStorage in the component and a composite-key store; **fix holds**.

---

## Journey verdict: **PARTIAL PASS**

- **Completion:** Reviews leg — yes, end-to-end and persistent. Coverage/rank leg — read-only, informative but un-actionable. Enquiry leg — **not reachable on `local`**.
- **Effort:** Low on reviews (filter → suggest → copy/macro → mark). Low on map (just look).
- **Clarity:** High; Czech throughout, no unexplained jargon on these surfaces.
- **Trust:** Reviews high (grounded, persistent, private). Map lower ("Živá mapa" vs "Ilustrativní data"). "(demo)" in replies nicks it.
- **Missing pieces:** the speed-to-lead inbox she came for (F1).
- **Time-saved:** ~1.5–2 h/week of her ~3–4 h ritual — the reviews leg genuinely replaces Monday review-chasing; the map replaces per-district Googling at a glance (but she'd still verify real rank). Enquiry chasing unchanged (no surface).
- **Senior-quality:** Review replies meet her best-front-desk bar on the designed level. Map output is presentation-grade but not decision-grade (illustrative).

### Phase-fix status
- **Reviews now per-project + server-persisted?** ✅ **YES.** Per-`(user, project, "reviews")` via the state API + node:sqlite/Firestore store; global `localStorage["reviewinbox:v1"]` removed; flag/mark-answered emit to the activity feed, drafts debounce. No cross-project leak.
- **Map ceiling?** ✅ Confirmed **read-only illustrative** by design (real OSM tiles, seeded pack/ladder, no writes) — a hard ceiling for L1 action/trust.

### Grounding score: **5/5** (review-reply surface) · Est. time-saved: **~1.5–2 h/week**
