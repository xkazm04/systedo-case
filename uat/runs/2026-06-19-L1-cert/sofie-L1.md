# L1 (theoretical) cert — Sofie (social media manager)

- **Skill under test:** simulated UAT (L1 = reason over source only; no app run)
- **Character:** Sofie — in-house social media manager (`uat/characters/sofie-social-media-manager.md`)
- **Journey:** Plan a week of on-brand social posts across channels, grounded in what's working (`uat/journeys/plan-a-week-of-social.md`)
- **Entry surface:** Social center — `/socialni` and `/app/[projectId]/socialni`
- **Date:** 2026-06-19

---

## 1. Surface model

### Entry / hosting
- Standalone route `src/app/socialni/page.tsx` — Czech "Centrum sociálních sítí"; intro copy promises "Navrhněte příspěvky, naplánujte publikaci a vyřizujte komentáře" and explicitly states demo mode (publication simulated) (`src/app/socialni/page.tsx:16-23`).
- Project-shell route `src/app/app/[projectId]/socialni/page.tsx` — same `SocialClient`, gated by `requireProjectModule(projectId, "socialni")` (`:11`). Matches the journey's seeded entry (`/app/demo-eshop` → Social center).
- Both render the single component `SocialClient` (`src/components/social/SocialClient.tsx`).

### Layout / regions (`SocialClient.tsx:40-51`)
Four stacked regions:
1. `AccountsBar` — connect/disconnect platform chips.
2. `Composer` (left, 420px sticky) — the drafting + publish form.
3. `PostsList` (right) — list of created posts.
4. `Inbox` — comments/DMs with suggested replies.

### Affordances Sofie sees

**AccountsBar** (`:55-145`)
- If unauthenticated: a "Přihlásit přes Google" button + note that draft/schedule/inbox still work without sign-in (`:92-108`).
- If authed: platform toggle chips for **Facebook / Instagram / LinkedIn** only (`:124-141`, source `SOCIAL_PLATFORMS` at `types.ts:8`). "Ukázkový režim (bez OAuth)" badge when not configured (`:117-122`).

**Composer — drafting half** (`:149-325`)
- Inputs: **Téma** free-text (`:232-237`), **Tón** select (4 tones: věcný / přátelský / prémiový / akční — `ai-types.ts:76,86-90`), **Platformy pro návrh** multi-select chips, default `{instagram, facebook}` (`:152, 257-273`).
- Two generate buttons: **"Šablona"** (deterministic) and **"Navrhnout s AI"** (LLM) (`:275-294`). Both call `POST /api/social/draft` with `ai:false|true` (`:172-194`).
- Result: a list of draft cards, one per requested platform, each with a **"Použít"** button that copies the draft into the publish textarea (`:196-199, 313-324`). A source pill shows "AI návrh" / "Ukázkový režim" / "Šablona" (`:300-312`).

**Composer — publish half** (`:327-375`)
- Platform select, content `textarea` with live char-count vs `PLATFORM_LIMITS` (`:342-353`), **"Naplánovat na (volitelné)"** `datetime-local` (`:355-363`), submit button labelled "Naplánovat" if a future time is set else "Zveřejnit teď" (`:367-374`). Posts to `POST /api/social/posts` (`:206-210`).

**PostsList** (`:382-473`)
- A flat reverse-chron list of posts with status pill (Koncept/Naplánováno/Zveřejněno/Chyba), 3-line clamp, relative/absolute timestamp, delete, and an external "odkaz" for published (`:436-468`). "Obnovit" button + reacts to a `social:posts-changed` event (`:398-404`).

**Inbox** (`:477-580`)
- Sample-seeded comments/DMs (4 fixed messages, `store.ts:77-82`), each with an editable suggested-reply textarea and "Schválit a odeslat" (`:552-572`).

