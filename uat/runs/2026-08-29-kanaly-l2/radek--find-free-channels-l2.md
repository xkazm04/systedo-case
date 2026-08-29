# UAT L2 — Radek (bootstrapped consultant) × find-free-channels

- **Character**: `uat/characters/radek-bootstrapped-consultant.md`
- **Journey**: `uat/journeys/find-free-channels.md` (L2 checklist, catalog-first branch)
- **Certification level**: L2 (empirical, real browser, real model)
- **Surface**: `leadgen` project type, **catalog-first** entry (no website scan) —
  the variant where the plan must ground on the catalog spine plus the localities
  `localitiesFor` gives every leadgen project.
- **Engine actually used**: **Claude Code CLI, `claude-sonnet`** — `demo:false`,
  `fellBack:false`, `attempts:1`, `extraction:"direct"`.
- **Date**: 2026-08-29

## Journey verdict: **L2-fail as measured, L2-conditional after the fix landed in this run**

Radek's plan was structurally excellent and factually poisoned. The eight channels
he got are exactly the eight a sharp Czech local-services consultant would name —
Google Business Profile, Firmy.cz, Mapy.cz, an industry directory, local Facebook
groups, an SEO blog, LinkedIn, regional partnerships — ranked 90→60, every one of
them free, every one of them locality-aware. His localities reached the model
completely and visibly: the plan summary names all four cities, and six of the eight
channels have a first action that mentions Praha / Brno / Ostrava / Plzeň by name.

And then two of those channels told him to write about **"Ukázková služba A"** and
**"Ukázková služba B"** — the product's own fill-me-in placeholder rows, asserted to
the model as the services he sells, and handed back to him as advice:

> "Vytvořit článek na téma **Ukázková služba A**"
> "Vytvořit zápis s popisem **Ukázková služba A a Ukázková služba B**"

For a character whose stated distrust trigger is *"an agency sold me garbage leads
once — never again"* and whose bar is *"service pages that read as expert, not
filler"*, this is not a cosmetic blemish. It is the app telling him, in his own
language, that it does not know what he does — while charging him the attention of
reading a plan. Measured before the fix, that is a **fail** on his senior-quality
criterion, in a plan that is otherwise the best-fitting thing in the product for
him.

**Fixed in this run** (see L2-KAN-006 resolution): the grounding no longer asserts a
row the product itself wrote as a placeholder. Re-run live on a fresh leadgen
project against the fixed code, the wire request carries **no `keywords` field at
all** and the returned plan contains **zero** occurrences of "Ukázk".

## The L2 checklist, item by item

