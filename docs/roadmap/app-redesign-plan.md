# App redesign plan: Optic Bench brand, area roofs, music vertical

Status: **ADRs 0013–0017 accepted 2026-10-13; execution started.**
Section 7 records the owner's decisions; the sections below already reflect them.

Three streams, one sequence:

1. **UI.** Move the landing page, the project home and Výkon onto the *Optic Bench* brand.
   This is the contest winner: R1 `adamant-landing` A/3 (landing) and R2 `adamant-landing-r2` A/3
   (the same brand applied to `/app/{id}/vykon`). Extract a design kit from it and pay down
   performance while we are in there.
2. **IA.** Replace about 26 sidebar modules per project type with **six area roofs** (Local is standalone). Each roof is
   one visually strong page that summarises the area and opens its modules as "rooms" you dive
   into.
3. **Forge case.** Add a **music** project type: empty state, then LLM onboarding that researches
   where to distribute and which metadata to fill, then guided channel connection, then views and
   comments per channel.

---

## 1. Where we start

| Fact | Source |
|---|---|
| 37 modules in 7 sections, declared in one registry; 24–28 visible per type | `src/lib/projects/modules.ts` (`MODULES` :87, `modulesFor` :525) |
| Each module is its own route folder; there is no dynamic `[module]` segment | `src/app/app/[projectId]/*/page.tsx`, guarded by `requireProjectModule` |
| The project root is already roof-like | `ProjectOverview.tsx` (304 LOC): KPI band, sparkline, NeedsAttention |
| Výkon is a separate client dashboard | `DashboardClient.tsx` (295 LOC) |
| Partial roofs already exist | `kanaly` signpost, `schranka` (single inbox), `obsahovy-engine` (absorbed obsah) |
| 55 components in `src/components/app` exceed 200 LOC | `CatalogManagerModule` 966, `MonthlyReport` 856, `CompareSeoTable` 849, ... |
| Tokens are semantic and live in Tailwind `@theme` (navy, teal, coral) | `src/app/globals.css` |
| The winning brand ships its own `:root` tokens and self-hosted fonts | `.contest/arena/adamant-landing-r2/judging/entries/A/variant-3/vykon.css`, `fonts/` |

Because the current tokens are semantic, much of the reskin is **rebinding** (`canvas → room`,
`brand → amber`, and so on), not hunting for raw values. That is the design-tokens golden path's
point ("a redesign is a rebinding instead of a hunt"), and it is why the kit comes first.

---

## 2. Stream 1: design kit and UI migration

### 2.1 What the kit is (taken from the winner, not invented)

**Brand idea.** One beam, three moves. A detector **measures**, a prism **triages**, a lens
**generates**. Visually: a warm-black room, a white-hot hairline, eight spectral lines (one per
area or group), engraved instrument line-art, and **one amber action** per screen.

| Layer | Contents |
|---|---|
| Raw scales | `room-0..3`, `ink/ink-2/ink-3`, `hair-hi/mid/lo/xlo`, `amber/amber-hi/amber-ink`, 8 spectral `s-*`, radii `0/2/6/pill`, spacing `sp-1..8`, eases `ease`/`ease-io` |
| Semantic roles (what components use) | `surface`, `surface-raised`, `surface-sunk`, `fg`, `fg-muted`, `fg-faint`, `rule`, `rule-strong`, `action` (amber), `focus`, `good/bad/flat` (always shown with a glyph and a sign), `area-1..5` (spectral lines mapped to areas), `chan-0..6` (series colours, CVD-validated in R2) |
| Type | Display: Cormorant (headlines only; never a number or a label). Body/UI: Hanken Grotesk. Figures and tables: IBM Plex Mono. Floors: 14 px label, 16 px body (from the brief) |
| Theme | **Dark only** (D1). The light/dark token overrides and `ThemeToggle` are removed; one set of role bindings |
| Motion | Arrive, choose, open, return are each one beat. `prefers-reduced-motion` gives a static version. Film grain and vignette appear on the landing only, never on an app screen |

**Components**, ported as React into `src/components/kit/`, each under 200 LOC:

- `Button` (amber / ghost / quiet). Rebind the existing `ui.tsx` `Button`; do not fork it.
- `Station`: a page section with an engraved header (Measure / Triage / Act).
- `Panel` (the R2 `.box`) and `Ledger`: a dense-data table with mono figures.
- `Kpi` and `KpiStrip`: value, change against baseline, small trend, `good/bad/flat` glyph.
- Chart primitives (SVG): trend line with anomaly flags and a goal band, `Dial` (PNO gauge),
  `Spectrum` (channel split bar), weekday histogram.
