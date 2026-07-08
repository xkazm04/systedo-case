# L1 UAT — Alena (solo local service owner) · Journey: Week of promo, fast

- **Character:** alena-solo-local-service
- **Journey:** week-of-promo-fast
- **Cert level:** L1 (theoretical, code-grounded, no browser)
- **Surface:** `local` project type — demo-local, "Dentalis" (dental clinic)
- **Date:** 2026-07-08
- **Modules walked:** Obsah — plán (GBP posts, her home for this job), Sociální sítě (the only drafting surface)

## Reachability check
`obsah-plan` and `socialni` are both in the `local` sidebar (`src/lib/projects/modules.ts:120,130`). So the two entry points the journey names are reachable.

## First person (Alena)
Google keeps nagging me that my profile has gone quiet. I know posting drives cheap visibility — I just never sit down and do it. The pitch is "batch a week of posts in one sitting," so I open **Obsah — plán** expecting to approve a stack of ready posts.

What I get is a two-panel board: an idea queue on the left, a 4-week calendar on the right. The ideas are drawn from my real services and cities — "Nabídka: Dentální hygiena v Praze," "Tip: jak vybrat Zubní implantáty," "Časté dotazy: Zubní pohotovost." Nice that they're *mine* and not generic. I click "Naplánovat," it drops onto the next free day, I can mark it published, and it all sticks. The scheduling machinery is clean.

But here's the problem: **that's a title, not a post.** There's no actual post copy — no two sentences I could paste into my Google profile. I'd still have to write every single post myself; the app just gives me a headline and a calendar slot. The footer even admits it: "AI koncept z obsahového enginu je dalším krokem" — i.e. the drafting isn't built yet. So the one thing I came for — a batch of ready-to-approve posts — isn't here. This doesn't save me the sitting; it just organizes the sitting I still have to do.

So I try **Sociální sítě**, the only place I can find that actually drafts text. It writes captions — but for Facebook / Instagram / LinkedIn / TikTok, not for my **Google Business Profile**, which is the one channel that matters for a local clinic. And it wants me to type a topic and tone from scratch; opening the module doesn't hand it my services or my brand. So it's the wrong channel *and* it's back to manual input. Between "titles with no copy" and "copy for the wrong channel with no grounding," there's no fast path from "I need a week of GBP posts" to a scheduled, approved batch. I'd close the laptop and do nothing — which is exactly where I started.

## Findings

### F-ALENA-GBP-01 — Obsah — plán generates post *titles* only; no ready-to-approve GBP post copy
- **type:** missing-feature · **severity:** major
- **expected:** a batch of ready-to-approve GBP **posts** (actual copy) grounded in my real services, in one short sitting.
- **got:** an idea queue of template *titles* ("Nabídka: {service} v {area}", "Tip: jak vybrat {service}") plus a scheduling board. No post body/copy anywhere; the module has no AI generation. The footer states AI drafting is a future step.
- **evidence:** `src/lib/content-schedule/sample.ts:22-30` (title templates), `src/lib/content-schedule/sample.ts:51-59` (only a `title` is produced), `src/components/app/modules/ContentSchedule.tsx` (no `generateStructured`/`useAiTool`; schedule/publish only), `src/components/app/modules/ContentSchedule.tsx:26` (footer: "AI koncept … je dalším krokem")
- **code_check:** confirmed — no drafting on this surface; posts carry `title/service/area/status/day`, no body.
- **verdict:** confirmed
- **scope_note:** the titles ARE catalog-grounded and the scheduling spine is solid — the missing piece is the AI copy, not the plumbing.
- **l2_priority:** high

### F-ALENA-GBP-02 — Only drafting surface (Sociální sítě) is the wrong channel and ungrounded here
- **type:** confusion / quality-gap · **severity:** major
- **expected:** a low-friction path to a week of **GBP** promo grounded in my services and voice.
- **got:** Sociální sítě drafts FB/IG/LI/TikTok captions (not GBP posts), and its page mounts `<SocialClient />` with **no** project/brand/catalog context passed — so it needs manual topic entry and risks "sounds like nobody." Brand/"CO TEĎ FUNGUJE" grounding is optional in the prompt and not supplied by this surface.
- **evidence:** `src/app/app/[projectId]/socialni/page.tsx:10-14` (SocialClient rendered with no props), `src/lib/ai/tools/social.ts:20-31` (brand optional), `src/lib/ai/tools/social.ts:41-61` (topic/tone/grounding are inputs the surface doesn't auto-fill)
- **code_check:** confirmed for the channel mismatch and no props passed at this page; whether SocialClient fetches project context internally is **not** verified from this page (marked uncertain on the internal-grounding sub-claim).
- **verdict:** confirmed (channel mismatch + no on-page grounding); uncertain (SocialClient internal grounding)
- **l2_priority:** high

### STRENGTH — GBP post ideas are catalog-grounded and the scheduling spine is solid
- **type:** quality (positive) · **dimension:** Trust / Effort
- Ideas are built from the real Dentalis service catalog × localities; the idea→scheduled→published flow persists per project and posts to the activity feed. The skeleton for a great weekly ritual is here — it just needs the copy.
- **evidence:** `src/lib/content-schedule/sample.ts:37-59`, `src/app/app/[projectId]/obsah-plan/page.tsx:17-23`, `src/components/app/modules/ContentSchedule.tsx:72-90`

## Grounding audit (per AI surface)
- **GBP post copy generation:** N/A — **does not exist** on her surface (only titles).
- **GBP post-idea titles:** 2/2 — real service × locality.
- **Sociální sítě drafting:** grounding not supplied by the module's page (0/1 on-surface; wrong channel for GBP).

**Journey grounding: 2/3 for what exists — but the core deliverable (post copy) is absent.**

## Time-saved (if it worked as designed today)
Effectively **none / negative** for her actual job: she still writes every GBP post by hand; the app only schedules titles. The design *intends* a 15–20-min batch, but as coded the sitting she came to eliminate is still hers. **Confidence: high** that this fails the time-saved bar today.

## Verdict: **L1-fail**
Her definition of done — produce a week of ready-to-approve, on-brand GBP posts in one sitting — cannot be completed: the GBP surface yields titles with no copy, and the only drafting module targets a different channel without visible grounding. The scheduling spine and catalog-grounded ideas are a strong foundation, so this is a "wire the content-engine draft into Obsah — plán" fix, not a rebuild — but until that lands, the promo journey doesn't deliver.
