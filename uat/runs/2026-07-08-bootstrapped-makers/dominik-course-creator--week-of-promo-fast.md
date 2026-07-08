# Dominik — A week of promo, fast (L1, code-grounded, no browser)

**Character:** Dominik, solo course-creator. Repurposing one article into a week of social + newsletter is his highest-leverage move — but only if it keeps the substance and sounds like him.
**Surface:** `content` (demo-content). Two entry points for this job: **Distribuce** ("one article → variants") and **Sociální sítě** (batch post drafting).
**Path walked:** Obsahový engine (finished draft) → Distribuce → Sociální sítě.

---

## First-person review

This is the job I actually care about. I write one good piece, and I want a week of stuff out of it — thread, newsletter, a couple of posts — in my voice, in one sitting. So I went to **Distribuce**, because that's literally what its blurb promises: "Jeden článek → varianty na sítě a newsletter."

Three things killed it for me.

First, it's not *my* article. The source is hard-wired to "Spánek miminka: kompletní průvodce" — a baby-sleep guide (`distribuce/page.tsx:17` → `SAMPLE_SOURCE`, `sample.ts:18`). There's no box to paste my piece, and the "Distribuovat" button back in the content engine just navigates here — it doesn't carry the draft I just wrote (`ContentEngine.tsx:242`). So the module distributes a stranger's baby article no matter what I do.

Second — and this is the one that made me close the tab — when I hit "Vygenerovat AI variantu," it sends the model the **title and URL only**. Look at the call: `{ title, url, channels, tone }`, no `body` (`DistributionModule.tsx:351`). The prompt then literally says "Text článku není k dispozici — vyjdi z názvu" ("article text unavailable — work from the title", `repurpose.ts:41`). So "one article → variants" is really "one *headline* → variants." It can't preserve substance because it never sees the substance. That's my exact pet peeve, except worse than truncation — there's nothing to truncate.

Third, voice. The tone is hardcoded to `pratelsky` ("friendly") in the component (`DistributionModule.tsx:33`) and there's no brand-voice field at all on the repurpose tool (`repurpose.ts:17` — no `brand` param). And the deterministic draft I see first (and the floor for any channel the model skips) is pure nobody-copy: "Tento týden jsme sepsali kompletního průvodce…" plus Instagram hashtags **#rodicovstvi #miminko #tipy #blog** (`generate.ts:52`). Parenting hashtags, on my posts. If a subscriber saw that they'd know a robot did it — which is the whole thing I refuse to ship.

The frustrating part is the repurpose *system prompt is actually smart* — it gives each channel its own shape (newsletter = subject + intro + CTA, LinkedIn = bullets, IG = emoji + hashtags, X = terse; `repurpose.ts:20`). That's real per-channel adaptation, not a truncate. It's just starved of input and voice, so all that channel-craft runs on a headline.

Then I found **Sociální sítě**, and it's a different world. It has a "Hlas značky" field — "AI writes in your brand voice, not generically" (`SocialClient.tsx:33`, `:267`) — and the tool honours it: `socialSystem(brand)` writes "pro značku: ${brand}" and instructs it to keep my products, tone and vocabulary (`social.ts:20`, `:28`). I pick the tone, I can batch several platforms at once, it leans on a "CO TEĎ FUNGUJE" performance block, and each platform is styled natively (`social.ts:26`). *This* meets the bar — on-brand, human, batchable in one sitting. The catch: it drafts from a **topic**, not from my article, so it's fresh posts, not my piece repurposed. So between the two surfaces, one understands my voice but not my article (Sociální sítě), and the other pretends to take my article but understands neither it nor my voice (Distribuce). Neither one does the actual job — "my article body → variants in my voice."

If I judge the week-of-promo job by Sociální sítě alone, I'd keep using it. If I judge it by the flagship "one article → variants," it fails my hard bar on every axis I care about.

---

## Findings

### DOM-J2-01 — Distribuce repurposes the headline, not the article (body never sent to the model)
- journey: week-of-promo-fast · type: broken-flow · dimension: senior-quality · severity: **blocker**
- impact: { frequency: high, reachability: high, trust_erosion: high }
- expected: One article becomes channel variants that **preserve the substance**.
- got: `regenerate()` calls the repurpose tool with `{ title, url, channels, tone }` — no `body`. `body` is optional in validation, so the prompt takes the "article text unavailable — work from the title" branch. Variants are generated from the title alone; substance cannot survive because it's never passed.
- evidence: ["src/components/app/modules/DistributionModule.tsx:351", "src/lib/ai/tools/repurpose.ts:41", "src/lib/ai/validation.ts:289"]
- code_check: no `body` key in the `ai.run({...})` payload; `buildRepurposePrompt` gates the body block on `body` being present.
- verdict: confirmed · l2_priority: critical