### Inputs accepted (draft API — `api/social/draft/route.ts`)
- `topic` (2–200 chars, `:31-33`), `tone` (defaults to `pratelsky` if invalid, `:34`), `platforms[]` (filtered to valid, ≥1 required, `:35-38`), `ai` boolean.
- Template mode: instant, no quota (`:57-59`). AI mode: IP rate-limit + per-user daily `aiEval` quota + concurrency slot (`:62-86`), returns 429 with upgrade link to `/cena` when exhausted (`:78-84`).

### AI generation — prompt / schema / grounding (`src/lib/ai/tools/social.ts`)
- **System prompt** (`:19-26`): hardcodes a persona — "Jsi český social media manažer a copywriter pro e-shop **Mionelo (ořechy, semínka, superpotraviny)**". Rules: Czech only, no empty corporate phrases, **per-platform style** (LinkedIn professional/no emoji; Instagram visual + 3–6 hashtags; Facebook friendly + light emoji), keep tone+topic, every post must have "háček, konkrétní hodnotu a jasnou výzvu k akci," respect char limit, return valid JSON.
- **Prompt builder** (`:34-48`): injects topic, tone label, and per-platform style + char limit.
- **Schema** (`:50-69`): `{ posts: [{ platform, content }] }`, one per requested platform.
- **temperature 0.9** (`:122`); **fallback/demo** = the deterministic templates (`:77-78, 129`), used keyless and to fill any platform the model skipped (`:94-99`).
- **Validate** (`:103-118`): only checks char-limit overflow — no brand/quality check.

### Deterministic template grounding (`src/lib/social/draft.ts`)
- Tone openers + CTAs are fixed Mionelo-flavoured strings (`:17-29`); hashtags derived from topic words + `#mionelo #zdravě` (`:35-44`); LinkedIn/IG/FB get structurally different bodies (`:56-69`). This is the floor quality when keyless.

### Scheduling / "calendar" concept (in code)
- A post can carry `scheduledAt`; future-dated posts get status `scheduled` and are picked up by the cron `GET /api/cron/social` which publishes due posts via `listDueScheduled` (`store.ts:67-73`, `cron/social/route.ts:19-50`). Publishing is **simulated** (`publish.ts:14-27`).
- **There is no calendar/week view in the UI** — scheduled posts appear only as rows in the same flat `PostsList`. No date grid, no per-day layout, no week concept (grep for `calendar|week|týden` in `components/social` → none).

### Performance / "what's working" grounding (in code)
- **None.** No engagement/reach/insights data exists in `lib/social` (grep `performance|engagement|insights|metrics|reach` in `lib/social` → no matches). The draft tool receives only `{topic, tone, platforms}` — nothing about past post performance feeds the prompt. `PostsList` shows no metrics.

---

## 2. Cognitive walkthrough (in-character, over the model)

**Step 0 — land on Social center.** Sofie hits `/app/demo-eshop/socialni`. She sees a clear Czech header, a connect-accounts bar, a composer, a posts list, an inbox. *"OK, this is a social tool, I get the shape."* Clarity: good. The "Ukázkový režim" note tells her publishing is fake — fine for a trial.

**Step 1 — "I need a week of posts."** She looks for a "generate the week" / calendar affordance. There isn't one. The composer is a **single-post** form: one topic, one set of platforms, one generation = one caption per platform. To get a week she must invent and type ~5–7 distinct topics herself, generating each separately. *"Wait — where's my week? I have to feed it every topic myself?"* This is the core mismatch: her job is "don't stare at a blank calendar," but the tool still makes her supply the calendar's content ideas. Effort: higher than expected.

**Step 2 — generate one draft.** She types a topic ("nová sezónní směs ořechů"), picks tone + IG/FB, clicks "Navrhnout s AI." She'll know what to do — buttons are labelled clearly and disabled until topic ≥2 chars + ≥1 platform (`:279, 288`). Result returns as per-platform cards with a source pill. Connect intent→result: good.

