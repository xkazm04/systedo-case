# Feature Scout — Nastavení (`/app/[projectId]/nastaveni`)

> Module: src/components/app/modules/ProjectSettings.tsx
> Project type: all
> Total: 5 ideas

## 1. Data-source connection manager (GA4 / Search Console / Merchant Center / CRM) in Settings
- **Category**: feature
- **Impact**: 9
- **Effort**: 6
- **Risk**: 4
- **Gap today**: ProjectSettings.tsx:78–92 only shows a **read-only** "Zdroj dat" pill (`projectDataSource`), and even Google Ads is connected elsewhere ("Připojte Google Ads účet v modulu Kampaně"). The `adsCustomerId` field is patchable (api/projects/[id]/route.ts:30) but has no UI here. The integration backlog (docs/roadmap/integration-backlog.md:63–76, Phase D / Phase E "Onboarding wizard that connects data sources per type") names GA4, Search Console, Merchant Center, CRM, ESP, GBP as the explicit follow-ups, all behind the existing `projectDataSource` seam.
- **Proposal**: Replace the single read-only pill with a "Připojené zdroje dat" card listing each source the project's `type` actually uses (e.g. eshop → Google Ads + Merchant Center; content → Search Console + analytics), each with a Connect/Disconnect/Reauthorize control and a live/sample status. Start by surfacing the Google Ads connect/disconnect (writes `adsCustomerId`) directly here so Settings is the single connection hub; stub the others as "Připravujeme" rows driven by the type→source map.
- **User value**: An agency managing many client projects sees, in one place, exactly which projects are on live vs ukázková data and can fix a disconnected feed without hunting through modules.
- **Fit**: Settings is the natural home for connections (the registry blurb already promises "napojení Google Ads"); the type-aware source list reuses `PROJECT_TYPE_META` and the documented data-source seam.

## 2. Team members, invitations & per-project roles
- **Category**: feature
- **Impact**: 9
- **Effort**: 8
- **Risk**: 6
- **Gap today**: Projects live in a **per-user** Firestore subcollection `users/{userId}/projects/{projectId}` (store.ts:1–14); there is no concept of sharing a project, no members, and no roles anywhere in the codebase (grep for role/member/invite finds only CSS/ad-copy hits). A "multi-project agency tool" today is effectively single-seat.
- **Proposal**: Add a "Tým" section to Settings: list members with role (Vlastník / Editor / Pouze čtení), an "Pozvat e-mailem" invite flow, and revoke. Back it with a per-project `members` map and gate destructive actions (delete, type change, disconnect data source) on the Editor/Owner role. Read-only members see the dashboards but not Uložit změny.
- **User value**: Agencies bring clients and junior analysts into a specific project without handing over the whole workspace; clients get safe read-only access to their own project.
- **Fit**: Directly the "team members & roles/permissions" admin capability expected of a multi-project agency tool; Settings is where ownership/permissions belong, and applies to every project type.

## 3. Project audit log (who changed what, when)
- **Category**: functionality
- **Impact**: 7
- **Effort**: 5
- **Risk**: 3
- **Gap today**: `updateProject` overwrites fields with `merge: true` and bumps `updatedAt` (store.ts:64–76) but records **no history** — a type switch (which "upraví moduly v levém menu i metriky", ProjectSettings.tsx:115) or a data-source disconnect leaves no trace. Delete is unrecoverable ("Tuto akci nelze vrátit zpět", line 187) with no log of who triggered it.
- **Proposal**: On every PATCH/DELETE/connect/disconnect, append an entry `{ at, actor, field, from, to }` to a per-project `auditLog` subcollection, and render the last ~20 entries as a "Historie změn" timeline in Settings. Especially flag high-impact changes (project type, data source, ownership) distinctly.
- **User value**: When a client dashboard "suddenly looks different", an agency can see that a teammate flipped the project type or disconnected Google Ads, and when — accountability and faster debugging.
- **Fit**: A standard admin/settings capability that pairs naturally with idea #2 (roles → actor attribution); type-agnostic.

## 4. Duplicate / archive project with guardrails (beyond hard-delete)
- **Category**: feature
- **Impact**: 7
- **Effort**: 5
- **Risk**: 4
- **Gap today**: The only lifecycle action is a hard **delete** behind a single inline confirm (ProjectSettings.tsx:189–215), and the confirm doesn't require typing the project name. There is no way to archive a finished client or to clone a project's configuration — every new client project is rebuilt from scratch via onboarding.
- **Proposal**: Add an "Archivovat projekt" action (sets an `archivedAt` flag → hidden from the switcher, read-only, restorable) as the safe default, and a "Duplikovat projekt" that clones name+type+accent+domain+connected-source settings into a new project (data not copied). Harden delete to require typing the project name to confirm and to warn about linked campaign data.
- **User value**: Agencies pause dormant clients without losing the setup, and spin up a near-identical project (same type/branding) for a sister brand in one click instead of re-onboarding.
- **Fit**: "project archive/duplicate/delete with guardrails" is core settings/admin for an agency tool; reuses `createProject`/`ProjectPatch` and applies to all types.

## 5. Notification & alert preferences per project
- **Category**: user_benefit
- **Impact**: 6
- **Effort**: 5
- **Risk**: 3
- **Gap today**: The integration backlog ships a project-wide alerts/recommendations model and an "Needs attention" Overview feed (integration-backlog.md:42–60, Phases B/C "shipped"), and an automations/rules engine (POAS<1, days-of-cover<7, etc.), but ProjectSettings has **no controls** for who gets notified or which alerts matter. Scheduled report cadence/recipients exist only inside the campaigns ReportSettings (report-config-types.ts:14–24), disconnected from the project's broader alerts.
- **Proposal**: Add a "Upozornění" section letting the user choose channels (e-mail / in-app), set a digest cadence, pick alert recipients (tie into the team from idea #2), and toggle/threshold the rule categories surfaced on the Overview feed per project. Persist as a `notifications` field on the project.
- **User value**: An account manager handling 15 projects gets a weekly digest of only the alerts that matter for each client, instead of either noise or silence — turning the existing alert engine into something actionable.
- **Fit**: Notification/alert preferences are expected settings; this puts a user-facing control on top of the already-built rules/alerts layer and works across all project types.
