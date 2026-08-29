# UAT L2 — Standa (pre-launch maker) × find-free-channels

- **Character**: `uat/characters/standa-prelaunch-maker.md`
- **Journey**: `uat/journeys/find-free-channels.md` (L2 checklist)
- **Certification level**: L2 (empirical, real browser, real model)
- **Surface**: `app` project type, URL-first entry (onboarding scan → apply → `/kanaly`)
- **Engine actually used**: **Claude Code CLI, `claude-sonnet`, on the operator's
  subscription** — `meta.demo:false`, `provider:"claude-sonnet"`, `fellBack:false`,
  `attempts:1` on every call. Not the demo path, not Gemini. Dev resolves the CLI
  first by `providerOrder(dev=true) → ["claude","codex","gemini"]`
  (`src/lib/llm/provider-order.ts:26`); `GEMINI_API_KEY` is present in `.env.local`
  but is only reached if the CLIs are unavailable, and they were not.
- **Environment**: `next dev` on `:3107` (Turbopack, main checkout) for the
  before-state, then `:3108` (`--webpack`, this worktree) for the after-state;
  `DEV_AUTH=true`, `LOCAL_DB=true`, `SYSTEDO_DB_FILE` pointed at a scratch DB inside
  the worktree so the operator's own `.data/systedo.db` was never touched.
- **Date**: 2026-08-29

## Journey verdict: **L2-conditional — the plan itself clears Standa's bar; the grounding it is built from does not (yet)**

Standa can do his job, live, from a cold start, in one sitting. He typed a URL, the
scan read his business correctly, and the free-channel plan that came back was 9
named Czech channels ranked by fit, each with a reason, an effort level and 2–4
first actions he could start today. Nothing on the path asked for a budget, an ad
account, or an audience he does not have. Measured against his own "one sitting"
bar, the whole thing took **~62 seconds of model time** against a manual baseline he
estimates in hours.

