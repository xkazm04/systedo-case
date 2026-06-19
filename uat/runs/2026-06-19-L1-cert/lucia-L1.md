# L1 Certification — Lucia (agency owner) · "Produce a client report"

- **Run:** 2026-06-19 · L1 (theoretical / surface-model only — no app, no browser, no dev server)
- **Character:** Lucia — agency owner/principal (`uat/characters/lucia-agency-owner.md`)
- **Journey:** `uat/journeys/produce-a-client-report.md` — "A branded, always-current client report/microsite the client understands, near-zero manual assembly."
- **Verdict:** **L1-pass (conditional)** — the designed flow can complete the job and is genuinely time-saving, but ships with two confirmed white-label/brand-leak defects that violate Lucia's #1 scored criterion. Pass is conditional on those being fixed before an L2 live run.

---

## 1. Surface model (cited)

### Entry points & where the controls actually live
Lucia's journey names two entries: **Reports** (`/app/[projectId]/reporty`) and the microsite + shared report (`/report/[token]`). The surface is split across two modules:

- **Reports module** `src/app/app/[projectId]/reporty/page.tsx:12-19` — renders **only** `<SharedReportsList>`. It is a *management* surface (view counts, expiry, revoke). Its own description text says reports are *created* "v modulu Kampaně tlačítkem „Sdílet report"" (line 15). So there is **no create-report and no branding affordance on the Reports page itself** — they live in the Campaigns module.
- **Campaigns module** `src/app/app/[projectId]/kampane/page.tsx:24` mounts `CampaignsClient`, which is where the real work happens:
  - "Sdílet report" button — `src/components/campaigns/CampaignsClient.tsx:251-261`. Only rendered when an `overall` portfolio evaluation exists (`{overall && …}`).
  - `<ReportSettings />` (white-label + cadence) — `CampaignsClient.tsx:323`.
  - `<MicrositeCard />` (publish public microsite) — `CampaignsClient.tsx:326`.
  - `<SharedReportsList />` also rendered inline — `CampaignsClient.tsx:306`.

### Share-link flow (state + freshness)
- Create: `POST /api/campaigns/share` → `createSharedReport(tenant, accountName)` `src/lib/campaigns/shared-report.ts:64-94`. It **snapshots** the *current* portfolio evaluation (`getReportsForPeriod(...).overall`), campaigns, history, and daily series at creation time, and stamps `brandName`/`accentColor` from `getReportConfig` (lines 83-88).
- Precondition: returns `null` if there is no `overall` evaluation yet → API returns 409 with a plain-language nudge "Nejdřív vyhodnoťte celé portfolio…" `src/app/api/campaigns/share/route.ts:30-35`.
- Token: `randomBytes(16)` unguessable; TTL 30 days (`SHARE_TTL_DAYS`, line 21); view-counted; `noindex` (`src/app/report/[token]/page.tsx:21`); listable + revocable per-tenant (`listSharedReports`/`revokeSharedReport`, lines 115-141). Solid privacy hygiene.
- **Freshness caveat (key):** a shared `/report/[token]` is a **frozen snapshot**, not live. "Always-current" for the share link means *re-share* (a new link reflects new data; the old one does not). The scheduled cron (`/api/cron/report`) regenerates a *new* link weekly/monthly — that is how the share path stays current, not by the link auto-updating.

### Microsite flow (this IS auto-current)
- `MicrositeCard` `src/components/campaigns/MicrositeCard.tsx` → `POST /api/microsite` → `enableMicrosite` `src/lib/microsite.ts:99-116`.
- Public page `src/app/m/[slug]/page.tsx` is **server-rendered on every request** and `buildMicrositeView` re-derives the article from the latest snapshot each time (`src/lib/microsite.ts:124-143`), with `revalidate = 86400` + a daily cron (`/api/cron/microsite/route.ts`) calling `revalidatePath`. This is genuinely always-current and `index:true` on purpose (page.tsx:34) — a living, search-findable proof page.
- **Data-source caveat:** `buildMicrositeView` reads `performance` from `@/lib/data` (the case-study dataset), **not the tenant's synced series** — the file header admits "wiring a live tenant's synced series … is the documented next step" (`src/lib/microsite.ts:9-10`). So today every tenant's microsite renders the **same demo numbers**, regardless of client. This is a correctness/trust hole for a real Lucia.

