---
character: Eva (content/SEO strategist)
goal: "Take me from a topic to an SEO brief and then a draft I could actually publish — without leaving the tool."
promotion: candidate
seed: none — public /ai-asistent, "Obsahový brief" tool. Real model calls (Claude CLI in dev).
# 2026-06-19: ran Blocked-at-draft (EV1: 60s client ceiling), then Completed after the EV1 fix. Promotion candidate.
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

## Frozen happy path
_(filled in on `promote`)_
