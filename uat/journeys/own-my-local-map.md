---
character: Alena (solo local service owner)
goal: "Own my local search — see where I rank on the map vs competitors, keep reviews answered, and post to my Google profile consistently — in the 20 minutes a week I have, with no ad budget."
promotion: discovery
seed: demo-local (local project type, "Dentalis"). Requires: seeded reviews in the review inbox, competitor/ranking data for the map pack, catalog of services for GBP-post grounding. Assert these fixtures are non-empty before L2.
references:
  - https://searchengineland.com/local-seo-sprints-a-90-day-plan-for-service-businesses-in-2026-469059 — GBP as second homepage, review cadence, few high-impact actions
  - https://www.collaborada.com/local-seo — map-pack visibility + GBP optimization
---

## Trigger (why now)
A competitor is outranking Alena on the map, she has unanswered reviews, and her Google profile has gone quiet. She has 20 minutes between clients to fix the highest-impact things.

## Definition of done (their POV)
- A clear **map/rankings** view: where she stands vs **named** local competitors and what to fix first.
- The **review inbox** drafts **specific, on-brand** replies (referencing what the reviewer said) she can approve and send in seconds.
- A **GBP post calendar** with ready-to-approve posts **grounded in her real services**.
- **Local dominance** surfaces concrete service×location gaps, not an abstract score.
- The whole loop fits in ~20 minutes, no ad budget, no agency.

## Out of scope
- Real Google Business Profile OAuth / actually publishing posts or replies to Google (observe the app's drafting + scheduling, not live GBP writes).
- Real-time rank tracking accuracy vs live Google (the app's data is the fixture).

## Discovery hints
Entry point(s): **/app/demo-local**, then **Mapa & pozice**, **Recenze**, **Obsah — plán**, **Lokální dominance**. Do NOT script — Alena picks her highest-impact 20 minutes. A generic review reply, a vague score with no map, or a GBP post not grounded in her services is a finding.

## Grounding to check (L1)
Review-reply prompt: does it receive the *actual review text* + business/brand context, or generate generically? GBP-post prompt: does it read the service catalog? Map view: real competitor names + positions or placeholder? Score grounding N/M per surface.