### Branding controls (white-label)
- **Shared report:** `brandName` + `accentColor` configured in `ReportSettings.tsx:85-114`, persisted via `PUT /api/campaigns/report-config` (`route.ts:40-61`, validates hex, caps brandName at 60 chars). Rendered on the report as an accent bar + eyebrow + footer (`report/[token]/page.tsx:36,49,52,118`).
- **Microsite:** `accentColor` is exposed in `MicrositeCard.tsx:135-140`; `brandName` is **NOT** sent by the card (it posts only `{clientName, accentColor, periodDays}` — `MicrositeCard.tsx:55`). Server defaults `brandName` to `clientName` (`microsite.ts:108`). For the microsite the header shows the *client's* name as the brand, which is arguably correct for a client-facing proof page.

### Jargon vs plain language (client-legibility)
- The shared report KPI tiles are raw acronyms: **"PNO"**, **"ROAS"** with no gloss (`report/[token]/page.tsx:37-42`). PNO = the exact term Lucia's persona calls out ("My client won't understand 'PNO'").
- The microsite article (`snapshot-to-article.ts`) is more client-legible — narrative "Co se daří / Na co si dát pozor / Doporučené kroky", a FAQ, plain Czech sentences — but still sprinkles "PNO"/"ROAS" unglossed in the perex and stat block (e.g. lines 59, 64-67, 131).

### Brand-leak surfaces (the "Systedo vs Adamant" issue)
The app is rebranded to **Adamant** (`src/app/layout.tsx:17,22`; Nav/Footer). But the report paths still default to the old **"Systedo"**:
- `report/[token]/page.tsx:36` → `const brand = shared.brandName || "Systedo";` and the footer "Vygenerováno v {brand}" (line 118).
- `api/cron/report/route.ts:61` → `const brand = config.brandName || "Systedo";` — leaks into the client *email subject + body* (lines 70-71, 73, 76).
- `ReportSettings.tsx:91` → input placeholder `"Systedo"`.
- `snapshot-to-article.ts:205` → `author: "Systedo · marketingová analytika"` — **hardcoded, not overridable by `brandName`** (though this `meta.author` is not currently rendered on the `/m` page body — only `<ArticleBody>` is; it does feed nothing client-visible today, so lower severity).

### Scalability per-account
- Branding is **per-tenant**, not per-client: `report-config` is stored at `tenants/{tenant}/config/report` (`report-config.ts:15`) and `getMicrositeForTenant` enforces **one microsite per tenant** (`microsite.ts:77-85`, `.limit(1)`; `enableMicrosite` keys by slug but the management card only surfaces one). An agency with 10 clients under one tenant cannot give each its own branded report/microsite from this UI. Scheduled cron is per connected tenant. So "scales across accounts" holds only if each client is its own tenant/login — not modeled here.

---

## 2. Cognitive walkthrough — in Lucia's voice (designed experience)

