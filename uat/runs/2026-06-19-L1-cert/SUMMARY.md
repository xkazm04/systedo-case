# L1 certification — 6 authed modules, 6 Characters, in parallel (2026-06-19)

**Method:** L1 (theoretical) only — six subagents, one per Character×journey, each reasoning over its module's **code** (surface model → in-character walkthrough → findings + first-person feedback). **No browser, no server.** Wall-clock ≈ the slowest single agent (run concurrently), not the sum — the mass-parallel L1 claim, demonstrated.

## Scorecard

| Character | Module | Verdict | Headline |
|-----------|--------|---------|----------|
| Sofie · social | /socialni | **L1-fail** | No performance grounding; single-shot (no week/batch); no calendar; no TikTok |
| Dan · creative | /kreativa | L1-pass* | Great best-of-N machinery; **no brand grounding anywhere**; no product-accurate render |
| Lucia · reports | /reporty | L1-pass* | Good share/microsite bones; **"Systedo" leaks to client report+email**; client sees demo data + raw PNO |
| Robert · profit | /zisk·/ltv | L1-pass* | **Genuinely margin-aware profit** (strength); sample data, no real-books input, no banner; LTV is SaaS-shaped on an e-shop |
| Hana · lead-quality | /kvalita-leadu | **L1-pass** | CRO-grade (CPQL, stats gate); LP hypotheses grounded in cluster *name*, not the experiment's losers |
| Tobias · content | /obsahovy-engine | **L1-fail** | Senior cluster engine (strength); **SEO "comparison" has no competitor data by design**; nothing ties to acquisition |

\* conditional pass — completes structurally but with major findings to fix before an L2 live run.

## The systemic finding: strong machinery, missing real-world grounding
The dominant theme across **all six** (and it only emerged by reading *across* Characters): the engines, prompts and computations are genuinely senior-grade — but they aren't fed the user's **actual world**, so the output is smart-but-untethered.

| Character | The grounding that's missing | Evidence |
|-----------|------------------------------|----------|
| Sofie | performance data into post generation | `social.ts:71-75` (gets only topic/tone/platforms) |
| Dan | brand kit (palette/type/logo) into image gen + scoring | grep brand-kit = 0 hits; `studio.ts:58-59` |
| Robert | real costs/books (only a margin lens over sample) | `profit/dataset.ts:16-51` |
| Lucia | the client's own synced data into the microsite | `microsite.ts:9-10,131` (demo data per tenant) |
| Tobias | competitor data into the SEO "comparison" | `comparison-outline.ts:39` ("no competitor data, use placeholders") |
| Hana | the experiment's own losers/control into LP hypotheses | `lp-variant-ideas.ts:38-46` (grounded in cluster name) |

**One architectural opportunity, six instances:** pipe the real context (performance, brand, costs, client data, competitors, experiment history) into the prompts/views. Fixing this turns "clever demo" into "knows my business."

## Secondary themes
- **Inconsistent sample-data honesty** — Robert's profit surfaces have no "sample data" banner (Distribution/Local do); Lucia's microsite silently shows demo data. → one labeling convention + a real-data seam.
- **Business-shape fit** — Robert's LTV assumes SaaS (signups·ARPU·retention) on an e-shop (orders·AOV·repeat). The app already adapts the *sidebar* to project type; extend that to the *data models*.
- **Brand leak on client-facing surfaces** — "Systedo" (stale; app is Adamant) on the public report + client email. The residual of the deliberately-deferred Systedo sweep; now a Character is demanding it.
- **Surface fragmentation** — report controls live in Campaigns not Reports; creative attribution orphaned; content-engine grid disconnected from the real cluster builder.
- **Jargon on non-expert surfaces** — bare PNO/ROAS on a client report.

## Prioritized app-improvement backlog
**P0 (core promise unmet):** Sofie — feed performance data + add week/batch generation. · Tobias — make SEO comparison actually competitor-grounded (or reframe honestly). · Dan — add a brand kit and feed it into generation **and** the best-of-N scoring.
**P1 (major trust/quality):** Robert — real-cost input (or a clear sample banner) + e-shop-shaped LTV. · Lucia — finish Systedo→Adamant in report/email/microsite defaults + wire microsite to client data + gloss jargon. · Hana — feed losers/control CVR into LP hypotheses.
**P2 (polish/consistency):** sample-data banner convention · surface consolidation · acquisition/CAC tie (Tobias) · peer-source comparison (Hana) · TikTok (Sofie).

## The 10-voice user panel (the felt verdict)
1. **Petra** (mktg mgr) — "shows me last month, not *this* month."
2. **Tomáš** (PPC) — triage + grounded AI eval; he'd adopt.
3. **Eva** (content) — the loop closes + it's brand-specific; she'd try one real article.
4. **Marek** (buyer) — transparent pricing, *now* with proof; would take a look.
5. **Sofie** (social) — "a list, not a calendar… no idea what's working for us… no TikTok?"
6. **Dan** (creative) — "the machinery's better than I expected… but nowhere do I give you my brand."
7. **Lucia** (agency) — "a strong draft I wouldn't put my logo on yet."
8. **Robert** (e-shop) — "a lens on fiction… the LTV page is clever and completely wrong for me."
9. **Hana** (CRO) — "someone here thinks like a CRO… feed it the losers and it's a real next experiment."
10. **Tobias** (SaaS) — "the cluster engine is genuinely good… then the wheels come off at Srovnání & SEO."

**Collective verdict: "Impressive AI bones — but it doesn't know MY world yet."** That single sentence is the product's central opportunity, and no individual finding states it; it's what the *panel* says.
