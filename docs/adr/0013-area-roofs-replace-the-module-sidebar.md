# ADR-0013 — Six area roofs replace the module sidebar; modules become rooms nested under them

## Status

Accepted (2026-10-13, by the owner). The owner set the direction and the area cut, including
Local as its own area. This record is the design that carries it out.
Plan: `docs/roadmap/app-redesign-plan.md` §3.

## Context

The authed product is 37 modules in 7 sections. All of them are declared in
`src/lib/projects/modules.ts`, and the sidebar shows 24–28 of them per project
type (`src/components/app/AppSidebar.tsx`, the section rail, since replaced by `src/components/app/nav/AreaRailNav.tsx`).
Each module is a separate destination with its own route folder under
`src/app/app/[projectId]/`, and most are drawn as a dashboard of their own.

The result is a product you navigate by memory. A tenant who wants to know "how
is my local visibility going" has to know that the answer is split across
`lokalni`, `mapa`, `recenze` and `obsah-plan`. The tree already shows the need
for one page per area, because three pages have grown into one:

- the project root (`src/components/app/ProjectOverview.tsx`): a KPI band plus
  NeedsAttention;
- the `kanaly` signpost, which joins catalog, competitors, scan and twin state;
- `schranka`, the single inbox for everything the twin writes.

None of them is a pattern the registry knows about, so each was built by hand.

## Decision

**1. Six areas, one roof each.** The project is organised as:

| Area | Rooms (current module keys) |
|---|---|
| Home | none of its own; it summarises the other areas |
| Performance | vykon, reporty, mesicni-report, zisk, ltv, kvalita-leadu, publikum, knihovna |
| Reach (paid and search) | kampane, klicova-slova, srovnani-seo, sklad-sezonnost |
| Local | lokalni, mapa, recenze, obsah-plan |
| Studio | obsahovy-engine, kreativa, produktova-kreativa, experimenty-lp, ulozeny-obsah |
| Channels | kanaly, socialni, distribuce, twin, sprava-kanalu, schranka, leady |

Settings and system modules (ucet, branding, integrace, nastaveni, katalog,
spotreba, aktivita) do not get a roof; they go into a utility menu.

**2. The `area` field replaces `section`, and availability is unchanged.**
`ModuleDef` in `src/lib/projects/modules.ts` gets `area` in place of `section`.
`availableFor` still decides which project types see which rooms. A roof is shown
only when at least one of its rooms is available for the type. So `local` sees
every Local room, `leadgen` sees `lokalni` alone, and the other types do not see
the Local area at all.

**3. A roof is built from what its modules report, not hand-built.** Each module
contributes a summary through one contract:

```
summarize(ctx) → { metric?, status: "ok" | "attention" | "empty" | "disconnected", next?: Action }
```

The roof lays these out top to bottom in three bands: Measure (how is it going),
Triage (what needs me) and Act (one action button). A new module therefore
appears on its roof without anyone editing the roof page. An `empty` or
`disconnected` status shows that area's setup route instead of a zero.

**4. Rooms are nested routes.** A roof lives at `/app/[id]/<area>` and its rooms
under it, for example `/app/[id]/performance/zisk`. Every flat URL that exists
today answers with a 308 to its nested equivalent, the way
`src/app/app/[projectId]/obsah/page.tsx` already redirects to
`obsahovy-engine`. `requireProjectModule` (`src/lib/projects/guard.ts`) keeps
being the single gate for a room.

**5. The shell stays mounted, and the room has a URL.** Rooms render inside the
area layout. The breadcrumb is always visible, and Esc and browser Back both
return to the roof. The contest prototype got this wrong: a room was in-page
state, so Back did not close it. The command palette
(`src/components/site/CommandPalette.tsx`) indexes rooms, so someone who knows
the module name still gets there in one step.

## Consequences

- The sidebar goes from about 26 items to at most six area entries plus a menu.
  Discoverability now depends on the roofs being good. A roof that only lists
  links has not met the decision.
- Every module owes a `summarize`. Until it has one, its card on the roof is a
  plain entry tile. That is allowed, but it is visible debt and is counted.
- Route nesting moves every module path. `npm run api:surface:write`,
  `context-map.json`, the e2e specs, `.github/perf-budgets.json` and
  `.github/a11y-budgets.json` all name routes and move in the same changes. Every
  old URL gets an e2e redirect assertion, so a bookmark that breaks breaks a
  test.
- `recenze` and `obsah-plan` move from Studio to Local because both are `local`
  only. If either becomes available to another type, the cut has to be revisited.
- The root `ProjectOverview` becomes the Home roof. `DashboardClient`
  (`src/components/dashboard/DashboardClient.tsx`) becomes the Performance roof's
  main room, built from kit parts (ADR-0014).

## Revisit when

- **A roof's status band is mostly `empty` for a project type** that sees it. The
  area is then the wrong cut for that type, and its rooms belong somewhere else.
- **Tenants reach rooms mainly through the command palette rather than the
  roof.** In that case the roof is a detour and not a summary. UAT Characters are
  the instrument for this; there is no telemetry.
- **A seventh area is proposed.** At that point the cut is drifting back toward
  the module list it replaced, and it should be questioned as a whole rather than
  added to.

## Consequences observed

_Read back 2026-10-13, the day it was accepted._ Nothing has tested this yet. It
counts as "settled" only because four records landed in the same change. The
predictions above are still predictions. The first real evidence will be the
Home and Performance roofs and the redirect e2e suite, and this section should
be rewritten once those have shipped.
