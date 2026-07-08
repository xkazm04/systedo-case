# L1 UAT — Radek (bootstrapped consultant) · Journey: get-found-organically

- **Character:** Radek — solo consultant, no ad budget; his only affordable channel is ranking for his service in his area.
- **Surface:** `leadgen` (demo-leadgen = "Klimatherm", klimatherm.cz).
- **Cert level:** L1 (theoretical, code-grounded, no browser).
- **Modules walked:** Klíčová slova (keyword research + clustering), Obsahový engine (brief → draft), Lokální dominance (service×location coverage).

## Reachability
`klicova-slova` availableFor ALL (`modules.ts:90`), `obsahovy-engine` ALL (100), `lokalni` `["leadgen","local"]` (254). All reachable for leadgen. Pass.

## Radek's review (first person)

"The whole reason I'm here: no budget, so I need to rank for *my service, near me*, and turn that into pages. Let me try the obvious door — **Klíčová slova**.

I type my service as the seed. And… the suggestions are e-shop nonsense. It hands me '{service} cena', '{service} koupit', '{service} eshop', '{service} skladem', 'bio {service}', '{service} pro děti'. I don't *sell* a product off a shelf — nobody 'buys my service in stock'. Worse, there is **not one locality in the list**. No 'Praha', no 'Brno', no 'poblíž'. Locality is the entire point of local service SEO and it's absent. This is the exact thing that makes me distrust marketing tools — keyword advice that ignores where I work. (I get it lights up with real Google Ads data if I connect an account — but I have no ad account, that's the whole premise.) The clustering button on top is clever — it groups whatever list I give it by intent and hands each cluster to a content brief — but garbage in, garbage out: it can only cluster the product-shaped words it was fed, and the intent buckets are informational/transactional/brand, so there's nowhere for 'local' to even live.

So I bail on keywords and try **Lokální dominance** — and *this* is what I actually wanted. A grid of **my services × cities**, with monthly search volume, my rank in each cell, coverage %, and a 'gaps' table that literally lists the service+city combinations where I have no page and how much monthly volume I'm leaving on the table. That's a to-do list ranked by opportunity. It even pulls the rows from my catalog when I've got services entered. This is the locality-aware targeting the keyword tool should have given me.

But here's the frustration: the gap table tells me to 'deploy a microsite for each gap' and then… stops. There's no button to turn a gap into a content brief. I have to eyeball a gap like 'Servis Brno', walk back to Klíčová slova, type it in — and get product-shaped keywords again. The two halves don't join up.

**Obsahový engine** itself is fine once I feed it a real topic: with the model connected it writes a proper brief — title/meta in SEO limits, H2 outline, FAQ, related keywords, internal-link anchors — off my topic, primary keyword, audience and the keyword metrics. I could publish that with light edits. My worry is only the front of the funnel: what topic am I feeding it? If it's the keyword tool's output, it's off. If it's a Lokální gap I copied by hand, it's good — but that's manual."

## Grounding audit (per AI surface)
- **Keyword research (`/api/keywords` → sample)** — Keyless output comes from `sampleKeywordIdeas` whose modifier set is entirely e-commerce (`keywords/sample.ts:12-29`: cena/koupit/eshop/skladem/levně/bio/pro děti/účinky) with **no locality modifier**. Intent classification exists but locality does not. **Locality grounded: NO. Intent: yes. Grounding 2/5.**
- **Keyword clustering (`keyword-clusters`)** — Strictly grounded in the supplied keyword set (drops invented words, `keyword-clusters.ts:159-211`); intent taxonomy is informational|transactional|brand only (`:94`) — no local class. Good discipline, wrong axis for a local service. **Grounding 3/5** (limited by its inputs).
- **Content brief (`brief`)** — Grounded in topic / primaryKeyword / audience + keyword volume+competition (`brief.ts:29-62`). No locality field; keyless demo is e-shop framed ("| Mionelo", "Doporučené produkty", "Bestsellery", `:150-178`) — live LLM path is fine. **Grounding 3/5.**
- **Lokální dominance (not AI, catalog-grounded)** — Coverage matrix built from the project catalog's services × localities (`lokalni/page.tsx:20-23` → `targetsFromCatalog`; `resolve.ts:47-49`), with rank, coverage %, and **gap volume** (`LocalModule.tsx:96-210`). This is the real locality-aware targeting surface. **Grounding 4/5.**

## Findings
See JSON block in the return message (ids R2-5 … R2-9).

## Time-saved (if it worked as designed)
Lokální dominance genuinely compresses 'which service×city do I write next' from an afternoon of guesswork into a ranked gap list — real time saved. But the broken bridge (gap → keywords → brief) and the off-domain keyword engine mean he still does manual copy-work and has to distrust step one. Net: **modest** time saved on the get-found path, gated on him ignoring the keyword tool and driving from the local gaps instead. **Confidence: medium.**

## Verdict
**L1-conditional.** The locality-aware targeting he needs *exists and is well-grounded* (Lokální dominance), and the content engine can produce publishable drafts. But the journey's front door — keyword discovery with no ad account — returns e-commerce-shaped, non-local suggestions that fail his core criterion at step one, and there's no handoff from the strong local-gap view into content. The organic funnel half-works: usable if he starts from Lokální dominance and hand-carries topics, misleading if he starts where the UI points him (Klíčová slova). **Grounding: 3/5 average.**
