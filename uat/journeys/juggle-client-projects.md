---
character: Tereza (agency account / project manager)
goal: "Switch between many client projects without cross-contamination, set each up with the right type/branding, and deliver reports/microsites that are genuinely client-safe."
promotion: discovery
seed: authed local mode → /app hub with multiple demo-* projects → ProjectSwitcher, /nastaveni (type + branding), /reporty + share token → /report/<token>, /m/<slug>
references:
  - https://www.agencyanalytics.com/blog/white-label-reporting — white-label client-deliverable bar
---

## Trigger (why now)
Tereza is onboarding a new client and prepping this week's reports for two existing ones. She needs to move between accounts fast, set the new one up correctly, and send reports she won't have to apologize for.

## Definition of done (her POV)
- The active client is always unmistakable; switching never shows another client's data.
- Creating/switching project type re-composes the right modules; per-project branding (accent, name) applies to client-facing surfaces.
- Reports + white-label microsite carry the *client's* brand (no vendor name leak), with jargon glossed for a non-expert.
- Multi-client workflow is faster and safer than her manual report prep.

## Out of scope
- Real email delivery of reports (generating + previewing the client-safe artifact is enough).

## Discovery hints
Entry: /app hub → switch projects → /nastaveni → /reporty → generate a share token → open /report/<token> and a /m/<slug> microsite. Don't script — judge tenant clarity/isolation, whether branding applies, and whether the client-facing output is safe to send (no vendor leak, jargon glossed).

## Frozen happy path
_(filled in on `promote`)_
