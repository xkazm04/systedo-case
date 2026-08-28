---
character: Standa (pre-launch maker), Radek (bootstrapped consultant), Vojta (indie SaaS maker)
goal: "I have no ad budget. Tell me the handful of free places where my kind of customer will actually find me, what to do first on each, and keep it in one plan I can work through."
promotion: discovery
seed: A seeded project of the Character's type (demo-app for Standa/Vojta, demo-leadgen for Radek). The module is available for ALL five types (`src/lib/projects/modules.ts` — `kanaly`, `availableFor: ALL`). Optional but important variant: run the Start onboarding scan on a real URL and APPLY it, which is the only way a URL-first tenant's own profile reaches the plan. With no LLM provider configured the tailored plan degrades to the honest keyless demo — that is a legitimate state to certify, not a skip.
references:
  - https://awesome-directories.com/blog/indie-hackers-launch-strategy-guide-2025/ — directories/communities as the zero-budget launch surface; a listing is a one-shot task, not a channel you "run"
  - https://www.indiehackers.com/post/i-spent-0-on-marketing-and-got-1-200-website-visitors-heres-my-exact-playbook-8052e49f10 — $0, 1,200 visitors in 6 weeks; 15–20 min/day of consistent organic effort — the effort budget the plan must fit inside
  - https://seolocale.com/diy-seo-strategy-the-economic-reality-of-solo-practitioner-seo/ — solo-practitioner time economics: a few high-impact actions beat a long list
---

## Trigger (why now)
The Character has a product or a service and no money to promote it. They are not asking "how are my ads doing" — they have no ads. They are asking the question the paid modules cannot answer: **where can I be seen for free, and what is the first thing I do there?** Standa asks it before launch, Radek asks it because his pipeline dried up, Vojta asks it because a competitor with a worse product out-ranks him.

## Definition of done (their POV)
- A **URL or an existing project is enough to start** — no ad account, no budget, no spend metric anywhere on the path.
- They leave with **6–9 concrete, named Czech-market channels** — not "post on social media" — each carrying: how well it fits *their* business, how much effort it costs, why it fits, what it pays off, and **2–4 first actions** they could do today. Where a channel means "register here", it gives the link.
- The plan is **ranked**, so they know which one to do first, and one channel is called out as the quick win.
- They can **pin the plan and record a decision per channel** (who talks there — them or the twin — and what state it is in), and that decision **survives a reload**; the plan is a working document, not a one-shot generation.
- They see **one visibility plan** that joins the three legs — the query they want to be found for, the content that answers it, and the channel it gets seen on — instead of three modules that have never met. The same plan reads identically from `/kanaly` and from `/klicova-slova`.
- **Nothing reads as a placeholder or a demo artifact**: no "vaší firmy" / "vaší nabídky" filler, no "(ukázka)" marker spoken back at them inside advice, and whatever IS seeded says so plainly.
- The whole thing fits inside one sitting — for Radek, a ~30-minute weekly habit; for Standa, ~20 minutes before launch.

## Entry state
Two variants, both must hold:
1. **Catalog-first** — the project has offerings/categories/localities. The plan grounds on the catalog spine (`src/lib/organic-channels/grounding.ts`).
2. **URL-first** — an empty catalog, but the Start scan was run and applied. The applied profile (summary / offering / audience / keywords) must fill the gap; the scan's *unconfirmed competitor guesses* must NOT be asserted to the model as the tenant's rivals.

Keyless (no LLM provider): "Sestavit plán na míru (AI)" returns the curated demo plan with its "connect an LLM" tail and is billed as demo. That is the honest degrade and is in scope; a plan that pretends to be tailored when it is not is a finding.

## Out of scope
- **Outcome attribution** — whether a listing or a community post actually brought traffic. There is no analytics seam for these channels (`src/lib/organic-channels/types.ts` lifecycle carries no metrics); do not flag its absence as a broken flow, flag it as a known missing piece.
- **Paid modules** — Kampaně, budget moves, ROAS/PNO, anything with spend. Encountering them is fine; needing them is a finding.
- Publishing to a real channel, verifying a real listing went live, or measuring real rankings — unobservable here.
- Deep keyword-research quality (that is `get-found-organically`); this journey only asks whether the query leg *reaches* the plan.

## Discovery hints
Entry point(s): the project **Přehled** (which surfaces one "Kanál zdarma: X" recommendation) and **Kanály zdarma** (`/app/[projectId]/kanaly`), plus the Start checklist step "Vybrat kanály zdarma". Cross-check the same plan on **Klíčová slova**. Do NOT script the steps — this module was named by two Characters in the 2026-07-16 run as the best fit for their job *that they never found on their own*, so **whether the Character can discover it at all is the first finding of this journey**, not a precondition.

## What L1 must check (code-grounded)

**Grounding, scored N/M per AI surface.** The only LLM call on the path is `channel-research` (`src/lib/ai/tools/channel-research.ts`); the onboarding scan (`onboarding-scan`) is the optional entry surface.
- Does the applied **onboarding profile** actually reach the prompt (summary, offering, audience, keywords), or does it dead-end in its own store?
- Does the **catalog win** where both the catalog and the profile know something — i.e. does a tenant who curated a catalog get exactly the grounding they had before the profile existed?
- Do the scan's **unconfirmed competitors stay out**, and does a *failed* competitor read degrade the regenerate affordance rather than silently un-grounding it?
- Does every field the client sends survive the wire validator, and does the prompt builder emit it?

**URL safety.** A channel's `url` is a link the app tells the user to open. Verify the model's `url` is constrained to http(s) with a real host before it ever becomes an anchor, and that the anchor is `rel="noopener noreferrer"`.

**Honesty of provenance.** Seeded plan labelled as sample; a pinned AI plan not labelled sample; a failed store read fails CLOSED (falls back to the sample AND says sample); the tenant's own scanned keywords not labelled "Ukázka" in the plan.

**Placeholder and demo-marker leakage.** `{brand}` / `{category}` / `{locality}` fills, the content-engine brief seed, and the wire request must not carry "(ukázka)" or the generic filler when a real value exists.

**The Overview recommendation must read the PINNED plan**, not the seed, and must not make a claim about the channel it picked (low effort / high fit) that the picked channel does not satisfy.

**The one visibility plan.** Does the same composed artifact render on both ends of the path; are empty legs stated rather than invented; does every hop it offers point at a module this project type actually has.

## What L2 must confirm (live browser)
- **Real latency of `channel-research`** against the configured provider, measured — the page has a client ceiling and this Character's whole proposition is time saved. A plan that takes longer than the manual shortlist is a finding regardless of quality.
- **Both themes** (light and dark) on `/kanaly`: the fit bar, the stage/mode pills, the quick-win callout and the plan card.
- **Czech copy** end to end — the channel names, the rationale, the first actions and the summary must read as Czech written by a person, not as translated boilerplate; the module chrome may localize but the plan content is Czech.
- **Mobile**: the channel table drops its fit and mode columns below `sm`/`md` and the playbook opens as an overlay — verify the plan is still usable and the first actions are readable on a phone.
- **The pin survives**: generate (or accept the demo), apply, reload, and confirm the plan and the per-channel decisions are the ones on screen — including what happens when the plan renames a channel that already had a decision.
- **The degraded path**, if reachable: with the saved plan unreadable, no control may accept a decision it cannot save.

## Frozen happy path  (filled in only on `promote`)
Not promoted. `tests/kanaly.spec.ts` covers the structural spine (plan card + channel table render, no placeholder leakage, a decision pinned through the wizard survives a reload, the same card on `/klicova-slova`); the judged parts above are not yet a gate.
