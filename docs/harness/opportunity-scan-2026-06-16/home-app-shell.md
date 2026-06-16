# Home, App Shell & Transitions — Opportunity Scan

> Total: 5 findings (Critical: 1, High: 2, Medium: 1, Low: 1)
> Lenses: Business Visionary + Feature Scout

## 1. No social-share (OG) image — case study renders as a blank link card
- **Severity**: Critical
- **Lens**: Both
- **Category**: growth
- **File**: src/app/layout.tsx (metadata.openGraph) + missing src/app/opengraph-image.tsx
- **Opportunity**: `layout.tsx` declares `openGraph` with title/description and `metadataBase` is correctly set from `SITE_URL`, but there is **no `images` entry and no `opengraph-image.tsx`** route anywhere (grep confirms only `openGraph:` config blocks, no `og:image`). The article pages (`clanek/page.tsx`, `clanek/vykon/page.tsx`) have the same gap. So every time this case study is pasted into LinkedIn, Slack, Messenger or a recruiter email, it previews as a text-only card with no visual.
- **Value**: This is a portfolio piece whose entire purpose is to impress a hiring reviewer who will almost certainly share the URL. A polished, auto-generated preview card is the single highest-leverage "first impression" surface and signals senior production instinct that most candidates miss.
- **Effort**: M
- **Fix sketch**: Add `src/app/opengraph-image.tsx` using `next/og` `ImageResponse` (1200×630), rendering the Systedo `Logo`, the "AI Vibecoder" eyebrow, and 2-3 of the real hero stats (`year.revenue`, `year.roas` from `totalsOf`) so the card is data-driven; add a matching `images` array to each `openGraph` block. Note `robots:{index:false}` is fine — OG cards work regardless of indexing.

## 2. Google auth is wired into the shell but does nothing on the rozcestník
- **Severity**: High
- **Lens**: Feature Scout
- **Category**: feature
- **File**: src/app/layout.tsx (Providers) + src/components/auth/AuthButton.tsx
- **Opportunity**: The shell wraps everything in `SessionProvider` and the header shows a full Google sign-in/out flow (`AuthButton`), yet `page.tsx` never reads `useSession`, gates nothing, and personalizes nothing. Auth is currently pure decoration — a built-but-unwired feature that a reviewer will click, sign in, and find changes literally nothing on the page.
- **Value**: Either pay it off or it reads as scope creep. Paying it off cheaply is impressive: a signed-in reviewer seeing their own name/avatar woven into the rozcestník ("Vítej zpět, Marku — pokračuj na Dashboard") demonstrates session-aware Server/Client composition, the exact skill the role tests.
- **Effort**: M
- **Fix sketch**: Add a small client island on the hero that reads `useSession()` and, when signed in, swaps the eyebrow/CTA copy to a personalized greeting + "continue where you left off" link; or gate the bonus `/kampane` write actions behind sign-in so auth has a concrete purpose. Reuse the existing `AuthButton` session shape.

## 3. Hero "live client snapshot" is a static bundle with no freshness signal
- **Severity**: High
- **Lens**: Business Visionary
- **Category**: differentiation
- **File**: src/app/page.tsx (heroStats / last30 / monthlyRevenue) + src/lib/data.ts
- **Opportunity**: The hero card is framed as a "live client snapshot, fed from the real dataset" and shows `last30.revenue`, a sparkline, ROAS and yearly totals — but `data.ts` is a statically-imported JSON file (`performance.json`) with `slice(-365)`/`slice(-30)` over a fixed seed. There's a `Pill tone="neutral">Ilustrativní data` but no as-of date, no "data k 16. 6. 2026", and the numbers never move. The "live" word over-promises versus what's shown.
- **Value**: For a marketing-analytics product, *recency* is the credibility currency. A visible "data k DD.MM." stamp (and ideally a relative "posledních 30 dní končících X") turns a static demo into something that reads as a real reporting surface, raising perceived product maturity for a paying agency client.
- **Effort**: S
- **Fix sketch**: Derive the last date from `performance.daily.at(-1).date` and render it next to the `Ilustrativní data` Pill ("k {fmtDate}"); optionally compute a 30-day delta vs prior 30 days with `totalsOf` and show a trend chip so the snapshot conveys movement, not just a level.

## 4. Stack-reason cards tell engineering judgment but don't show or link it
- **Severity**: Medium
- **Lens**: Both
- **Category**: differentiation
- **File**: src/app/page.tsx (STACK_REASONS section #proc-stack)
- **Opportunity**: The four `STACK_REASONS` cards ("Server-side klíče", "Data bez databáze" etc.) are static prose with no proof links. The repo already *demonstrates* each claim — Route Handlers that hold the Gemini key, the `node:sqlite` campaigns persistence noted in `site.ts` STACK_FACTS, Server Components — but the rozcestník never connects a claim to the page that proves it. A reviewer reads assertions instead of being walked to evidence.
- **Value**: "Show, don't tell" is what separates a strong engineering case study from a brochure. Linking each justification to the concrete page/route that embodies it lets a reviewer verify the claim in one click, which is exactly the trust-building a hiring decision needs.
- **Effort**: S
- **Fix sketch**: Add an optional `proofHref`/`proofLabel` to each `STACK_REASONS` entry (e.g. "Server-side klíče" → `/ai-asistent`, "Data bez databáze" → `/kampane`) and render a small "Ukázat na stránce →" link; reuse `NAV_ITEMS`/`navLabel` so labels can't drift.

## 5. App shell lacks not-found / error / loading states and motion is success-only
- **Severity**: Low
- **Lens**: Feature Scout
- **Category**: functionality
- **File**: src/app/template.tsx + missing src/app/{not-found,error,loading}.tsx
- **Opportunity**: There is no `not-found.tsx`, `error.tsx`, or `loading.tsx` at the app root (glob confirms none) — a bad URL or a thrown error in the AI/campaigns routes falls back to Next's unstyled default, breaking the otherwise meticulous shell. The `template.tsx` fade is a nice touch and `globals.css` already honors `prefers-reduced-motion`, but the transition only ever plays on the happy path.
- **Value**: A 404/500 that suddenly drops the polished `Nav`/`Footer` chrome and brand palette is the kind of seam a detail-oriented reviewer notices immediately. Branded error/empty states are cheap polish that keep the production-craft narrative intact end-to-end.
- **Effort**: S
- **Fix sketch**: Add a branded `src/app/not-found.tsx` (reuse `Container`/`Eyebrow`, link back via `NAV_ITEMS`) and a minimal `error.tsx` client boundary with a retry; keep them inside the existing `main#obsah` shell so `Nav`/`Footer` persist.
