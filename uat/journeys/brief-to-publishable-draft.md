---
character: Eva (content/SEO strategist)
goal: "Take me from a topic to an SEO brief and then a draft I could actually publish — without leaving the tool."
promotion: acceptance
seed: none — public /ai-asistent, "Obsahový brief" tool. Real model calls (Claude CLI in dev).
# 2026-06-19: ran Blocked-at-draft (EV1), then Completed after EV1 + EV2 fixes. Promoted to acceptance gate.
references:
  - https://www.nngroup.com/articles/cognitive-walkthroughs/ — learnability of a first content task
---

## Trigger (why now)
Eva has a topic to cover for the brand and wants the tool to take her from topic → credible brief → publishable draft, and to show how it will look in search before she commits.

## Definition of done (her POV)
- She gets a brief grounded in the brand (title/meta within SEO limits, H2 outline, FAQ, internal-link suggestions) — not generic boilerplate.
- A **SERP preview** lets her judge the title/description before committing.
- She can continue the *same* loop into a **publishable draft** (paragraphs, headings, lists, FAQ) — not a dead-end at "here's a brief".
- She can get the result out (copy / export .md / JSON) to hand to an author or CMS.

## Out of scope
- Publishing to a live CMS.
- The authed content engine (`/app/[projectId]/obsahovy-engine`) — this journey is the public brief tool.

## Discovery hints
Entry point: `/ai-asistent` → "Obsahový brief" tab. The flow is `Vyplnit ukázku` → `Vytvořit brief` → review SERP preview + scorecard → `Rozepsat článek` (brief→draft). Do NOT script the wording of the brief — judge whether the output is brand-specific and whether the loop actually closes. Watch the latency vs the workspace's client timeout.

## Frozen happy path  (acceptance gate, 2026-06-19, after EV1 + EV2 fixes)
Surface: `/ai-asistent` → "Obsahový brief". Dev provider (Claude CLI) — generations are slow: brief ~50–90s, draft ~120–130s under the env-aware dev ceiling. Steps:
1. Open `/ai-asistent` → "Obsahový brief" tab → "Vyplnit ukázku" → "Vytvořit brief".
2. Confirm the brief renders (no timeout): SERP preview, scorecard, SEO metadata.
3. Confirm all three keyword-coverage chips pass ("Klíčové slovo je v title tagu / v meta popisku / v první sekci osnovy") — **EV2**.
4. Click "Rozepsat článek"; confirm a publishable draft renders (ArticleBody) with `.md` / `.json` export — **EV1**.

Acceptance (must hold on re-run):
- Brief completes without hitting the timeout state.
- All three keyword-coverage chips report "je v…".
- Draft completes and renders a full article + export controls.

Note: makes real model calls and is **slow in dev** (~50–130s/call) — run it deliberately, not on every CI push.
