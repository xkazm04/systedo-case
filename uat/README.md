# Simulated UAT — Character-driven acceptance (`uat/`)

This folder is **this repo's instantiation** of the simulated-UAT standard. It is driven by the `/uat` skill (`.claude/skills/uat.md`). The skill is the portable engine; everything here is repo-specific config.

The premise: instead of asserting that features are technically correct, we put **Characters** — durable, representative users with real jobs-to-be-done — through **journeys**, and have a capable LLM drive the real app *in-character* (cross-checked against the code) to find where the journey breaks, where quality falls short, or where a piece is simply missing. It is automated **heuristic evaluation + cognitive walkthrough + jobs-to-be-done acceptance**.

> We say **Character**, never "Persona".

## Layout

| Path | What it is |
|------|------------|
| `characters/*.md` | Durable representative users. The reusable IP. |
| `journeys/*.md` | Goals (not scripts) with a user-POV definition-of-done. |
| `rubric.md` | The evaluation lens + severity scale + finding types. |
| `env.md` | How to reach a known, reproducible start state. |
| `accepted-gaps.md` | Baseline of known/accepted issues (suppressed in runs). |
| `runs/<date-slug>/` | Journals, screenshots, `findings.json`, `report.md`. |

## Run it

```
/uat init       # scaffold/regenerate this overlay (does web research)
/uat update     # diff-aware refresh after the app changes
/uat run        # drive the discovery loop, produce a scorecard
/uat run --surface /kampane     # scope to one surface
/uat promote react-to-flagged-campaign   # freeze a clean journey into an acceptance gate
```

---

## Character template

```markdown
---
name: <First role-tag>
role: <real-world job title>
maps_to: <context-map domains/surfaces this Character lives in>
tech_level: <novice | comfortable | power-user>
promotion: discovery
references:
  - <url> — <what bar it sets>
---

## Who they are
<1–3 sentences: company, seniority, what pressure they're under.>

## Jobs to be done
- <the job they "hire" the app for, in their words>

## What "good" looks like (acceptance expectations)
<Externally grounded — cite the research. e.g. "expects to see ROAS and
where to cut spend within ~30s; a dashboard of >10 KPIs that don't say
what to do next is failure.">

## Pet peeves / friction triggers
- <what makes them bounce or distrust the product>

## Emotional baseline
<patience, skepticism, vocabulary — how they react to friction>
```

## Journey template

```markdown
---
character: <character name>
goal: <one line, in the Character's words>
promotion: discovery        # discovery | candidate | acceptance | retired
seed: <env preconditions / seed needed>
references:
  - <url> — <bar it sets>
---

## Trigger (why now)
<what makes the Character open the app today>

## Definition of done (their POV)
- <observable outcomes that mean "I got my job done">

## Out of scope
- <explicitly NOT this journey, to avoid false "missing" flags>

## Discovery hints
Entry point(s): <route>. Do NOT script the steps — the Character finds
their own path; getting lost is itself a finding.

## Frozen happy path  (filled in only on `promote`)
<the stable step sequence + acceptance, once this graduates to a gate>
```
