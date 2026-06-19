# Authed-product validation — LOCAL_DB + DEV_AUTH (2026-06-19)

Goal: confirm the new offline local-dev path makes `/app/[projectId]/*` drivable for UAT with no Google OAuth.

**Setup:** killed the pre-existing dev server (was on :3012), then `DEV_AUTH=true LOCAL_DB=true next dev --port 3100` after `npm run seed:local`. Server log confirmed `[auth] ⚠️ DEV_AUTH active — OAuth bypassed, signed in as dev@local.test`.

| Step | Route | Result | Evidence |
|------|-------|--------|----------|
| Project hub | `/app` | 200 — lists both **seeded local-DB** projects (Mionelo/eshop·12 modules, Služby/leadgen·10) + "Nový projekt". No sign-in, no Firebase needed. | `shots/app-hub.png` |
| Workspace shell + overview | `/app/demo-eshop` | 200 — guard resolved the project from local SQLite; type-aware sidebar + KPI overview render. | `shots/app-eshop-overview.png` |
| Campaigns module (empty) | `/app/demo-eshop/kampane` | 200 — empty state renders. | `shots/app-eshop-kampane.png` |
| Sync sample portfolio | POST `/api/campaigns` | **200** — Tomáš clicks "Synchronizovat z Google Ads"; portfolio loads. | `shots/app-eshop-kampane-after.png` |
| Triage (Tomáš's journey) | `/app/demo-eshop/kampane` | Fully populated: KPI cards, type breakdown, budget reallocation, and the triage table **"6 kampaní vyžaduje pozornost"** with `Kritické` badges + per-row `Analyzovat`. | `shots/app-eshop-kampane-after.png` |

## What this proves (by the change) vs. what's environment-dependent
- **Proven by LOCAL_DB + DEV_AUTH (needs no Firebase):** OAuth bypass, and **users + projects** served from `.data/systedo.db` through the whole UI — hub, guard, workspace shell, project overview, module navigation. This was previously blocked entirely for UAT.
- **Environment-dependent:** the campaigns *data* sync (`/api/campaigns`) returned 200, but that path still uses the Firestore-backed per-tenant store. It succeeded here because this dev machine has gcloud ADC credentials (the cloud product is developed here). On a truly credential-free box (e.g. CI), module data stores would still need a local backend — the tracked follow-up noted in `uat/env.md`.

## Incidental finding (minor, out of this task's scope)
- `app-hub.png`: the authed hub header still reads **"Systedo"** while the product rebranded to **"Adamant"** — rebrand looks incomplete in the authed shell. Severity: polish. (Recorded for a future pass, not fixed here.)

## Verdict
The authed product is now drivable for simulated UAT on this machine. Next: run Tomáš's `react-to-flagged-campaign` as a full scored journey (it's no longer blocked), and decide whether to extend LOCAL_DB to the module data stores for credential-free environments.