- `Room`: the drill-down surface. It has a breadcrumb, Esc and Back, a prev/next ring, and its
  own URL (fixes R1's "Browser Back does not close rooms").
- `Lamp`: the area entry tile, with per-area engraved art and a spectral hue.
- `Honest`: the sample / stylised / live provenance badge (ties to `demo-data-plane` and
  `honest-proof-and-illustrative-data`).
- Engraved art set: one SVG motif per area (detector, prism, lens, and so on). It is drawn once,
  shared through a `<symbol>` sprite, and costs nothing at runtime.

**Where it is shown:** the existing `/design-system` route becomes the living kit, with a page per
component, both densities, and reduced motion. `docs/design-system.md` is rewritten around the new
roles, and `DESIGN.md` is recorded from the shipped kit (impeccable-documenter), not from intent.

### 2.2 Migration order

1. **Tokens.** Add the new raw scales and roles in `@theme`, then rebind the existing semantic
   names to them. Every page changes at once and nothing breaks structurally. Load fonts with
   `next/font/local` from the variant's woff2 files, subset to latin plus latin-ext so Czech
   diacritics are covered.
2. **Landing (`/`).** Port the R1 Optic Bench into `BrandLanding`. The canvas hero is a lazy client
   island (`hero.js` becomes a component). The stations and the lamp hall are server components.
   Copy lives in `T` dictionaries, **authored in English, Czech transcreated** (D5). This retires
   the Monolith hero and the `.bg-facets` pattern.
3. **Výkon.** Port the R2 page: Measure (KPI strip, trend, goal pacing), Triage (spectrum,
   channel ledger, PNO dial, weekday, funnel), Fix (alerts, insights, AI diagnosis entry), and a
   channel **Room**. `DashboardClient` breaks into kit pieces, and the data contract
   (`resolveReportDataset`) stays as it is. R2 already validated its numbers against
   `vykon-reference.json`, so that check becomes a unit test.
4. **Project home.** This becomes the Home roof (Stream 2).
5. **Everything else** gets the kit through the rebinding immediately and its layout when its
   area roof lands.

### 2.3 Performance (measured, not claimed)

- Add the new roofs and `/` to `.github/perf-budgets.json` and `a11y-budgets.json` when they
  land. Record a baseline before tightening.
- Landing: hero JS loads after LCP (the headline is text, not canvas). One canvas, and it pauses
  when off-screen or the tab is hidden. Grain is a static texture, not a full-screen 1.1 s
  animation (the variant's animated `.grain` layer repaints every frame).
- Roofs are RSC. Each area card streams in its own `<Suspense>`, so one slow store does not hold
  the page. Reads are deduped through `@/lib/session` `cache()` (the route-transition fix pattern).
- Split the components over 200 LOC as each area is touched; record progress in
  `docs/roadmap/component-debt.md`. `SpeedLeadModule` (789 LOC) looks dead behind the
  `rychla-reakce` redirect; verify and delete it with an `Ack:`.
- Keep `framer-motion` to the map only. Use CSS for page and stagger motion.

---

## 3. Stream 2: from module dashboard to area roofs

### 3.1 The principle

Every area answers three questions top to bottom, mirroring the brand: **how is it going
(Measure) → what needs me (Triage) → what do I do (Act)**. The roof answers all three in one
screen. Modules stop being destinations and become **rooms** you open from a roof card, a triage
item or an action.

### 3.2 Areas (6 roofs plus utilities)

| Area (en / cs) | Hue | Roof shows | Rooms (current modules) |
|---|---|---|---|
| **Home / Přehled** | white beam | cross-area pulse, NeedsAttention, onboarding progress, one amber next action | — (links into every area) |
| **Performance / Výkon** | cyan | KPI strip, goal pacing, anomalies, channel split | vykon detail, reporty, mesicni-report, zisk, ltv, kvalita-leadu, publikum, knihovna |
| **Reach / Dosah** (paid + search) | blue | spend vs. return per channel, keyword coverage | kampane, klicova-slova, srovnani-seo, sklad-sezonnost |
| **Local / Lokální** (standalone, D2) | orange | map-pack rank ladder, review velocity, local page coverage | lokalni, mapa, recenze, obsah-plan |
| **Studio / Tvorba** | violet | drafts in flight, what is waiting on review, what to make next | obsahovy-engine, kreativa, produktova-kreativa, experimenty-lp, ulozeny-obsah |
| **Channels / Kanály** (channels & audience) | green | channel board (connected, live, stale), inbox count, free-channel plan progress | kanaly, socialni, distribuce, twin, sprava-kanalu, schranka, leady |
| Settings / System | — | not a roof: utility menu | ucet, branding, integrace, nastaveni, katalog, spotreba, aktivita |

The Local area appears only for types that have its modules (`local` sees all four; `leadgen`
sees `lokalni` alone; the others do not see the area). `recenze` and `obsah-plan` move from
Studio into Local, because both are `local`-only today.

The sidebar goes from about 26 items to **at most 6 lamps plus a settings menu**. Rooms stay reachable
through the roof, breadcrumbs and the command palette (`CommandPalette.tsx` exists).

### 3.3 Mechanics

- **Registry.** Add an `area` field to `ModuleDef` (replacing `section`) and a `roof` contract per
  module:
  `summarize(ctx) → { headline metric?, status: ok|attention|empty|disconnected, next?: action }`.
  The roof is assembled from those summaries, so a new module appears on its roof without
  anyone editing the roof page. Availability per type still comes from `availableFor`. A roof
  with no available modules for a type is not shown.
- **Routes.** Add a roof at `/app/[id]/<area>` and nest rooms under it
  (`/app/[id]/vykon/zisk`). Old flat URLs return 308 to the nested ones, the same pattern
  `obsah → obsahovy-engine` already uses. Run `api:surface` and `docs:staleness`, and update
  `context-map.json` groups.
- **Rooms** render inside the area layout (the shell does not unmount, per app-shell). The roof
  stays as the backdrop on desktop, and the breadcrumb is always visible.
- **Empty states are first-class roof states.** A roof for an area with no data shows the
  onboarding route for that area, not zeroes. This is what makes the music case work.

---

## 4. Stream 3 (forge case): music project

### 4.1 User journey

1. **Empty project, type "Music / digital release".** The Home roof shows one amber action:
   *"Tell me about your release."*
2. **LLM onboarding (conversational, 5 steps; progress lives in `onboarding/steps.ts`):**
   1. *Who and what:* artist, track or EP, genre and mood, language, release date, goals
      (streams, followers, sync, live). Optional: links to an existing site, SoundCloud or
      YouTube, which feed the existing `onboarding-scan`.
   2. *Research:* where this track should live. The result is ranked across distribution
      (via a distributor), streaming, video, discovery and metadata surfaces, community and
      curators, and owned channels. Each entry carries fit, effort, cost (free / freemium /
      paid, with paid ones flagged and never ranked as quick wins), and a cited source URL.
   3. *Metadata audit:* what each chosen channel needs (ISRC, UPC, credits and splits, genre and
      subgenre, mood, language, explicit flag, 3000×3000 artwork, lyrics, release date, pitch
      lead time), checked against the track record. Gaps are shown as a checklist.
   4. *Connect:* the wizard per channel, extending the `ChannelWizard` and
      `ChannelTrack → deriveChannelNext` pipeline. Every connector honestly states one of:
      **API** (we read it), **import** (you upload an export), or **manual** (you type the
      number).
   5. *Launch board:* the Channels roof becomes the per-channel board.
3. **Ongoing:** the Channels roof shows views, plays and followers per channel and per track,
   and comments flow into `schranka`. The twin drafts replies, and the operator presses send
   (the red rule stays).

### 4.2 What exists, what is new

| Need | Reuse | New |
|---|---|---|
| Project type | `PROJECT_TYPE_META`, 23 `Record<ProjectType,…>` maps (the compiler lists them) | `music` entry in each; prompt framing in `TYPE_HINT` and `TYPE_FRAMING`; demo seed (fictional artist, labelled sample) |
| Track as an offering | catalog / Offering spine | `OfferingKind "track"`: isrc, upc, genre, mood, releaseDate, durationSec, artists, credits, artworkUrl, lyrics, explicit |
| Channel plan | `channel-research` op, `OrganicChannel`, `ChannelTrack`, `ChannelWizard` | music channel families; the metadata-requirements block per channel |
| **Live web research** | `/outreach` skill (operator-run, WebSearch subagents); `untrusted.ts` quarantine and its tests; the Claude CLI transport `src/lib/llm/claude.ts` | **a separate `research` stance on the Claude CLI** (section 4.4). Today the transport runs with no tools on purpose (`claude.ts:141-150`) |
| Connectors | encrypted tokens (`token-crypto.ts`), `SocialTransport` seam, lead-connector registry, integrations board | a **channel connector catalog as data** (one row per service: auth, capabilities, probe, honesty mode); YouTube and the others below |
| Metrics | `SocialMetricDay` + `social-readback` cron ("a failed read writes no row, never a zero") | `ChannelMetricDay {channel, assetId, day, views, plays, likes, comments, followers, source: api / import / manual}` |
| Comments | `SocialMessage` + `schranka` | real intake: YouTube `commentThreads` first. Today's social intake is sample-only |

### 4.3 What the channels can honestly give us

The design premise must hold up against the real APIs. These are claims to re-verify in Phase 0;
APIs change.

| Channel | Views / plays | Comments | Mode |
|---|---|---|---|
| YouTube (Data API v3, `youtube.readonly` on the Google OAuth we already have) | ✅ viewCount, likeCount | ✅ commentThreads | API |
| Spotify | — | — | **Descoped (D4).** Not connected and not shown on the board. Listed in the research output as a distribution target only (reached through a distributor) |
| Apple Music | ❌ No public stats API | ❌ | manual |
| SoundCloud | plays and comments exist in the API, but new app registration has been restricted | ✅ | verify; else manual |
| Last.fm | ✅ listeners, playcount (public API key) | ❌ | API (a cheap cross-platform signal) |
| Deezer | rank, artist fans (public API) | ❌ | API |
| Audius | ✅ plays (open API) | ✅ | API |
| Bandcamp, TikTok sounds, Instagram Reels audio | ❌ / restricted | — | manual or link-tracking (`/go` links) |

The UI never shows a number it did not read. The `Honest` badge carries api / import / manual /
sample per figure.

### 4.4 Research engine: Claude Code CLI with a `research` stance (D3)

**Premise change.** Adamant becomes **OSS and local-first**: it runs on the operator's machine,
which has LLM CLIs signed in. The Claude Code CLI is the engine. Gemini in production becomes a
hosted fallback, not the design centre. This rewrites line 5 of `AGENTS.md` ("prod = Gemini
flash") and touches the chokepoint, which is a CODEOWNERS law file. It needs an ADR, and it
completes the "SELF_HOSTED inversion" the AGPL pack left undone.

What the registry standard says. These are from `agent-cli-transport` and `mcp-tools` in
software-engineering and `funder-research` in grant-funding, consulted 2026-10-13 at
`ai-registry@b6b67b76`.

- **When a CLI call needs the web, give it a *separate* seam, not a flag on `generate`.**
  The reason: "which mode am I in?" must not be "a bug that type-checks". Today's transport is
  the `generate` stance: `--tools ""`, `--strict-mcp-config`, and no permission bypass
  (`src/lib/llm/claude.ts:141-150`). It stays exactly as it is. Add `research` as its own
  factory with these properties:
  - **Allowlist:** `WebSearch` and `WebFetch` only.
  - **Denylist** (deny wins, and the factory throws if a caller asks for any of these): `Bash`,
    `Edit`, `Write`, `Read`, `Glob`, `Grep`, MCP.
  - **Working directory:** a neutral, empty temp dir, so no project `CLAUDE.md` or skills load.
  - **Limits:** a turn cap, plus a wall-clock limit the app enforces through the existing
    termination ladder.
  - **Output:** JSON matching the operation's schema.
- **When a capability depends on the tool version or account, read it from a dated matrix and
  probe for it.** Whether WebSearch is available differs by version, account and region. The
  `probe()` runs through the same spawn path and environment as the real call. If research is
  unavailable, the UI says so and falls back to the catalog. It never pretends.
- **When text comes back from the web, treat it as data from an attacker.**
  - The research run gets no write tools at all, so an injected "now do X" has nothing to act
    on.
  - Its output is rows matching a schema, never free text passed to another operation.
  - Every quoted page snippet goes through `untrusted.ts` before any later prompt sees it.
  - New rows are added to the adversarial test corpus for fetched pages.
- **When discovery is generative, ask it to omit rather than invent, and verify independently.**
  - The prompt says *"only channels you are confident exist and accept independent artists;
    leave out anything you are unsure of; an empty section is a valid answer"*.
  - Every row carries source URL, retrieval time, confidence and the reason for that confidence.
  - A second, cheap pass tries to refute each row. Its first step is a server-side reachability
    check of the URL through the SSRF-guarded `site-fetch`. A row that fails stays out of the
    plan; it is not shown as "unverified".
- **Catalog first; research extends it.**
  - A curated *music channel catalog* (data: channel, family, cost tier, metadata requirements,
    connector mode) is the baseline and works with no CLI.
  - Research proposes additions and corrections. The operator accepts them, and accepted rows
    are cached per project.
  - This follows the zero-budget-channel-planning technique *grounding-precedence-catalog-over-scan*.
- **Cost and latency.**
  - Research takes minutes, so it runs as a background job with visible progress, started by the
    operator and never by a cron.
  - It records an `llm:budget` entry like any other operation, and it goes through
    `generateStructured` with an `// llm-tool:` tag and a golden.
  - On the CLI it bills against the operator's subscription seat. `usage.consume()` still counts
    it.

---

## 5. Phases

| Phase | Scope | Exit check |
|---|---|---|
| **0. Decide (ADRs)** | ADRs for: area IA and route nesting; dark-only kit roles; **local-first Claude CLI engine and the `research` stance** `music` type and `track` offering (English as source is already ADR-0006). Re-verify the API table | ADRs accepted; `AGENTS.md` architecture line 5 and its stale "cs is the source locale" line corrected in the same change |
| **1. Kit** | dark-only tokens and rebinding, fonts, `src/components/kit/*`, living `/design-system` | `check:ci` green; a11y budget holds; every existing page renders on the new tokens |
| **2. Landing** | Optic Bench on `/`, English source with Czech transcreated | perf and a11y budgets for `/`; owner blind check against the contest file |
| **3. Shell and IA** | `area` in the registry, sidebar with up to 6 lamps, roof routes, 308 redirects, roof `summarize` contract | e2e: every old URL redirects; every type sees only non-empty roofs |
| **4. Roofs** | Home, then Performance (R2 port), Reach, Local, Studio, Channels | each roof gets a perf budget; components under 200 LOC |
| **5a. Research engine** | `research` stance factory, probe and capability matrix, refutation pass, music channel catalog | stance test: the factory throws on a write tool; adversarial corpus green; the catalog works with no CLI |
| **5b. Music slice** | type, `track` offering, onboarding, research op, connector catalog, YouTube + Last.fm + Deezer + Audius APIs, `ChannelMetricDay`, YouTube comments → schranka | `/uat` with a musician Character, from empty state to channel board; LLM gate goldens and budget recorded |
| **6. Polish** | component-debt sweep, budget tightening, motion pass, impeccable audit | UAT sweep across all Characters |

Phases 2 and 5a can run in parallel with 3–4 once Phase 1 has landed. 5b needs 5a and, for its
final screen only, the Channels roof.

---

## 6. Gates and red rules this touches

- **LLM chokepoint (CODEOWNERS law file).** The research operation goes through
  `generateStructured`, with a `// llm-tool:` tag, a golden, and an `llm:budget --accept`. The new
  stances live in `src/lib/llm/` (the lint fence keeps provider adapters there).
- **Red list.** No publishing or replying without the operator. No credential movement. A new OAuth scope
  (`youtube.readonly`) is a console and `.env` change the owner makes.
- **Store seam.** New metrics, track and catalog stores live in `src/lib/`, each with a LOCAL_DB
  twin.
- **No new runtime dependency is assumed.** Fonts are local files and charts are hand-built SVG.
  Anything else needs an `Ack:`.

---

## 7. Owner decisions (2026-10-13)

- **D1. Dark only.** No light theme; the toggle and the light overrides go away.
- **D2. Local is its own area.** It covers lokalni, mapa, recenze and obsah-plan.
- **D3. The Claude Code CLI is the LLM engine.** Adamant is OSS and local-first, on a machine
  with LLM CLIs. Web research is a separate `research` stance (4.4), designed against the
  ai-registry.
- **D4. Spotify is descoped** (revised 2026-10-13). An earlier version of this decision put
  Spotify in scope, with browser and desktop reading experiments; the owner withdrew it. Spotify
  appears only as a distribution target in the research output.
- **D5. English first, Czech supported.** English is the authoring source for new copy; Czech is
  transcreated.
