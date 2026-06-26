# Home, App Shell & Transitions — Ambiguity + Business scan
> Context: The landing rozcestník (BrandLanding via page.tsx), the global HTML shell (layout.tsx), the per-navigation fade (template.tsx) and shared site constants (site.ts).
> Files analyzed: 4 listed (+ 4 adjacent: BrandLanding.tsx, ChromeGate.tsx, globals.css, lib/llm/models.ts)
> Total findings: 5

## 1. Blanket `noindex, nofollow` silently nullifies all the SEO/OG investment above it
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: src/app/layout.tsx:37 (contradicts the metadata block at :20–36)
- **Problem/Opportunity**: The root metadata invests heavily in a title template, a marketing description, keywords and full Open Graph tags (lines 20–36), then line 37 sets `robots: { index: false, follow: false }` for the entire site — with zero recorded reasoning. The two are in direct tension: search engines are told to ignore everything the metadata is carefully crafting. For a portfolio/case-study whose purpose is to be *found* and shown to prospective clients/recruiters, a blanket noindex means it never appears in search at all.
- **Why it matters**: A one-line, easy-to-miss decision either wastes the entire metadata effort (if noindex is wrong) or makes that effort dead code (if noindex is right) — and nothing in the file says which. The reasoning gap will outlive the author.
- **Fix sketch**: Add a one-line comment recording *why* (e.g. "illustrative data — don't let the demo rank for real ad-tech queries"). If discovery is actually wanted, make it environment-driven: `index: process.env.VERCEL_ENV === "production"` so the canonical domain is indexable while previews stay private. Not gate-triggering.

## 2. The front door is English-only despite the app being a cs-CZ case study
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: src/components/brand/BrandLanding.tsx:116–155 (the rozcestník rendered by src/app/page.tsx:7)
- **Problem/Opportunity**: The whole point of this app is a polished Czech (cs-CZ) marketing case study, yet the very first screen a visitor sees — hero headline, body copy, feature blurbs and both CTAs ("See it work", "Start free", "Performance dashboard") — is hardcoded English. Only the four proof-band *labels* go through `getT` (lines 43–56); everything else bypasses the i18n machinery that the rest of the app uses. A cs visitor lands on English prose, then deeper pages switch to Czech.
- **Why it matters**: The landing exists to convince a Czech audience that this agency builds polished, localized marketing — and the front door itself undercuts that story. It's also the highest-traffic page, so the inconsistency is maximally visible.
- **Fix sketch**: Move the hero/feature/CTA strings into the existing `T` dictionary pattern already in the file and resolve via `getT` (keep the brand name "Adamant" and tagline as deliberate English). The plumbing exists; this is data entry, not new infra. Watch the eslint smart-quote rule on any new cs strings. Not gate-triggering.

## 3. Footer `STACK_FACTS` hand-copies the LLM model names — the "single source of truth" it claims to be isn't sourced
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: src/lib/site.ts:23 (comment claiming SSOT at :16–19)
- **Problem/Opportunity**: The comment says STACK_FACTS is "a single source of truth so the footer can't contradict the rest of the app" — yet line 23 hardcodes the string `"LLM · claude-sonnet (dev) · gemini-3-flash-preview (prod)"`, which is a hand-typed copy of `CLAUDE_MODEL` / `GEMINI_MODEL` in `src/lib/llm/models.ts`. The same file's comment even documents a *prior* drift ("JSON persistence (bez DB)" was wrong), so this exact failure mode has already bitten once.
- **Why it matters**: When the models change (the prod model is a preview tag likely to roll), the footer will silently advertise stale model names — the opposite of the SSOT promise the comment makes.
- **Fix sketch**: Import `CLAUDE_MODEL` and `GEMINI_MODEL` from `@/lib/llm/models` and interpolate them into the footer string. This is a read-only import of constant strings — it does **not** edit any hashed LLM file, so it is **not gate-triggering**.

## 4. The landing's secondary CTA "Start free" dead-ends into the auth app; there's no contact/lead path for the real audience
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: src/components/brand/BrandLanding.tsx:130–142 (primary → /dashboard, secondary → /app)
- **Problem/Opportunity**: Both hero CTAs route into product surfaces ("See it work" → /dashboard, "Start free" → /app, the NextAuth workspace). But the actual audience of a case-study landing is a prospective *client or recruiter*, not a self-serve signup — "Start free" promises a SaaS funnel that doesn't exist, and there's no "talk to the agency / book a call" affordance or any signal that this is a live demo.
- **Why it matters**: The rozcestník is the single best place to convert interest into a conversation, and right now interest leaks straight into an illustrative login. A clear contact/demo path is the entire monetization story for an agency case study.
- **Fix sketch**: Repurpose the secondary CTA to a contact/"Book a demo" link (or a `mailto:`/calendar link) and add a small "Live demo · illustrative data" badge near the CTAs so visitors understand what /app and /dashboard are. Pure JSX/link change. Not gate-triggering.

## 5. The page-fade is global and also wraps the /app workspace — an unrecorded tradeoff
- **Lens**: 🌀 Ambiguity
- **Value**: Low
- **Effort**: S
- **File**: src/app/template.tsx:6 (`<div className="animate-fade-in">`)
- **Problem/Opportunity**: This is the only `template.tsx` in the tree, so the 0.4s `animate-fade-in` (globals.css:362) plays on *every* navigation — including inside the authed `/app` productivity workspace, which has its own sidebar shell (ChromeGate hides nav/footer there but not the template). The file's comment justifies *opacity-vs-transform* for the marketing article's sticky TOC, but never addresses whether a data app's every route change should fade at all. (Reduced-motion and print are both handled in CSS — those are fine.)
- **Why it matters**: A fade that feels premium on marketing pages can feel laggy on every click inside a dashboard-style tool; the decision to animate the app surface was made implicitly, not deliberately.
- **Fix sketch**: If the app surface shouldn't fade, gate the class the same way ChromeGate does — `"use client"` + `usePathname`, applying `animate-fade-in` only when the path isn't under `/app` (or add an `app/app/template.tsx` that renders children without the wrapper). Either way, leave a one-line note recording the intent. Not gate-triggering.
