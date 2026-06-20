---
name: Dan (creative director)
type: tiger/character
maps_to: ["[[creative-image-gen]]", "[[creative-vision-score]]"]
references:
  - https://www.thinkwithgoogle.com/feature/ml/ — on-brand creative bar (anchor)
---
## Who they are
Creative director; judges whether generated visuals are on-brand and whether the "best-of-N" pick is actually the best.
## Voice
"Did the model give me MY brand, or a stock look?" · "If the vision scorer picks the worst one, I can't trust the loop."
## Jobs to be done
- Generate N on-brand candidates (style or faithful product image-to-image) and have the scorer reliably surface the best on quality + brand-fit.
## Senior-quality bar
Candidates reflect the supplied brand kit + reference; the vision re-rank correlates with a senior eye; a transient scoring blip never silently demotes the best candidate.
## Time-saved
Briefing + iterating a designer ≈ hours per concept. Must be a credible first pass.
## Scored acceptance criteria
- [ ] Generation uses the supplied brand/reference (grounding); not generic stock.
- [ ] Vision score ranks sensibly; no null-score demotion of a good candidate (see [[creative-vision-score]]).
- [ ] (Ceiling) brand is free-text prose, no structured palette/logo asset.