**Step 3 — judge the drafts (senior bar).** The AI prompt is genuinely **channel-aware** (LinkedIn vs IG vs FB differ) and **brand-anchored** — but anchored to a *hardcoded* "Mionelo nuts/seeds" persona (`social.ts:19`), not to *her* brand voice (no brand-voice config exists anywhere). If this is the Mionelo/demo e-shop, on-voice is plausible and the per-channel rules + "hook/value/CTA" instruction are senior-ish. *"Not bad — it knows IG ≠ LinkedIn."* But she can't tell it "our voice is cheeky, drop the formal stuff" beyond picking 1 of 4 canned tones. And **keyless/demo or quota-exhausted, she silently gets the deterministic templates** ("Máte rádi ořechy? 🙌 … Mrkněte k nám 👇" `draft.ts:18-29`) which read exactly like the AI-generic filler she bounces on. The source pill ("Ukázkový režim") is her only signal she got the cheap version.

**Step 4 — "grounded in what's working?"** She looks for "repurpose your top post" or any performance signal. **Nothing.** The drafts are generated purely from her typed topic; no past-performance input feeds them, and `PostsList` shows no engagement. *"This is just an idea generator. It has no clue what's actually converting for us."* Her explicit scored criterion ("at least some grounded in what's performing") fails structurally.

**Step 5 — schedule it.** She picks a draft → "Použít" → it lands in the publish box. She sets a future date/time and clicks "Naplánovat." The post saves as `scheduled` and a cron would publish it. So a **scheduling primitive exists** and works as a workflow seam. But she sees it only as a row in a flat list — **no calendar/week grid** to lay out the week, spot gaps, or see Mon–Sun balance. *"Where do I SEE my week? I can schedule one at a time but I can't lay out the calendar."* Her "calendar/scheduling path, not a text blob" criterion is **half-met**: scheduling yes, calendar view no.

**Step 6 — channels.** She runs IG, FB, TikTok. **TikTok isn't offered** — only FB/IG/LinkedIn (`types.ts:8`). LinkedIn isn't even in her channel mix (her brief: IG/FB/TikTok). *"No TikTok? That's half my reach."* Partial channel fit.

**Step 7 — repeat ×5–7 for the week.** She loops Steps 1–5 for each topic. Each AI generation also draws down a daily `aiEval` quota (`draft/route.ts:75-84`); a week of multi-platform drafts could hit the cap and silently drop her to templates. Time-saved: the per-draft copy is fast, but the **week is a manual loop with no batch**, so the 3–4 hr → <1 hr promise is at risk from the missing batch/calendar rather than from slow copy.

---

## 3. L1 findings