### DOM-J2-02 — Source article is hardcoded; the drafted article never reaches Distribuce
- journey: week-of-promo-fast · type: quality-gap · dimension: completion · severity: **major**
- impact: { frequency: high, reachability: high, trust_erosion: medium }
- expected: I distribute the article I just wrote.
- got: The page always renders `SAMPLE_SOURCE` ("Spánek miminka…") with no input field; the content engine's "Distribuovat" next-step only routes to the module — it carries no article. There is no path to distribute my own piece.
- evidence: ["src/app/app/[projectId]/distribuce/page.tsx:17", "src/lib/distribution/sample.ts:18", "src/components/app/modules/ContentEngine.tsx:242"]
- code_check: `DistributionModule source={SAMPLE_SOURCE}`; no query/session handoff of a draft into distribuce.
- verdict: confirmed · l2_priority: high

### DOM-J2-03 — "Sounds like nobody": repurpose has no voice, hardcodes tone, and falls back to foreign-niche filler
- journey: week-of-promo-fast · type: quality-gap · dimension: senior-quality · severity: **major**
- impact: { frequency: high, reachability: high, trust_erosion: high }
- expected: Variants are on-brand, human, in my voice.
- got: Tone is fixed to `pratelsky` in the component; the repurpose tool exposes no `brand`/voice input (unlike the social tool). The deterministic fallback — shown first and used for any channel the model skips — emits generic filler plus baby hashtags `#rodicovstvi #miminko #tipy #blog`. Inconsistent with Sociální sítě, which is voice-aware.
- evidence: ["src/components/app/modules/DistributionModule.tsx:33", "src/lib/distribution/generate.ts:52", "src/lib/ai/tools/repurpose.ts:17"]
- code_check: `REPURPOSE_TONE: Tone = "pratelsky"`; `generateRepurpose` signature has no brand param; `repurpose()` Instagram text hardcodes parenting hashtags.
- verdict: confirmed · l2_priority: high

### DOM-J2-S1 — STRENGTH: Sociální sítě is voice-aware, channel-native and batchable
- journey: week-of-promo-fast · type: strength · dimension: senior-quality · severity: polish
- got: A "Hlas značky" field feeds `brand` into the social tool, which keeps my products/tone/vocabulary; tone is user-selectable; multiple platforms drafted in one shot with per-platform styling and a "what's working" grounding block; skipped platforms filled from templates. This meets the on-brand/human/one-sitting bar.
- evidence: ["src/components/social/SocialClient.tsx:33", "src/components/social/SocialClient.tsx:267", "src/lib/ai/tools/social.ts:20", "src/lib/ai/tools/social.ts:26"]
- verdict: confirmed

### DOM-J2-S2 — STRENGTH: repurpose system prompt genuinely adapts per channel (not truncation)
- journey: week-of-promo-fast · type: strength · dimension: senior-quality · severity: polish
- got: The prompt prescribes a distinct native shape per channel (newsletter subject+intro+CTA, LinkedIn bullets, IG emoji+hashtags, X terse). The channel-craft is right — it's undermined only by DOM-J2-01 (starved of the article body).
- evidence: ["src/lib/ai/tools/repurpose.ts:20"]
- verdict: confirmed

---

## Grounding audit (per AI surface)
| Surface | Grounded on | Missing | Score |
|---|---|---|---|
| repurpose (Distribuce) | title, url, fixed tone | **article body**, **voice**, niche | 1/5 |
| social (Sociální sítě) | brand voice, tone, perf grounding, platform | (the article body, by design topic-based) | 4/5 |

**Journey grounding: split — 1/5 on the flagship flow, 4/5 on the alternative.** The tool that claims "one article → variants" is the weakest-grounded surface in his whole reachable set.

## Time-saved (if it worked)
Via Sociální sítě, a voiced multi-platform batch in one sitting genuinely beats his ~3–4 hr/week by-hand repurposing — **confidence: medium-high**. Via Distribuce as built, it's negative time: he'd rewrite every variant (no body, no voice), which is exactly the outcome he said makes him drop repurposing — **confidence: high** that he abandons it.

## Verdict: **L1-conditional**
The week-of-promo job is *achievable* through Sociální sítě, which clears his voice + batch bar and is a real strength. But the headline "one article → variants" surface (Distribuce) — his stated highest-leverage move — fails his hard bar on substance (headline-only), on ownership (hardcoded foreign article, no draft handoff) and on voice (fixed tone, no voice field, parenting-hashtag fallback). Fixing DOM-J2-01/02/03 would flip this to a strong pass; as-is the flagship flow is the thing that would lose him.