| Checklist item | Verdict | Evidence |
|---|---|---|
| Real latency of `channel-research` | **PASS** | **37.8 s wall / 36.6 s server** (`evidence/radek-11-wire-response.txt`). Re-run after the fix on a fresh project: **61.9 s wall / 49.5 s server**. Both inside the ceiling; the second is the same call on a colder webpack dev server. Against his "~30-minute weekly habit" bar this is a rounding error. |
| 6–9 named Czech channels | **PASS — 8** | GBP 90 · Firmy.cz 85 · Mapy.cz 82 · Oborový katalog služeb 75 · Facebook skupiny lokálních podnikatelů 72 · SEO blog 68 · LinkedIn 65 · Partnerství s nekonkurenčními firmami 60. After the fix, 9 channels of the same shape. |
| **Localities reach the plan / local channels appear** | **PASS, emphatically** | `localities: ["Praha","Brno","Ostrava","Plzeň"]` on the wire; the summary opens by naming all four; GBP's first action is "Vytvořit nebo ověřit profil pro každé ze 4 měst"; Firmy.cz, Mapy.cz, the directory, the Facebook groups and the partnerships channel each name the four cities. Three of the top four picks are local-directory channels, which is the correct ranking for a locality-bound service business. |
| **Grounding ~7/8 as L1 predicted** | **CONFIRMED as a count, refuted as a quality claim** | Of the eight grounding fields the builder can send, this tenant's page had five available and sent all five: `projectType`, `brand`, `offering`, `localities`, `keywords`. The three absent ones are absent for honest reasons — no curated competitors, and no `businessSummary`/`audience` because this branch runs no scan. So the *plumbing* score is 5/5 of what exists, consistent with L1's ~7/8 read. But two of the five carried the product's own placeholders, so a high grounding count concealed a grounding defect. **A field count is not a grounding score.** |
| Fit / effort plausible, ranked | **PASS** | 90→60 descending; directory listings low effort, GBP medium (four locations), SEO blog high. All defensible. |
| First actions actionable | **PASS with the placeholder caveat** | 3–4 per channel, concrete and doable ("Požádat první klienty o recenzi", "Reagovat na relevantní poptávky se stručnou nabídkou"). The two placeholder-bearing actions are the exception. |
| Registration links | **PARTIAL** | 0 of 8 channels carried a `url`, including Firmy.cz and Mapy.cz where "register here" is the entire action. Standa's run got 2 of 9. The schema makes `url` optional and the prompt does not insist, so the model's willingness to supply one is a coin flip. |
| Placeholder / demo-marker leakage | **FAIL → FIXED** | 4 occurrences of "Ukázk" in the returned plan across 2 channels; 0 in the seeded plan (the seeded fill was clean). After the fix: 0. |
| Pin, reload, persistence | **PASS** | Applied → `POST /organic-channels 200` → reload → pill "Plán na míru (AI)", 8 channels, generated-at stamp. |
| Same plan on `/klicova-slova` | **PASS** | The visibility card renders the same channels at the other end of the path. |
| Both themes / mobile | **INHERITED from Standa's run** | Theme and viewport behaviour is module-level, not tenant-level; measured once on Standa's project and applies identically here. Mobile clipping (L2-KAN-002) hit this table too and is fixed. |
| Czech register | **PASS** | Same reading as Standa's report: infinitive task lines, third-person rationale, zero second-person address, so no tykání/vykání exposure. "OSVČ", "poptávky", "oborový katalog" are the right register for a Czech consultant. |

## Findings

