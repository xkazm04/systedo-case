# L1 UAT — Radek (bootstrapped consultant) · Journey: cheap-inbound-leads

- **Character:** Radek — solo consultant, no ad budget, thin pipeline, burned by an agency's junk leads.
- **Surface:** `leadgen` (demo-leadgen = "Klimatherm", klimatherm.cz).
- **Cert level:** L1 (theoretical, code-grounded, no browser).
- **Modules walked:** Rychlá reakce (speed-to-lead), Kvalita leadů (lead quality). Get-found modules are in the sibling journey file.

## Reachability
All target modules resolve for `leadgen` (`src/lib/projects/modules.ts`): `rychla-reakce` availableFor `["leadgen","local"]` (line 244), `kvalita-leadu` `["leadgen"]` (232). Kampaně is reachable (80) but budget-gated — this journey never needs it. Pass.

## Radek's review (first person)

"Right, five enquiries a month and I can't fumble one. So the first thing I check: when a lead lands, does this thing help me answer fast without sounding like a robot?

Yes, actually — and this is the part I didn't expect to like. I click a lead, hit *Vygenerovat AI odpověď*, and the draft it writes is built off the **actual message the person sent me**, not a mad-lib template. Jana asks about a 200 m² office revision, and the reply acknowledges *that*, promises a fast turnaround, signs off in my brand's name, and hands me 2–3 qualification questions to ask separately. There's an SLA countdown on every lead and it shoves overdue ones to the top with a red *Eskalovat*. That's exactly the 'never lose a lead to slowness' thing I came for. For once the AI reply doesn't read as spam.

One gripe: it doesn't actually know **what I do**. The reply grounds on the message text and my brand name, but the 'type of service' it feeds the model is a crude keyword guess — if the enquiry doesn't contain 'klimatiz', 'elektroinstal', 'servis' or 'rekonstr' it just says 'poptávaná služba' (a requested service). So it can acknowledge the ask but it can't reference my offering to sound like the expert I am. Fine for a first reply; not senior-grade.

Then Kvalita leadů — this is where I get quietly vindicated. It's not a made-up 'lead score'. It's a real funnel per source: leads → qualified → won, CPL vs **cost per qualified lead**, win rate, quality score, velocity in days, and it flags the 'junk' sources that are cheap per form but expensive per real customer. That's *precisely* the agency scam I got burned by, laid out in numbers. And the best-quality source in the table is **Organic & doporučení** — no spend, top qualification and win rate. So the tool itself tells me organic beats the bought leads. Good.

What nags me: the whole view is dressed for someone running paid. The headline tiles are CPL / CPQL / junk-sources, the funnel leads with Google Ads / Sklik / Meta, and both the reply module and the quality module push me to *Kampaně / Optimalizovat bidding* as the next step. I have no budget. My organic row is right there and it's the winner, but the furniture assumes I'm buying leads. It works for me — I just have to look past the paid framing."

## Grounding audit (his signature surfaces)
- **Quick-response reply (`lead-reply`)** — Prompt receives the **actual enquiry text** (`SpeedLeadModule.tsx:390` → `lead-reply.ts:41-42`), brand name (`:35`), channel-appropriate tone (`:38`), lead name, and captured BANT so it won't re-ask what's known (`:38-45`, `describeQualification` `SpeedLeadModule.tsx:248-257`). Not generic. **Missing:** the real service catalog — service context is a 4-branch keyword heuristic that collapses to a generic label off the demo trades (`SpeedLeadModule.tsx:174-181`). **Grounding 4/5.**
- **Lead-quality (`lead-source-diagnosis` + module)** — Real computed per-source metrics: leads/qualified/won, CPL, CPQL, win rate, quality score, funnel, velocity, period-over-period drift + alerts (`lead-quality/sample.ts:36-51`, `LeadQualityModule.tsx:146-192`). Diagnosis prompt gets only real figures + named peer sources and explicitly handles **unpaid** sources ("Neplacený zdroj — cenu/CPQL neřeš", `lead-source-diagnosis.ts:60-67`). Real CRM-style signal, not a placeholder score. **Grounding 5/5.**

## Findings
See JSON block in the return message (ids R1-1 … R1-4).

## Time-saved (if it worked as designed)
Drafting an on-point reply + qualifying + tracking response time by hand is ~15-20 min per lead; the inbox makes it ~2-3 min and never lets one go cold. Across his handful of monthly leads that's the difference between answering all of them well and dropping the ones that arrive when he's heads-down on a job. **Confidence: high** for the reply + quality loop — both are genuinely grounded.

## Verdict
**L1-pass (conditional).** The two things that matter most to Radek here — an on-point, non-spammy reply grounded in the real enquiry, and a lead-quality view that measures *qualified* value over cheap volume — are real and organic-usable. Conditions: the reply doesn't ground in his actual services, and the lead-quality/next-step framing leans paid even though the organic path stands on its own. **Grounding: 4.5/5 average.**
