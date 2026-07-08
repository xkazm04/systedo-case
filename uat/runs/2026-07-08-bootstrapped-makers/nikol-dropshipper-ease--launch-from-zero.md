# L1 UAT — Nikol (dropshipper, ease-of-use probe) · Journey: launch-from-zero

- **Character:** nikol-dropshipper-ease (non-technical, zero-patience, "just do it for me")
- **Surface:** `eshop` / demo-eshop
- **Cert level:** L1 (code-grounded, no browser)
- **Modules judged:** Přehled (first-run), Sociální sítě, Kreativa, Klíčová slova/Obsahový engine (zero-data content), Zisk / CAC→LTV (data-hungry, empty-state probe)
- **Verdict:** L1-conditional (zero-data creation paths shine; Přehled first-run leads with jargon + a portfolio view she didn't ask for)

## Nikol's review (first person)

I just launched, I have no traffic and no clue. I land on **/app/demo-eshop** expecting "here's your shop, do this next." Instead the home screen is **"Přehled portfolia — Souhrn napříč 5 projekty"** with a comparison table and a **ROAS** number. I have *one* shop. Why is it comparing five things and what's ROAS? Too much, I nearly close it. `ProjectOverview.tsx:340,351`

Even the single-shop version isn't for me: the guidance card says *"Cíl: růst obratu při udržení **PNO**. Sledujte **ROAS**…"* and the KPI tiles are **Obrat / ROAS / PNO / Konverze**. PNO and ROAS mean nothing to me and nobody explains them. `types.ts:57-60`, `modules.ts:414-416`

So I bail to the stuff I get. **Kreativa** and **Sociální sítě** both work from zero — I don't need any history or data. Type a topic, AI writes it; type a prompt (or Fill-example), it makes a picture. No "come back when you have data" screen. That's the win: I can make content on day zero. `CreativeStudio.tsx:583`, `WeekPlanner.tsx:348`

Curiosity made me poke **Zisk** and **CAC→LTV** — the sidebar shows them. Zisk is about **"POAS"** and margins, LTV is **"Kohorty… doba návratnosti… LTV:CAC"**. That's a spreadsheet person's job, not mine, and there's numbers already there that aren't even my real sales. I close them. `modules.ts:171,203`

**Net:** the make-stuff-from-zero path is great and never dead-ends. But the very first screen greets a beginner with a portfolio comparison and three acronyms, which is exactly the "this looks complicated, close tab" moment.

## Findings

### STR-1 (strength) — Zero-data creation modules produce output on day one
- type: strength · dimension: Completion/Time-saved · severity: n/a
- Sociální sítě (draft + week batch) and Kreativa need no history — she reaches a usable post/visual pre-launch with minimal input. No "connect data first" gate; social explicitly says you can preview without signing in.
- evidence: `src/components/social/WeekPlanner.tsx:348`, `src/components/ai/CreativeStudio.tsx:583`, `src/components/social/SocialClient.tsx:25` (sign-in optional prompt)
- verdict: confirmed

### F-1 — Přehled first-run leads with unexplained jargon (PNO, ROAS)
- type: confusion · dimension: Clarity · severity: major
- impact: frequency=high (first screen every session), reachability=high, trust_erosion=med
- expected: a beginner's first screen tells her what to do next in plain words.
- got: guidance card "růst obratu při udržení **PNO**. Sledujte **ROAS**…", primaryGoal pill "Obrat & PNO", KPI tiles include **PNO** and **ROAS** — all acronyms on her explicit pet-peeve list, none with a plain-language gloss or a "make your first post" next-step CTA.
- evidence: `src/lib/projects/types.ts:57,59-60`; `src/lib/projects/modules.ts:414-416` (ROAS/PNO KPI presets); rendered by `src/components/app/ProjectOverview.tsx:241,251,256-265`
- code_check: no tooltip/definition affordance on PNO/ROAS in the overview render.
- l2_priority: high · verdict: confirmed

### F-2 — First-run overview shows a cross-project PORTFOLIO comparison to a single-shop user
- type: confusion · dimension: Clarity/Match-to-real-world · severity: minor
- impact: frequency=high (in this seed), reachability=high, trust_erosion=low
- got: `page.tsx` lists ALL projects; with >1 project `ProjectOverview` renders the portfolio branch ("Přehled portfolia · napříč N projekty", blended ROAS, PortfolioCompare table) instead of her one shop's KPIs + next steps.
- evidence: `src/app/app/[projectId]/page.tsx:16-18`, `src/components/app/ProjectOverview.tsx:202,340,351`
- scope_note: the seed creates one project of every type (`uat/env.md`), so a real single-shop workspace would fall to the cleaner single-project branch (which still trips F-1). This finding is partly a fixture artifact — but any user with >1 project hits it, and the portfolio framing is wrong for a beginner.
- l2_priority: med · verdict: confirmed

### F-3 — Data-hungry modules in her sidebar are jargon walls she can wander into
- type: confusion · dimension: Clarity/Missing-pieces · severity: minor
- impact: frequency=med, reachability=high (eshop sidebar), trust_erosion=low
- got: Zisk (blurb "Marže a **POAS**"), CAC→LTV (blurb "**Kohorty**: CAC, doba návratnosti a poměr **LTV:CAC**") are one click away and speak pure analyst. For a cold-start beginner they neither teach nor redirect to a beginner action; they show seeded (not real) numbers.
- evidence: `src/lib/projects/modules.ts:171,203`
- l2_priority: low · verdict: confirmed

### F-4 — Cold-start empty states are not actually exercised (seed pre-populates metrics)
- type: quality-gap · dimension: Trust · severity: minor (L1 note)
- got: the journey's core test — "does a data-hungry module dead-end or teach when there's no data" — can't be judged from a fresh cold start because the seeded dataset always populates Přehled/Výkon/Zisk/LTV. So a genuinely-empty first-run path is untested here; the risk (blank chart / dead-end) is unverified, not cleared.
- evidence: `src/app/app/[projectId]/page.tsx:14-18` (reads seeded dataset), env note `uat/env.md` (seeded series)
- l2_priority: med (needs a truly-empty project to verify) · verdict: uncertain

## Grounding audit (zero-data reachability)

| Module | Works from zero? | Empty-state quality |
|---|---|---|
| Sociální sítě | yes (topic → draft; no history) | n/a — creation tool |
| Kreativa | yes (prompt → visual) | teaching empty state present (`CreativeStudio.tsx:54,111`) |
| Přehled | renders, but with seeded numbers + jargon | no beginner next-step CTA |
| Zisk / CAC→LTV | render seeded numbers; not zero-tested | no teaching redirect for a beginner |

**Journey grounding: creation modules degrade gracefully from zero (good); data modules' true empty states unverified under the seed (F-4).**

## Verdict

- **L1-conditional.** She *can* leave with content on day zero (social batch + visuals, no data required, no connect-wall) — the definition-of-done's "useful output from zero" is met on the creation side. But her very first screen (Přehled) greets a non-technical launcher with a portfolio comparison and three unexplained acronyms, which for this Character is a close-the-tab moment, and the data modules' cold-start empty states can't be cleared under the current seed.
- **Clicks-to-first-value (if she pushes past Přehled):** a post ≈ 2 clicks, a visual ≈ 2 clicks. **Confidence: high** for the creation paths; **medium** on the empty-state risk (needs a truly-empty project at L2).
