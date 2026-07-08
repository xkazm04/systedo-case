# SUMMARY — Bootstrapped-maker cohort (cheap-visibility, ease-first)

*8 new Characters — indie SaaS makers, pre-launch builders, a handmade shop, a non-technical dropshipper, a course creator, an SEO blogger, a solo local-service owner, a bootstrapped consultant. One shared job: get my product seen, cheaply, without becoming a marketer. Judged on ease + clarity, not depth.*

## The one-sentence panel verdict
> **"The engine is real, but it's running on someone else's data and it forgets who I am the moment it writes for me."** — every Character independently hit the same seam: genuinely senior-grade *machinery* (opportunity-ranked keywords, computed content clusters, real lead-quality, a one-click on-brand social batch) fed either a **stranger's demo niche** or **no product/voice context at all** — so the analysis impresses and the *output* reads generic.

## Cross-cutting themes (deduped, most systemic first)

### 1. Grounding is the whole ballgame — and it's split-brained
The recurring, cohort-wide defect isn't broken features; it's **thin/wrong grounding on otherwise excellent machinery.** Three shapes:
- **Absent** — the brief→draft chain (`brief.ts`/`article-draft.ts`) never sees the product/positioning/voice, though `social.ts` proves the pattern by taking a brand voice (BM-L1-01). This is why Vojta won't sign the draft and Dominik says it "sounds like nobody."
- **Wrong/hardcoded** — a single parenting/baby demo niche leaks into content clusters, the distribution source, and product-creative's audience regardless of the actual business (BM-L1-02/03/04); the local reputation panel is AC/electrical on a dental clinic (BM-L1-07).
- **Split within one identity** — "Mionelo" is nuts in catalog/social and baby in product-creative (BM-L2-REC-01). The app defines "who is this business" in several unreconciled places.
> The fix is unusually **leveraged**: the machinery is already good, so wiring the real catalog/voice/positioning into the four AI prompts that lack it would move most Characters from "impressive demo" to "I'd actually ship this."

### 2. The app speaks Marketer; this cohort doesn't
Non-marketers (Nikol, Ilona) are greeted on **screen one** by PNO/ROAS with no gloss and a cross-project *portfolio* dashboard (BM-L1-09/16), and the organic-only crowd (Vojta, Pavla, Radek) is shown **CPC / Keyword Planner / "Optimalizovat bidding"** they explicitly don't want (BM-L1-10/12). The capability is there; the *framing* assumes a budgeted professional. For an ease-first cohort, framing **is** the product.

### 3. "From zero" mostly works — but the app fakes data instead of teaching
Standa's cold-start probe found the good news (keywords→compare→brief→draft and Knihovna vzorů all work from nothing) and the bad: **Výkon and CAC→LTV fabricate a full analysis** for a project with no traffic, and Výkon alone drops the "Ukázková data" label the other six modules carry (BM-L1-05, BM-L2-REC-02). The trust risk isn't a dead-end — it's *confident fiction*.

### 4. Local + service is a half-built funnel
Alena's GBP planner produces **titles with no copy** (BM-L1-06, her promo journey L1-**fails**), and Radek's organic front door — keyword research — is **e-commerce-shaped with no locality**, while the genuinely good locality view (Lokální dominance) **dead-ends** with no bridge to content (BM-L1-08). The pieces exist; they're not connected into a job.

## Impact-ranked backlog (do in this order)
1. **Wire product/voice/positioning into brief + article-draft prompts** (BM-L1-01) — unblocks Vojta, Dominik, Standa, Pavla at once; highest leverage.
2. **Fix Distribuce to send the article body, not the headline** (BM-L1-04, blocker) — the flagship "one article → variants" is non-functional for its purpose.
3. **De-hardcode the demo niche** in product-creative audience, content-engine clusters/decay, distribution source (BM-L1-02/03); reconcile the Mionelo/Dentalis identities (BM-L2-REC-01, BM-L1-07).
4. **Make offline mode actually run AI** — guard `usage.ts` for `LOCAL_DB`, or fail loudly not silently (BM-L2-01). *Also unblocks future L2 AI-quality runs.*
5. **Give data-hungry modules a teaching empty state** + uniform sample-data labeling incl. Výkon (BM-L1-05, BM-L2-REC-02).
6. **A non-marketer first-run** — gloss/hide PNO·ROAS·CPC for organic/no-budget projects, single-project overview, a first-action CTA (BM-L1-09/10/16).
7. **Close the local funnel** — GBP post copy (BM-L1-06); locality-aware keywords + a Lokální-gap→brief bridge + a local-intent cluster class (BM-L1-08/11).

## Value ledger — promise vs proven
| | Promised (design, if grounded) | Proven this run |
|---|---|---|
| **Time-saved** | Ilona 2 h→15 min; Radek 15-20→2-3 min/lead; Standa ~3.5 h; Vojta ~90 min | Input flows + batching verified live; **output quality unverified** (BM-L2-01) so time-saved is credible-but-unbanked |
| **Grounding** | Social 5/5, Compare/lead-quality/Recenze strong | Verified live (WeekPlanner "Píše na značku" real & rich); brief/draft/distribution grounding **confirmed absent/wrong** |
| **Ease** | one-click batch, work-from-zero | WeekPlanner & Kreativa 2-click paths real; **first-run framing** fails the non-marketer bar |

## Strengths to protect (don't refactor these away)
Compare & SEO opportunity ranking · WeekPlanner on-brand one-click batch (live-confirmed grounding) · keyword opportunity score · computed content cluster/decay logic · gap→brief→draft flow with real E-E-A-T scoring and zero paid push · lead-reply grounded in the real enquiry · real CRM-style lead-quality that honours organic · Recenze grounded replies + concrete local gaps · Knihovna vzorů as the model empty state.

## Honest ceilings
- **Live AI-output quality was not judged** (offline AI-metering gap, BM-L2-01) — this run proves surfaces, reachability and grounding *inputs*, not generated prose/images. One `gcloud` ADC step (or the credentialed main server with a `DEV_AUTH` toggle) would let a follow-up `recertify` close it.
- **All grounding data is seeded/scaled sample** until Ads/Search-Console/CMS/GBP connectors are wired — excellent machinery, illustrative fuel.
- These 8 Characters test the **self-serve, budget-free, ease-first** slice; they say little about paid-campaign or agency workflows (that's the existing pro roster's job).