**Step 1 — "Where do I make this month's report?"** I click **Reports** (it's literally the nav item that matches my goal). I land on a page that only lists *links I've already made* and tells me to go to **Kampaně** to actually create one. That's a detour — the create + branding controls aren't where I'd look first. *(confusion / discoverability — step 2 fail; controls exist, just not here.)*

**Step 2 — Branding.** In Campaigns I find "Automatický report pro klienta" with a **Název značky (white-label)** field and an **accent color** picker. Good — this is the thing I've been burned on before. But the placeholder says **"Systedo,"** and if I leave the field empty, the client-facing report footer reads "Vygenerováno v **Systedo**" and the scheduled email is signed **"Systedo."** I have never heard of "Systedo" — even the tool calls itself Adamant now. If I forget to fill this in, my client sees a random vendor's name on *my* report. That is exactly the pet peeve that makes me distrust a tool. *(trust / quality-gap — major.)*

**Step 3 — Generate.** The "Sdílet report" button only appears after I run "Vyhodnotit portfolio." Reasonable, and the 409 message tells me so in plain Czech. One click gives me a private, expiring, view-counted link. Compared to my account manager hand-building a deck for 1–2 hours, this is seconds. *(Time-saved: strongly positive on the designed flow.)*

**Step 4 — Will my client understand it?** I open the link. Four big tiles: Náklady, Hodnota konverzí, **ROAS**, **PNO**. My client is a furniture e-shop owner, not a marketer — "PNO" and "ROAS" mean nothing to her, and there's no tooltip or one-line gloss. The AI evaluation below is decent prose, but the headline KPIs lead with jargon. My best account manager would label these "Návratnost" / "Podíl nákladů na obratu (PNO)" with a hover explainer. *(quality-gap / clarity — major against my senior bar.)*

**Step 5 — "Is it always current?"** Two different answers and the UI doesn't distinguish them for me. The **share link is a frozen snapshot** — if I send it Monday and the client opens it Friday, it still shows Monday. The **microsite** genuinely re-renders from the latest data. I'd expect "always-current" to mean the link I hand over updates; instead I have to re-share or rely on the scheduled cadence. The cadence setting (Týdně/Měsíčně) covers this, so it's defensible — but the snapshot-vs-live distinction isn't surfaced anywhere a client or I would see it. *(clarity — minor; design is sound, labeling is thin.)*

**Step 6 — "Will it scale to my book?"** Branding and the microsite are **one per tenant**. If I run 10 clients under one agency login, I can't brand or publish a per-client microsite for each. The microsite also currently renders the **same demo dataset** for everyone (`microsite.ts:9-10`). So as designed, scaling assumes one-tenant-per-client, which isn't how my single agency account works. *(missing-piece / trust — major for the microsite data; minor-to-major for per-client branding depending on tenancy model.)*

**Net feeling:** The bones are right and the time-saving is real. But two things would stop me handing this to a client today: a foreign vendor name can leak onto *my* report, and the headline metrics speak marketer, not client.

---

## 3. L1 findings

```json
[
  {
    "id": "L1-LUCIA-01",
    "cert_level": "L1",
    "type": "trust",
    "dimension": "Trust",
    "severity": "major",
    "title": "Client report leaks a vendor brand ('Systedo') when brandName is blank — and 'Systedo' isn't even the tool's current name (Adamant)",
    "expected": "An un-configured client report is brand-neutral or carries the agency's brand — never a vendor's name. White-label is Lucia's #1 scored criterion and explicit pet peeve.",
    "got": "brandName defaults to the literal 'Systedo' on the public report footer, in the scheduled client EMAIL subject+body, and as the ReportSettings placeholder. The app elsewhere rebranded to 'Adamant', so this is also a stale brand string.",
    "evidence": "src/app/report/[token]/page.tsx:36,118; src/app/api/cron/report/route.ts:61,70-76; src/components/campaigns/ReportSettings.tsx:91",
    "code_check": "grep 'brandName \\|\\| \"Systedo\"' confirms two runtime defaults; layout.tsx:17 SITE='Adamant' confirms the inconsistency",
    "suggested_acceptance": "With brandName empty, no public report/microsite/email renders any vendor name; placeholder is neutral or the agency's own. Add a test asserting the rendered report footer + cron email contain neither 'Systedo' nor 'Adamant' when brandName is unset."
  },
  {
    "id": "L1-LUCIA-02",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "Clarity",
    "severity": "major",
    "title": "Headline client KPIs are raw jargon ('PNO', 'ROAS') with no gloss — the exact thing Lucia's persona flags",
    "expected": "A non-marketer client understands the value at a glance; acronyms are labeled or glossed (Lucia: \"My client won't understand 'PNO'\").",
    "got": "Shared-report KPI tiles render bare 'ROAS' and 'PNO' with no tooltip/expansion; the microsite article also uses PNO/ROAS unglossed in perex and stat block.",
    "evidence": "src/app/report/[token]/page.tsx:37-42; src/lib/snapshot-to-article.ts:59,64-67,131",
    "code_check": "KPI label strings are literal 'ROAS'/'PNO'; no title/aria gloss on the tiles",
    "suggested_acceptance": "Each acronym KPI carries a plain-language label or hover gloss (e.g. 'PNO — podíl nákladů na obratu'); a client-legibility check passes on the report and microsite."
  },
  {
    "id": "L1-LUCIA-03",
    "cert_level": "L1",
    "type": "trust",
    "dimension": "Trust",
    "severity": "major",
    "title": "Microsite renders the case-study demo dataset for every tenant, not the client's real synced data",
    "expected": "A published client microsite shows THAT client's performance numbers.",
    "got": "buildMicrositeView sources `performance` from @/lib/data (the fixed case-study dataset) for all tenants; the file header states wiring live synced series is 'the documented next step'.",
    "evidence": "src/lib/microsite.ts:9-10,131-141",
    "code_check": "buildMetricsSnapshot(performance, …) uses the static import, not tenant-scoped series",
    "suggested_acceptance": "Microsite snapshot is built from the owning tenant's latest synced series; two tenants with different data produce different microsites."
  },
  {
    "id": "L1-LUCIA-04",
    "cert_level": "L1",
    "type": "confusion",
    "dimension": "Effort",
    "severity": "minor",
    "title": "Branding + create-report controls are not on the 'Reports' page where Lucia looks first",
    "expected": "From the nav item matching her goal (Reports), Lucia can create and brand a report.",
    "got": "/app/[projectId]/reporty renders only SharedReportsList (manage existing links) and tells her to go to the Campaigns module; ReportSettings/MicrositeCard/'Sdílet report' live only in CampaignsClient.",
    "evidence": "src/app/app/[projectId]/reporty/page.tsx:12-19; src/components/campaigns/CampaignsClient.tsx:251,323,326",
    "code_check": "grep 'ReportSettings|MicrositeCard' under src/app/app returns no matches — controls absent from the Reports route",
    "suggested_acceptance": "The Reports page exposes (or deep-links with clear CTA to) branding + create-report, so the journey's entry point is self-sufficient."
  },
  {
    "id": "L1-LUCIA-05",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "Missing pieces",
    "severity": "minor",
    "title": "Per-client white-label/microsite is one-per-tenant; doesn't model an agency running many clients under one login",
    "expected": "10 clients ≠ 10× work AND each client gets its own brand/microsite (Lucia scales the book under her agency account).",
    "got": "report-config is per-tenant (tenants/{tenant}/config/report) and getMicrositeForTenant enforces one microsite per tenant; no per-client branding dimension in the report/microsite config.",
    "evidence": "src/lib/campaigns/report-config.ts:15; src/lib/microsite.ts:77-85,119-122",
    "code_check": "configRef + getMicrositeForTenant are tenant-keyed with .limit(1); no clientId axis",
    "suggested_acceptance": "Branding + microsite can be configured per client/account within one tenant, or the tenancy model documents one-tenant-per-client as the intended scaling unit."
  },
  {
    "id": "L1-LUCIA-06",
    "cert_level": "L1",
    "type": "confusion",
    "dimension": "Clarity",
    "severity": "minor",
    "title": "Shared report is a frozen snapshot but nothing signals 'as of <date>, re-share for fresh' to Lucia or the client",
    "expected": "'Always-current' is clear: either the link auto-updates or it's clearly stamped as a point-in-time snapshot with a refresh path.",
    "got": "The link snapshots data at creation; the page shows 'vygenerováno {createdAt}' but doesn't tell Lucia the link won't update, and the freshness model differs silently from the microsite (which does auto-update).",
    "evidence": "src/lib/campaigns/shared-report.ts:64-94; src/app/report/[token]/page.tsx:62",
    "code_check": "createSharedReport persists a static doc; getSharedReport never re-derives from current data",
    "suggested_acceptance": "The report and the share-management UI clearly label snapshot freshness and offer a one-click 'refresh/re-share'; cadence option is surfaced as the always-current path."
  },
  {
    "id": "L1-LUCIA-07",
    "cert_level": "L1",
    "type": "quality-gap",
    "dimension": "Senior-quality",
    "severity": "polish",
    "title": "snapshot-to-article hardcodes author 'Systedo · marketingová analytika', not overridable by white-label brand",
    "expected": "Every author/publisher string on a client artifact is white-labelable.",
    "got": "Article meta.author is the literal 'Systedo …'; not driven by brandName. (Not rendered in the current /m page body — only ArticleBody is — so client-invisible today, but a latent leak if author/AuthorBio is ever shown.)",
    "evidence": "src/lib/snapshot-to-article.ts:205",
    "code_check": "meta.author is a string literal; /m/[slug]/page.tsx renders <ArticleBody> only, not meta.author",
    "suggested_acceptance": "Article author/publisher derives from the configured brand; no hardcoded vendor name in generated client content."
  }
]
```

---

## 4. L1 verdict

**L1-pass (conditional).**

Rationale against Lucia's scored criteria:
- **Branded / white-label:** PARTIAL → the controls exist and stamp the report/microsite, but the **blank-default leaks a vendor brand** (Systedo) onto client-facing surfaces incl. email (L1-LUCIA-01). The mechanism is there; the safe default is not.
- **Always-current + minimal assembly:** PASS (designed) for the **microsite** (true auto-render + daily cron) and **PASS-with-caveat** for the share link (snapshot + scheduled cadence; freshness model under-labeled, L1-LUCIA-06).
- **Client-legible:** PARTIAL → narrative microsite is good; headline KPIs lead with unglossed PNO/ROAS, the persona's named failure mode (L1-LUCIA-02).
- **Scales across accounts:** PARTIAL → time-saving is real and near-zero assembly per report, but per-client branding/microsite is one-per-tenant and the microsite currently shows demo data for all (L1-LUCIA-03, L1-LUCIA-05).

The journey is **completable** and **meaningfully time-saving** as designed, which clears the L1 bar. It is **not L1-clean**: two `major` defects (brand leak, jargon) and one `major` trust hole (demo-data microsite) directly hit Lucia's top criteria. Treat the pass as conditional — these should be closed before promoting to an L2 live run.

---

## 5. Character feedback — Lucia, first person

> The bones are genuinely good. One click after a portfolio eval and I've got a private, expiring, view-counted link instead of my account manager losing a Friday afternoon to a deck — that's the economics I'm buying. The microsite is even better: a living, search-findable page that updates itself. If it pointed at *my client's* numbers I'd be thrilled.
>
> But I can't hand this to a client yet, for two reasons I've been burned on before. First: if my account manager forgets to type our name in that branding box, the report says "Generated in **Systedo**" — a vendor my client has never heard of, on *our* report. The placeholder even pre-fills that name, so a tired junior will sail right past it. And the tool itself calls everything else "Adamant" now, so I don't even know which vendor is leaking onto my deliverable. The default has to be neutral or *ours*, full stop.
>
> Second: my client owns a furniture e-shop. She does not know what "PNO" or "ROAS" mean, and the very first thing she sees are four tiles shouting exactly those acronyms with no explanation. My best account manager would never send that — she'd write "návratnost" and explain it. The AI narrative underneath is actually clear and well-structured; it's the headline numbers that read like a media-buying console.
>
> And I'd want to know the microsite shows *her* data, not a sample — right now it doesn't. Fix the brand default, gloss the jargon, point the microsite at real data, and surface a per-client branding option, and this protects my margin and my client relationships. As shipped, it's a strong draft I wouldn't put my logo on yet — which is the one thing it's supposed to let me do.