```json
[
  {
    "id": "L1-SOC-01",
    "cert_level": "L1",
    "type": "missing-feature",
    "dimension": "missing-pieces",
    "severity": "blocker",
    "title": "No performance grounding — drafts are blind to what's actually working",
    "expected": "At least some drafts grounded in/ repurposed from what's already converting (Sofie's scored criterion; journey DoD).",
    "got": "The draft tool receives only {topic, tone, platforms}; no engagement/reach/insights data exists in lib/social and none is injected into the prompt. PostsList shows no metrics.",
    "evidence": "src/lib/ai/tools/social.ts:34-48,71-75; src/app/api/social/draft/route.ts:88; grep performance|engagement|insights|reach in src/lib/social → no matches",
    "code_check": "confirmed-absent",
    "suggested_acceptance": "Given prior posts with engagement, when Sofie generates a week, then at least some drafts reference/repurpose the top-performing posts or angles, and the UI labels which drafts are performance-grounded."
  },
  {
    "id": "L1-SOC-02",
    "cert_level": "L1",
    "type": "missing-feature",
    "dimension": "missing-pieces",
    "severity": "blocker",
    "title": "No 'week' batch generation — composer is single-topic, single-shot",
    "expected": "One action produces a week of on-brand posts across channels (journey goal: 'a week … without staring at a blank calendar').",
    "got": "Composer generates one caption per platform from one typed topic; to get a week Sofie must invent and run ~5–7 topics manually. No multi-day/batch/topic-plan affordance.",
    "evidence": "src/components/social/SocialClient.tsx:149-194 (single topic state, one suggest() call); src/app/api/social/draft/route.ts:27-39 (one topic per request)",
    "code_check": "confirmed-absent",
    "suggested_acceptance": "Given a brand + a target week, when Sofie clicks 'plan the week', then the tool proposes N dated post ideas across her channels in one pass, which she can edit/accept individually."
  },
  {
    "id": "L1-SOC-03",
    "cert_level": "L1",
    "type": "missing-feature",
    "dimension": "missing-pieces",
    "severity": "major",
    "title": "No calendar/week view — scheduling exists but only as a flat list",
    "expected": "A calendar/scheduling view so it's a workflow, not a one-off generator (scored criterion).",
    "got": "scheduledAt + cron publishing exist (a real scheduling primitive), but scheduled posts render only as rows in the same reverse-chron PostsList. No date grid / per-day / Mon–Sun layout anywhere.",
    "evidence": "src/components/social/SocialClient.tsx:382-473 (flat list); src/lib/social/store.ts:67-73 + src/app/api/cron/social/route.ts:19-50 (cron); grep calendar|week|týden in components/social → none",
    "code_check": "confirmed-absent",
    "suggested_acceptance": "Given several scheduled posts, when Sofie opens the Social center, then she sees a week calendar with posts placed on their day/time, can spot empty days, and can drag/reschedule."
  },
  {
    "id": "L1-SOC-04",
    "cert_level": "L1",
    "type": "missing-feature",
    "dimension": "channel-fit",
    "severity": "major",
    "title": "TikTok not supported — only Facebook / Instagram / LinkedIn",
    "expected": "Drafts per channel for IG / FB / TikTok (Sofie's channel mix; criterion: IG ≠ TikTok ≠ FB).",
    "got": "SOCIAL_PLATFORMS = facebook, instagram, linkedin. TikTok absent; LinkedIn (not in her mix) is present instead.",
    "evidence": "src/lib/social/types.ts:8; src/lib/ai/tools/social.ts:28-32 (PLATFORM_GUIDE has no tiktok)",
    "code_check": "confirmed-absent",
    "suggested_acceptance": "Given Sofie's channels include TikTok, when she selects platforms, then TikTok is offered with TikTok-appropriate draft conventions (hook-first, short, trend-aware)."
  },
  {
    "id": "L1-SOC-05",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "senior-quality",
    "severity": "major",
    "title": "Brand voice is hardcoded to one persona; no per-brand voice config",
    "expected": "Drafts match HER brand voice; she can tell it 'this is our voice' (character: 'Does this fit our voice though?').",
    "got": "Voice is a fixed system-prompt persona ('Mionelo — ořechy, semínka'); tone is 1 of 4 canned options. No brand-voice/profile config exists. On any non-Mionelo brand the voice is wrong by construction.",
    "evidence": "src/lib/ai/tools/social.ts:19-26; src/lib/ai-types.ts:76,86-90; grep brandVoice|voiceProfile → no files",
    "code_check": "confirmed-absent",
    "suggested_acceptance": "Given a brand-voice profile (examples / do's & don'ts), when Sofie generates drafts, then the prompt is grounded in that profile and she can refine it, not just pick 1 of 4 tones."
  },
  {
    "id": "L1-SOC-06",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "senior-quality",
    "severity": "minor",
    "title": "Silent fallback to deterministic templates reads 'AI-generic'",
    "expected": "Senior-grade copy every time, or a clear signal when she's getting the cheap version.",
    "got": "Keyless/demo or quota-exhausted, AI mode returns the deterministic templates ('Máte rádi ořechy? 🙌 … Mrkněte k nám 👇'), surfaced only by a small 'Ukázkový režim' pill. Templates are exactly the generic filler she bounces on.",
    "evidence": "src/lib/ai/tools/social.ts:77-78,94-99,129; src/lib/social/draft.ts:17-29; SocialClient.tsx:300-312 (pill); api/social/draft/route.ts:75-84 (quota→502/429 paths)",
    "code_check": "by-design",
    "suggested_acceptance": "Given AI quota is exhausted or no key, when Sofie clicks 'Navrhnout s AI', then she's told clearly she's getting template-quality output (not silently downgraded), with a path to real AI."
  },
  {
    "id": "L1-SOC-07",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "senior-quality",
    "severity": "needs-L2",
    "title": "Actual on-voice / hook quality of live AI output cannot be judged at L1",
    "expected": "Drafts as good as a senior social manager's — on-voice, channel-right, with a hook.",
    "got": "Prompt design is sound (per-channel rules, hook/value/CTA, char limits, Czech-only, anti-corporate). Whether real model output clears the senior bar at temp 0.9 needs a live run.",
    "evidence": "src/lib/ai/tools/social.ts:19-48,103-118 (validate only checks length, not quality)",
    "code_check": "present-but-missed",
    "suggested_acceptance": "L2: generate drafts for 5 real topics × 3 channels; a senior reviewer rates on-voice + channel-fit + hook; ≥80% pass without a full rewrite."
  }
]
```