What keeps it conditional is what the plan is built *from*. The wire request the app
sent on his behalf carried `offering: "Předplatné"` and `keywords: ["Free","Pro",
"Team", …]` — the **starter catalog** the create API silently persists for every new
project — ahead of the offering his own website scan had just extracted ("Online
fakturace s QR kódem, správa nákladů a výdajů, párování plateb"). The plan is good
*despite* that, because the scan's `businessSummary` and `audience` also reached the
prompt and carried it. But the app told the model a stand-in was a fact, and Standa
would recognise the tell: two of the nine channels are built around "Free / Pro /
Team" plan names he never entered.

## The L2 checklist, item by item

| Checklist item | Verdict | Evidence |
|---|---|---|
| Real latency of `channel-research`, measured | **PASS** | **43.3 s wall / 42.6 s server** (`evidence/standa-11-wire-response.txt` meta `tookMs:42611`). Onboarding scan before it: **18.3 s wall / 11.8 s server**. Total cold start ≈ **62 s of model time**. The page's own footer reports it honestly: "Vygenerováno modelem · 43 s". Well inside the 150 s client ceiling; nowhere near "slower than the manual shortlist". |
| 6–9 concrete named Czech channels | **PASS — 9** | Vlastní blog a SEO (fakturoid.cz/blog) 92 · Facebook skupiny pro OSVČ a podnikatele 85 · Google Business Profile 80 · YouTube kanál s návody 78 · Firmy.cz 72 · Reddit (r/czech, r/OSVC…) 68 · Newsletter 65 · Partnerství s účetními a daňovými poradci 62 · Hostování v podcastech 58. All real, all Czech-market, none is "post on social media". |
| Fit / effort plausible, ranked, quick win called out | **PASS** | Sorted 92→58; effort spread low/medium/high and it tracks reality (Firmy.cz listing = low, own blog = medium, podcast tour = high). Quick win = "Facebook skupiny pro OSVČ a podnikatele — Nízká náročnost, vysoká vhodnost. Začněte tady." That is the correct pick for a pre-launch maker with no audience. |
| First actions actionable | **PASS** | e.g. "Publikovat návodový článek typu Jak vystavit fakturu OSVČ krok za krokem", "Natočit krátké video Jak nastavit párování plateb ve Fakturoidu". Specific to his product, doable today, no filler. |
| Where a channel means "register here", it gives the link | **PARTIAL** | 2 of 9 carry a `url` (Google Business Profile, Firmy.cz). Both are `https://` with a real host and render as `rel="noopener noreferrer"` anchors. The other directory-ish picks (Reddit, YouTube) have none. Not a defect — the schema makes `url` optional — but the journey's "where a channel means register here, it gives the link" is only half-met. |
| Placeholder / `(ukázka)` leakage in the rendered plan | **PASS** | 0 occurrences of `vaší firmy` / `vaší nabídky` / `(ukázka)` anywhere in the seeded plan, the AI plan, the playbook or the visibility card (`shots/standa-10-…`, `-12-…`, `-13-…`). The scan's `sample` fill did its job. |
| Grounding — does the plan speak HIS product | **CONDITIONAL** | `businessSummary` and `audience` from the scan reached the wire verbatim and visibly shaped the output (the summary names "vystavit fakturu"/"fakturace online"; channels are built around OSVČ). But `offering`/`keywords` were the starter catalog's, not his. See **L2-KAN-001**. |
| Pin the plan, reload, verify persistence | **PASS** | Applied → `POST /organic-channels 200` → full reload → source pill "Plán na míru (AI)", 9 channels, "Vygenerováno 29. srpna 2026 v 13:14 z podkladů projektu", "Zpět na ukázkový plán" offered. The sample gutter is correctly gone. |
| Per-channel decision survives a reload | **PASS** | Wizard → "Ručně" → Uložit plán → reload: the row reads `Vlastní blog a SEO (fakturoid.cz/blog) · Obsah · 92 · Ručně · Naplánováno · Projít první kroky`. This is the first time the wizard has been driven against a **pinned AI plan** (the e2e spec only covers the seeded one). |
| Rename/reconcile on regenerate | **NOT EXERCISED — blocked by a cache** | "Přegenerovat" returned in **0.8 s** with a byte-identical plan: the 15-minute input-hash response cache served it, and the envelope does not say so. See **L2-KAN-004**. No rename ever occurred, so `reconcilePlanTracks` was not exercised live. |
| One visibility plan, same on `/kanaly` and `/klicova-slova` | **PASS** | Both ends render the same three joined rows (query → content → channel) naming the same AI channels; the empty content leg is *stated* ("Nemáte uložený žádný brief ani koncept, takže žádný dotaz zatím nemá obsah") rather than invented. The footer hop on `/klicova-slova` points back at Kanály zdarma and never at itself. |
| Both themes | **PASS** | `data-theme` resolves light/dark; body `#f4f7f9`/`#0a0f16`, card `#ffffff`/`#121a24`, foreground inverts correctly. Fit bar, stage pills, quick-win callout and plan card all legible in both. `shots/standa-20-kanaly-desktop-{light,dark}.png`. |
| Mobile (390 px) | **FAIL → FIXED IN THIS RUN** | The table correctly drops Vhodnost and Režim below sm/md, and the playbook opens as a 358 px overlay that fits. But the table needed 412 px inside a 356 px `overflow-hidden` wrapper, so the last column — which holds the per-row primary CTA — was **clipped with no way to scroll to it**. See **L2-KAN-002**. |
| Czech register | **PASS** | See the register section below. |
| Degraded path (saved plan unreadable) | **NOT REACHED** | Could not be induced without corrupting the store, which would have meant editing state the operator owns. Remains L1-only. |

## Findings

```json
[
  {
    "id": "L2-KAN-001",
    "journey": "find-free-channels",
    "character": "standa-prelaunch-maker",
    "cert_level": "L2",
    "type": "trust",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "high" },
    "dimension": "trust",
    "title": "The starter catalog is persisted at project creation, so its stand-in rows outrank the tenant's own applied website scan in the channel-research grounding",
    "expected": "buildKanalyGrounding's stated rule is 'the catalog wins wherever both know something; the profile only ever FILLS A GAP', and the rule is right — a catalog the tenant curated IS better evidence than a homepage scan. What must not happen is the product's own fill-me-in rows being counted as a curated catalog.",
    "got": "POST /api/projects persists starterCatalog(...) at creation (src/app/api/projects/route.ts:49-60), so loadProjectCatalogWithSource reports source:\"catalog\" for a brand-new project and buildKanalyGrounding treats those rows as tenant facts. Measured on the wire for the app project: offering:\"Předplatné\", keywords:[\"Free\",\"Pro\",\"Team\", …] — starter.ts's appStarter plan names — ahead of the scan's real offering \"Online fakturace s QR kódem, správa nákladů a výdajů, párování plateb\", which never left the store. The generated plan then built two of nine channels around them (\"Newsletter … segmentovat odběratele podle Free/Pro/Team\", \"Natočit srovnání plánů Free, Pro a Team\").",
    "evidence": [
      "uat/runs/2026-08-29-kanaly-l2/evidence/standa-11-wire-request.txt",
      "uat/runs/2026-08-29-kanaly-l2/evidence/fix-grounding-probe-after.txt (app leg, still Předplatné/Free/Pro/Team after this run's fix)",
      "src/lib/catalog/starter.ts:57-70 (appStarter)",
      "src/app/api/projects/route.ts:49-60",
      "src/lib/organic-channels/grounding.ts (catalog-wins precedence)"
    ],
    "code_check": "confirmed",
    "verdict": "confirmed",
    "resolution": "open — sized M, NOT fixed in this run",
    "fix_shape": "Give the starter rows real provenance (`Offering.source: \"starter\"` instead of \"manual\"), flipped to \"manual\" the moment the tenant edits one in Katalog, and let the grounding skip un-edited starter rows the way it now skips a sample catalog. A longer denylist is the wrong answer: \"Předplatné\" and \"Služby\" are ordinary Czech category words a real tenant may have meant."
  },
  {
    "id": "L2-KAN-002",
    "journey": "find-free-channels",
    "character": "standa-prelaunch-maker",
    "cert_level": "L2",
    "type": "broken-flow",
    "severity": "major",
    "impact": { "frequency": "high", "reachability": "medium", "trust_erosion": "low" },
    "dimension": "completion",
    "title": "On a phone the channel table clipped its last column, hiding the per-row primary CTA with no way to scroll to it",
    "expected": "The journey asks that the plan stay usable on a phone: the table drops its fit and mode columns below sm/md precisely so the remaining ones fit.",
    "got": "Measured at a 390 px viewport: table scrollWidth 412 px inside a wrapper with clientWidth 356 px and `overflow-x: hidden` (ChannelTable.tsx:53, `overflow-hidden rounded-card border border-line`). The row CTA 'Nastavit kanál' ended at x=413 against a 390 px viewport, cut off mid-word, and the document itself did not scroll (docScrollX false) — so nothing the user could do revealed it. Playwright could still click it programmatically, which is why an e2e assertion would not have caught this.",
    "evidence": [
      "uat/runs/2026-08-29-kanaly-l2/evidence/standa-30-mobile-table-metrics.txt",
      "uat/runs/2026-08-29-kanaly-l2/shots/standa-20-kanaly-mobile-dark.png",
      "uat/runs/2026-08-29-kanaly-l2/shots/standa-32-mobile-settled.png (still clipped after a 6 s settle — not an entrance animation)"
    ],
    "code_check": "confirmed",
    "verdict": "confirmed",
    "resolution": "FIXED in this run — `overflow-x-auto overflow-y-hidden` + `min-w-[26rem]`; re-measured live: wrapper overflowX \"auto\", scrollWidth 416 > clientWidth 356, CTA right edge 357 ≤ 390 after scrolling. See evidence/fix-mobile-table-metrics.txt."
  },
  {
    "id": "L2-KAN-003",
    "journey": "find-free-channels",
    "character": "standa-prelaunch-maker",
    "cert_level": "L2",
    "type": "confusion",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "medium" },
    "dimension": "clarity",
    "title": "After a reload the app offers to 'replace the sample plan' with the plan it is already showing",
    "expected": "Once a plan is pinned, the source pill reads 'Plán na míru (AI)' and there is no sample plan on screen to replace.",
    "got": "`applied` is in-memory useState, but useAiTool rehydrates its last result from localStorage on mount (useAiTool.ts:129-143). After a reload of an already-pinned plan the banner 'Plán na míru je připravený / Nahraďte ukázkový plán touto verzí přizpůsobenou vaší firmě' returned, with a live 'Použít tento plán (9)' button, on a page whose pill already said the plan was pinned. Pressing it re-runs reconcile and re-opens the top-3 setup wizard.",
    "evidence": [
      "uat/runs/2026-08-29-kanaly-l2/evidence/standa-13-kanaly-pinned-after-reload.txt (banner and pill both present)",
      "src/components/app/modules/OrganicChannels.tsx (applied flag; banner render condition)"
    ],
    "code_check": "confirmed",
    "verdict": "confirmed",
    "resolution": "FIXED in this run — the banner is now also suppressed when the generation in hand IS the pinned plan (identity compared against the server-rendered channels). Re-measured live in one context: banner count 1 before the reload, 0 after, pill 'Plán na míru (AI)'. See evidence/fix-banner.txt."
  },
  {
    "id": "L2-KAN-004",
    "journey": "find-free-channels",
    "character": "standa-prelaunch-maker",
    "cert_level": "L2",
    "type": "trust",
    "severity": "minor",
    "impact": { "frequency": "medium", "reachability": "high", "trust_erosion": "medium" },
    "dimension": "trust",
    "title": "'Přegenerovat' is a silent no-op inside the 15-minute response cache, and the envelope reports the original call's latency as if it had just happened",
    "expected": "A user presses Regenerate because they want a different plan. If the app is going to hand back the same one, it should say so.",
    "got": "Pressed Přegenerovat ~3 minutes after the first generation: HTTP 200 in 0.8 s, byte-identical plan, meta still reporting tookMs:42611 and no cache marker. The UI then rendered 'Vygenerováno modelem · 43 s' for a call that took under a second. runMetered computes `cached: true` (dispatch.ts:175-188) and cachedRespond then drops it (dispatch.ts:252-261), so the client cannot know. The cache itself is correct engineering — it is the double-submit guard and it refunds the ceiling unit; the defect is that the affordance promises variation the cache cannot deliver and the envelope hides why.",
    "evidence": [
      "uat/runs/2026-08-29-kanaly-l2/evidence/standa-42-regenerate-response.txt",
      "src/app/api/ai/dispatch.ts:175-188, 252-261",
      "src/lib/ai/response-cache.ts:22 (TTL_MS = 15 min)"
    ],
    "code_check": "confirmed",
    "verdict": "confirmed",
    "resolution": "open — sized M (the honest fix stamps `meta.cached` on the shared AiResponse envelope, which every tool and the LLM golden gate see). Side effect worth naming: because no rename ever happened, reconcilePlanTracks' renamed-channel path could not be exercised live at all."
  },
  {
    "id": "L2-KAN-005",
    "journey": "find-free-channels",
    "character": "standa-prelaunch-maker",
    "cert_level": "L2",
    "type": "confusion",
    "severity": "minor",
    "impact": { "frequency": "high", "reachability": "high", "trust_erosion": "low" },
    "dimension": "clarity",
    "title": "The sample-data gutter on Kanály zdarma talks about ad-account data and points at 'Seam' notes that do not exist on this page",
    "expected": "This is the one module with no numbers and no ad account by design — its honesty banner should be about the seeded PLAN, not about advertising metrics.",
    "got": "The seeded state renders: 'Ukázková data — Čísla jsou ilustrativní (vygenerovaná pro každý projekt zvlášť), nejde o vaše reálná data z reklamních účtů. Skutečná data se napojí přes konektor (viz poznámky „Seam\").' Standa has no ad account, which is the entire premise of the journey, and there is no 'Seam' note anywhere on the page — 'Seam' is developer vocabulary reaching a user surface.",
    "evidence": ["uat/runs/2026-08-29-kanaly-l2/evidence/standa-10-kanaly-seeded.txt"],
    "code_check": "confirmed",
    "verdict": "confirmed",
    "resolution": "open — sized S but out of this run's scope (SampleDataNote is shared by ~9 seeded numeric modules; a per-module variant is the right fix, not an edit to the shared string)."
  }
]
```

## Czech register read (against `docs/i18n/constructions-cs.md` § CS-REGISTER)

**Clean.** The house rule is vykání without exception, and quoted or non-address
constructions are out of scope.

- **The model's own output uses no second person at all.** Every `firstActions` entry
  is an infinitive ("Vytvořit obsahový plán…", "Publikovat návodový článek…",
  "Natočit krátké video…", "Identifikovat aktivní skupiny…"), which is the normal
  Czech register for a task list and cannot collide with tykání/vykání. `rationale`,
  `payoff` and `summary` are third-person descriptive. A grep for the tykání
  imperative forms the audit lists (`zkus`, `vyber`, `klikni`, `napiš`, `začni`,
  `nastav`, `vytvoř`, `přidej`, `sleduj`) returns **zero** matches in either plan.
- **The chrome around it is consistently vykání**: "Začněte tady", "Nahraďte
  ukázkový plán…", "Kliknutím na řádek otevřete playbook, tlačítkem uděláte další
  krok", "Vyberte dotazy, na které chcete být vidět".
- **Channel names read as Czech, not as translated boilerplate**: "Vlastní blog a
  SEO", "Facebook skupiny pro OSVČ a podnikatele", "Partnerství s účetními a
  daňovými poradci", "Hostování v podcastech pro podnikatele". "OSVČ" is the right
  register for the audience.
- Two small notes, neither a CS-REGISTER violation: **"playbook"** is an
  untranslated anglicism in the chrome ("Kliknutím na řádek otevřete playbook") and
  appears in no glossary entry; and the model writes plan names and quoted keywords
  in Czech quotation marks („…") correctly, which is what the style guide asks.

## Senior-quality judgement, as Standa

Would a seasoned launch advisor have produced this list? **Mostly yes.** The nine
picks are the ones a Czech indie-launch advisor would name, the ranking is
defensible, and the quick win (a low-effort community channel before a
medium-effort content programme) is the right first move for someone with no
audience. Two things a senior would have done differently: they would have put
**Product Hunt / indie launch directories** on the list for a pre-launch SaaS (the
*seeded* plan had Product Hunt at 82; the AI plan dropped it — arguably correct for
Fakturoid, which is not pre-launch, but it is the one place the substituted fixture
shows), and they would not have built two channels around plan names the client
never gave them (L2-KAN-001).

**Time saved**: ~62 s of model time plus perhaps 5 minutes of reading against a
half-day of keyword tools and forum spelunking. His "~20 minutes before launch" bar
is met with room to spare. The residual risk is not time, it is trust: the one thing
that would make him close the tab is noticing the app confidently describing a
product detail he never entered.

## Ceilings and honest gaps

- **The Character's own product does not exist**, so the scan needed a real URL. I
  used **fakturoid.cz** — a real Czech invoicing SaaS, `app` project type, Czech
  copy, which is the closest honest stand-in for "Standa's SaaS". He is therefore
  being played as the maker of a shipped product rather than a pre-launch one; the
  cold-start property under test (empty catalog, no traffic, no ad account) held
  regardless.
- **The degraded path was not reached** (would have required corrupting the store).
- **The rename/reconcile path was not exercised** — see L2-KAN-004.
- **`uat/runs/2026-08-28-kanaly-l1/SUMMARY.md` does not exist.** `/uat/runs/` is
  gitignored at `.gitignore:81`, so the L1 run this L2 was meant to close was never
  committed and went with its worktree. K01 survives only as prose in
  `docs/adr/0009-…md:29` and K05 as a comment in `tests/support.ts`. This L2 was
  therefore certified against the journey's own L2 checklist rather than against
  K01–K06, and K06 could not be closed by id. Recorded in SUMMARY.md.