```json
[
  {
    "id": "L2-KAN-006",
    "journey": "find-free-channels",
    "character": "radek-bootstrapped-consultant",
    "cert_level": "L2",
    "type": "trust",
    "severity": "blocker",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "high" },
    "dimension": "senior-quality",
    "title": "The starter catalog's literal placeholder service names were asserted to the model as the tenant's services and came back as advice",
    "expected": "The journey's own L1 rule: 'the wire request must not carry \"(ukázka)\" or the generic filler when a real value exists'. Radek's bar: content that reads as expert, not filler.",
    "got": "The wire carried keywords:[\"Ukázková služba A\",\"Ukázková služba B\"] — starter.ts's leadgen rows, persisted as the project's own catalog by POST /api/projects — and the model, correctly treating grounding as fact, wrote them into two channels: firstAction 'Vytvořit článek na téma Ukázková služba A' and 'Vytvořit zápis s popisem Ukázková služba A a Ukázková služba B', plus a rationale 'Vlastní obsah zacílený na klíčová slova Ukázková služba A a Ukázková služba B'. The seeded plan was clean; only the tailored plan — the one the user pressed a button to get — carried it.",
    "evidence": [
      "uat/runs/2026-08-29-kanaly-l2/evidence/radek-11-wire-request.txt",
      "uat/runs/2026-08-29-kanaly-l2/evidence/radek-11-wire-response.txt (4 occurrences of 'Ukázk')",
      "src/lib/catalog/starter.ts (leadgen starter rows)",
      "src/app/api/projects/route.ts:49-60 (persisted at creation)"
    ],
    "code_check": "confirmed",
    "verdict": "confirmed",
    "resolution": "FIXED in this run — buildKanalyGrounding now drops any grounding value the product itself wrote as a placeholder (a leading ukázkov*/vzorov*/sample/demo/example/placeholder marker, plus the starter's whole-string stand-in categories), and separately refuses to ground the model on a catalog that is the illustrative seed rather than saved rows. Re-verified live on a fresh leadgen project: wire request has no keywords field, returned plan has 0 'Ukázk'. See evidence/fix-leadgen-wire-request.txt and evidence/fix-leadgen-wire-response.txt. The residual — plausible-looking starter rows with no marker word, e.g. the app type's 'Předplatné / Free / Pro / Team' — is L2-KAN-001 and is NOT fixed."
  },
  {
    "id": "L2-KAN-007",
    "journey": "find-free-channels",
    "character": "radek-bootstrapped-consultant",
    "cert_level": "L2",
    "type": "quality-gap",
    "severity": "minor",
    "impact": { "frequency": "medium", "reachability": "high", "trust_erosion": "low" },
    "dimension": "missing pieces",
    "title": "'Where a channel means register here, give the link' is left to the model's discretion, and for a directory-heavy leadgen plan it supplied none",
    "expected": "The journey's definition of done: 'Where a channel means \"register here\", it gives the link.' Radek's top three picks are all register-here directories.",
    "got": "0 of 8 channels carried a `url`, including Firmy.cz and Mapy.cz. Standa's run got 2 of 9 (GBP, Firmy.cz) for the same tool and the same prompt — so this is model variance, not a per-tenant condition. The schema marks `url` optional (channel-research.ts) and the system prompt does not require one for directory-category channels; the app has a curated seed URL for several of these exact channels in sample.ts and does not fall back to it.",
    "evidence": [
      "uat/runs/2026-08-29-kanaly-l2/evidence/radek-11-wire-response.txt (no url on any channel)",
      "uat/runs/2026-08-29-kanaly-l2/evidence/standa-11-wire-response.txt (2 of 9)"
    ],
    "code_check": "confirmed",
    "verdict": "confirmed",
    "resolution": "open — sized S/M. Two candidate shapes: require a url for category 'directory' in the prompt, or back-fill from the curated seed when the model omits one for a channel the seed already knows (Firmy.cz, Mapy.cz, Heureka, Zboží.cz, GBP all have one)."
  },
  {
    "id": "L2-KAN-008",
    "journey": "find-free-channels",
    "character": "radek-bootstrapped-consultant",
    "cert_level": "L2",
    "type": "quality-gap",
    "severity": "minor",
    "impact": { "frequency": "medium", "reachability": "medium", "trust_erosion": "medium" },
    "dimension": "trust",
    "title": "A field-count grounding score cannot see a grounded lie",
    "expected": "L1 scored this surface ~7/8 on grounding — a plumbing measure: did each field the builder can send survive the wire and reach the prompt.",
    "got": "It did, all five available fields, which is why the score was high. Two of those five were the product's own placeholders, so the highest-scoring grounding in this run produced the least trustworthy plan. This is a note about the METHOD, not about the code: L1's grounding score should be read as 'does the plumbing carry it', and L2 must separately ask 'is what it carried true'.",
    "evidence": [
      "uat/runs/2026-08-29-kanaly-l2/evidence/radek-11-wire-request.txt",
      "uat/journeys/find-free-channels.md (What L1 must check → 'Grounding, scored N/M per AI surface')"
    ],
    "code_check": "n/a",
    "verdict": "confirmed",
    "resolution": "open — recommend the journey's L1 section say that a grounding score counts fields that ARRIVE, and that L2 owns whether they are true."
  }
]
```

## Senior-quality judgement, as Radek

Before the fix: **he would not have trusted it.** Not because the channels were
wrong — they were right, and better than what he would have assembled himself — but
because two of them proved the app was describing a business it had never been
told about. His whole reason for being suspicious of tools is that someone once sold
him something generic dressed as bespoke, and "Ukázková služba A" is the tell.

After the fix: **yes, with one reservation.** Eight to nine free, locality-aware
channels, ranked, with a low-effort quick win and 3–4 concrete first actions each,
delivered in under a minute against an afternoon of his own guessing. That is
squarely inside his "30-minute weekly habit". The reservation is L2-KAN-007: for a
plan whose top three actions are all "register here", not giving him the links is a
missing step he has to go find himself.

**Time saved**: ~40 s of model time and a few minutes of reading against the 2–3
hours he says he skips when busy — which is exactly why his pipeline dries up. This
module is the one thing in the product that answers his literal question.

## Ceilings

- **Radek's project was a real (non-demo) `leadgen` project, not `demo-leadgen`.**
  Demo projects are ownership-gated against writes, so the pin/decision half of the
  journey is not drivable on them; a real project of the same type carries the same
  seeded catalog and the same `localitiesFor` localities, which is what the journey
  actually asks for. Noted so the substitution is not mistaken for the seeded
  fixture.
- **No website scan** on this branch by design (the catalog-first variant). The
  `businessSummary` / `audience` legs are therefore untested for a leadgen tenant.
