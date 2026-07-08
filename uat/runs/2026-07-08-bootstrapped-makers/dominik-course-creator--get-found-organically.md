# Dominik — Get found organically (L1, code-grounded, no browser)

**Character:** Dominik, solo course-creator. His voice IS the product; AI that "sounds like nobody" loses him.
**Surface:** `content` (demo-content, "Magazín"). Reachable: Přehled, Výkon, Klíčová slova, Obsahový engine, Sociální sítě, Kreativa, Reporty, Distribuce, Publikum & výnos (`src/lib/projects/modules.ts`). Kampaně is correctly NOT available for `content` — good, the whole "no ad account" constraint holds by construction.
**Path walked:** Klíčová slova (keyword research → clusters) → Obsahový engine (clusters/decay → brief → draft) → Publikum & výnos.

---

## First-person review

I came in with one question: which handful of queries do I actually write for, and can this get me to a draft I can make mine? The keyword-clustering part is genuinely good. I paste my keywords, and it groups them into pillar + supporting clusters and **only uses my words** — it literally refuses to invent keywords (`keyword-clusters.ts:30`, and `normalizeKeywordClusters` drops anything that wasn't in my input, `:178`). It ranks clusters by real search volume so the biggest opportunity leads. That's a real "show me what's worth writing," not a 40-idea dump. I liked that.

Then I opened Obsahový engine and my heart sank a little. The cluster table and the "decaying content" table are **someone else's magazine** — "spánek miminka", "kojení", "příkrmy", "Nejlepší kočárky 2024". That's a baby/parenting site. My project just rescales the volume numbers; the actual topics are hardcoded (`content-engine/sample.ts:29`, `clustersForProject` only varies `volume`, `:73`). So the module that's supposed to surface *my* niche's gaps and decaying pieces shows me a stranger's niche. For a "find the opportunities in MY niche" job, that's the wrong content on the marquee.

The brief itself is fine as a skeleton — I type my topic, primary keyword and audience and it gives me title/meta within SEO limits, an H2 outline, FAQ, related keywords. That's a scaffold I can build on, which is what I want. Two things bug me. One, nowhere — not in the brief, not in the draft — is there a field for **my voice**. The draft prompt is "Jsi český obsahový stratég a copywriter" and it never learns how I sound (`article-draft.ts:33`). It's a structurally-correct scaffold, so I can voice-match it, but the prose it hands me is nobody's. Two, if I'm keyless the demo brief stamps "**| Mionelo**" into my title tag and writes baby-product FAQ (`brief.ts:155`). Seeing a random baby brand in my SEO title erodes my trust in what else is hardcoded under the hood.

Publikum & výnos, on the other hand, is the kind of screen I wish more of the app looked like: subscriber funnel, ARPU, per-segment RPM, revenue mix with a concentration warning, sponsorship price estimate, subscriber sources with retention (`AudienceModule.tsx:26`). That's revenue, not vanity metrics — it answers "what's working" at the money level. My only nit: it attributes to *channels*, not to *which article* drove subscribers, so the loop back to "what should I write" isn't closed.

Net: I can get from "I need traffic" to a keyword-prioritised brief + a scaffold draft grounded in my topic and audience. The SEO spine is senior-grade. What stops it being a clean pass is that the opportunity board shows a stranger's niche, and my voice never reaches the draft.

---

## Findings

### DOM-J1-01 — Obsahový engine opportunity board is a hardcoded parenting niche
- journey: get-found-organically · type: quality-gap · dimension: senior-quality · severity: **major**
- impact: { frequency: high, reachability: high, trust_erosion: high }
- expected: The clusters/decay tables surface prioritized opportunities for *my* niche (gaps, decaying pieces).
- got: `SAMPLE_CLUSTERS` / `SAMPLE_DECAY` are fixed baby/parenting topics ("spánek miminka", "kojení", "Nejlepší kočárky 2024"); `clustersForProject` only rescales `volume`, leaving the titles project-independent. A non-parenting creator's "opportunities" are someone else's.
- evidence: ["src/lib/content-engine/sample.ts:29", "src/lib/content-engine/sample.ts:60", "src/lib/content-engine/sample.ts:73", "src/app/app/[projectId]/obsahovy-engine/page.tsx:15"]
- code_check: `clustersForProject` maps only `volume`; `SAMPLE_DECAY` is passed verbatim from the page.
- verdict: confirmed · l2_priority: high

### DOM-J1-02 — Draft/brief never receive the creator's voice (no field exists)
- journey: get-found-organically · type: quality-gap · dimension: senior-quality · severity: **major**
- impact: { frequency: high, reachability: high, trust_erosion: medium }
- expected: The draft is a scaffold I can voice-match in minutes AND doesn't read like nobody wrote it.
- got: Neither `generateBrief` nor `generateArticleDraft` accepts a brand-voice / author-style input; the system prompts are generic "obsahový stratég a copywriter". Contrast the social tool, which *does* take `brand` (`social.ts:20`). The draft is a valid structural scaffold — so it's voice-matchable — but its prose has zero personality anchor.
- evidence: ["src/lib/ai/tools/article-draft.ts:33", "src/lib/ai/tools/brief.ts:29", "src/lib/ai/tools/social.ts:20"]
- code_check: `BriefRequest` / `ArticleDraftRequest` have no voice field; `ContentBriefGenerator.tsx` sends topic/primaryKeyword/audience/contentType only.
- verdict: confirmed · l2_priority: high

### DOM-J1-03 — Keyless/demo brief hardcodes a foreign brand ("Mionelo") into SEO fields
- journey: get-found-organically · type: trust · dimension: trust · severity: **minor**
- impact: { frequency: low, reachability: medium, trust_erosion: high }
- expected: Fallback output is niche-neutral or clearly my project.
- got: `demoBrief` stamps `${topic} | Mionelo` into the title tag and writes baby-product FAQ/rationale. Visible only in keyless/demo mode (dev routes the real model), but this is the demo state a first-touch user sees.
- evidence: ["src/lib/ai/tools/brief.ts:155", "src/lib/ai/tools/brief.ts:170"]
- code_check: `titleTag: clamp(`${cap(topic)} | Mionelo`, …)`.
- verdict: confirmed · l2_priority: medium · scope_note: demo/keyless fallback only.

### DOM-J1-S1 — STRENGTH: keyword clustering is strictly grounded and opportunity-ranked
- journey: get-found-organically · type: strength · dimension: senior-quality · severity: polish
- got: Clusters use only my keywords (invented terms dropped in normalize), pick the highest-volume pillar, and sort clusters by total volume — plus the engine flags decaying posts and unwritten gaps. This is "show me the few worth writing," not a dump.
- evidence: ["src/lib/ai/tools/keyword-clusters.ts:30", "src/lib/ai/tools/keyword-clusters.ts:150", "src/lib/ai/tools/keyword-clusters.ts:178"]
- verdict: confirmed

### DOM-J1-S2 — STRENGTH: Publikum & výnos is a real revenue view, not vanity metrics
- journey: get-found-organically · type: strength · dimension: trust · severity: minor
- got: Subscriber funnel + ARPU + per-segment RPM + revenue mix with concentration warning + sponsorship pricing + source retention. Ties audience to money. Caveat: attribution is per-channel, not per-article, so the "which content earns" loop isn't fully closed.
- evidence: ["src/components/app/modules/AudienceModule.tsx:26", "src/lib/audience/compute.ts"]
- verdict: confirmed

---

## Grounding audit (per AI surface)
| Surface | Grounded on | Missing | Score |
|---|---|---|---|
| keyword-clusters | his keywords, volume, intent, topic | (none needed for the task) | 3/3 |
| brief | topic, primaryKeyword, audience (manual), kw volume/competition | offering/product, **voice** | 3/5 |
| article-draft | brief title/meta/outline/keywords/audience | offering, **voice** | 3/5 |

**Journey grounding: 9/13 ≈ 0.69.** The SEO/structure spine is well grounded; the two holes are voice (nowhere) and the opportunity board showing a foreign niche.

## Time-saved (if it worked)
Keyword → prioritized clusters → brief → scaffold draft plausibly compresses a half-day of research + outlining into ~30–45 min. **Confidence: medium-high** for the SEO spine; the voiceless prose means real voice-matching time on the draft is still on him (as he expects), so the saving is real but not magical.

## Verdict: **L1-conditional**
He can complete the job and the keyword/brief spine is senior-grade. Blocked from a clean pass by (a) the opportunity board being a hardcoded foreign niche and (b) no voice reaching the draft — his central risk. Both are code-confirmed, both L2-priority.