---

## 4. L1 verdict

**L1-fail (structural gap).**

The compose → draft → schedule → simulated-publish → inbox loop is coherent and the AI prompt is thoughtfully channel-aware and brand-anchored — credit where due. But the **journey's defining requirements have confirmed-absent structural gaps**: (1) **no performance grounding** of any kind (L1-SOC-01, blocker), (2) **no week/batch generation** — it's a single-topic one-shot, so "a week without a blank calendar" is still manual (L1-SOC-02, blocker), and (3) **no calendar/week view** despite a working scheduling primitive (L1-SOC-03, major). Add **no TikTok** and a **hardcoded single-brand voice**. Two of Sofie's four scored criteria fail structurally and a third is only half-met. The senior-quality of live copy is the one open question that genuinely needs **L2**.

---

## 5. Character feedback — Sofie, first person

Okay, real talk. First impression? Decent — it's clearly a social tool, it knows Instagram isn't LinkedIn, and the AI captions aren't the soulless garbage I expected. The per-channel thing is legit, the hook/CTA discipline is there, and "Použít → drop into the box → schedule" is a clean little flow. If you handed me ONE caption to polish, I'd be fine.

But I came here to kill my Monday calendar, and this doesn't do that. I have to feed it every single topic myself, one at a time — that's the part I was hoping NOT to do. Where's "plan my week"? I run it five times by hand and I'm basically back in my spreadsheet, just with prettier filler. And it has zero idea what's actually working for us — no "your reel from last week popped, want three more like it?" That's the whole reason I'd trust an AI over my own gut: tie it to what converts. Right now it's a blank-page idea generator with good manners.

Two more things that'd make me bounce: no TikTok (that's half my reach — and why is LinkedIn here instead?), and there's no calendar. I can schedule a post, sure, but I can't SEE my week, can't spot the empty Wednesday, can't drag stuff around. That's a list, not a calendar. And the voice is baked in — I can pick one of four tones but I can't say "this is OUR voice, loosen up." For the actual Mionelo demo it probably sounds fine; for my brand it'd be wrong out of the gate.

Would I adopt it? Not yet. It respects the channels, which is more than most "AI caption" tools, so I don't hate it — but it doesn't beat my spreadsheet+Canva for a *week* of posts, and it can't tell me what's working. Give me one-click week generation, ground it in my top posts, add a real calendar and TikTok, and let me teach it our voice — then we'd talk. Until then it's a nice single-post helper, not my Friday-deadline rescue.
