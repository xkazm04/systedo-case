# L1 Simulated-UAT — Sofie (social media manager) · plan-a-week-of-social

- **Level:** L1 (theoretical, code-grounded, no browser)
- **Character:** Sofie — in-house social media manager, e-commerce brand
- **Journey:** "Give me a week of on-brand posts across channels, grounded in what's working — without staring at a blank calendar."
- **Project type bound:** `eshop` (demo-eshop) — per journey seed `/app/demo-eshop → /socialni`
- **Date:** 2026-07-07
- **Phase under test:** Phase 6 — Content Schedule (`obsah-plan`) moved off localStorage onto per-project server persistence + activity on named transitions.

---

## First-person review (Sofie)

Je pondělí, mám mít týden hotový a nechci koukat do prázdného kalendáře. Jdu do Sociálních sítí (`/socialni`) — a hned nahoře je **Plán týdne**. To je přesně ono: nahážu čtyři pět témat, jedno na řádek, vyberu platformu, tón, hodinu a kliknu „Naplánovat týden". AI mi z každého tématu napíše příspěvek a rozhodí je na další dny do kalendáře. Tohle mi vážně ušetří čas oproti tabulce — a hlavně to zůstane, když zavřu tab a vrátím se, protože se to ukládá k projektu, ne do prohlížeče. Za tohle palec nahoru.

Ale pak přijde moje první otázka, kterou dávám každému AI nástroji: **„zní to jako MY, nebo jako kdokoliv?"** A tady to skřípe. Nikde nevidím, že by nástroj věděl, co prodávám. Je tam volitelné políčko „Hlas značky", jenže: (1) je dole v Composeru, ne v Plánu týdne, kde reálně startuju, (2) je prázdné, dokud si ho ručně nevyplním, a (3) placeholder mi rovnou nabízí *„Mionelo: ořechy a superpotraviny"* — to není moje značka. Když ho nevyplním, koncept spadne do genericu, a v šablonovém režimu mi to dokonce napíše doslova „V Mionelo se dlouhodobě věnujeme…" a podpis „mionelo.cz". To je cizí brand v mém příspěvku. To bych nikdy neposlala ven.

A druhá věc, na kterou slyším — „opři to o to, co funguje". Nástroj tvrdí, že to dělá, ale když se podívám do útrob, tahá čísla a jméno klienta z jednoho fixního demo datasetu (zase Mionelo), ne z mého projektu. Takže „grounded in what's working" je grounded ve výkonu někoho jiného. To je pro mě problém důvěry.

Kalendář jako workflow? Ano, existuje, je per-projekt, drží se. Ale **jeden běh = jedna platforma**. Můj bar je „IG ≠ TikTok ≠ FB, ne zaměnitelné captiony" — abych pokryla tři kanály, musím Plán týdne pustit třikrát nad stejnými tématy. To je pořád rychlejší než ručně, ale ne o tolik, a hrozí, že to bude znít stejně napříč sítěmi.

Verdikt mojí náladou: nadšení z rychlosti Plánu týdne, ale rychlý odskok kvůli značce. Dá se s tím týden složit pod hodinu — ovšem jen když si ohlídám, že to nezní jako demo.

---

## Surface model (file:line)

| Surface | Where | Reachable for `eshop`? |
|---|---|---|
| Social center page | `src/app/app/[projectId]/socialni/page.tsx:7-15` | ✅ `socialni availableFor ["eshop","app","content","local"]` — `src/lib/projects/modules.ts:140` |
| **Week planner (Sofie's real "plan a week" surface)** | `src/components/social/WeekPlanner.tsx:104-334` (rendered `SocialClient.tsx:147`) | ✅ |
| Composer (single-post draft + brand voice field) | `src/components/social/SocialClient.tsx:254-522` | ✅ |
| Draft API (template + AI) | `src/app/api/social/draft/route.ts:65-146` | ✅ |
| AI social tool + prompt | `src/lib/ai/tools/social.ts:20-156` | ✅ |
| Deterministic fallback (template + skipped-platform fill) | `src/lib/social/draft.ts:46-70` | ✅ (template btn; and fills any platform the model skips — `social.ts:117-122`) |
| Posts store (calendar persistence) | `src/lib/social/store.ts:33-48`, route `src/app/api/social/posts/route.ts:14-49` | ✅ per-tenant = `resolveTenant(uid, projectId)` |
| **Content Schedule (Phase-6 target, `obsah-plan`)** | `ContentSchedule.tsx`, `state/[key]/route.ts`, `project-state/store*.ts`, `obsah-plan/page.tsx` | ❌ **`obsah-plan availableFor ["local"]` only — `modules.ts:130`** |

### Reachable-surface set (before judging)
For Sofie on `eshop`, the journey is served entirely by **`/socialni` → WeekPlanner (batch) + Composer + posts store**. The Phase-6 `obsah-plan` module is **not on her path** (local-only). So Phase 6's persistence work is evaluated for correctness but is off-journey here.

### Grounding score — AI caption surface (WeekPlanner/Composer → `/api/social/draft` → `generateSocialPosts`)
**2 / 4.**
- Locale → `getServerLocale()` reaches the prompt — ✅ (`draft/route.ts:122`).
- Performance "what's working" → present via `perfGrounding()` (`draft/route.ts:33-48,120`) — but built from the **fixed demo dataset** (`buildSnapshot("90d")` default `performance`, `snapshot.ts:52`), injecting client "Mionelo" (`src/data/performance.json:3`) into *every* project. Half credit.
- Brand voice → only via a **manual `localStorage` field** (`SocialClient.tsx:267-283`; WeekPlanner reads-only `WeekPlanner.tsx:95-102,116`), empty by default, demo placeholder. Half credit.
- Product/catalog (Offering spine) → **not wired at all**. 0.

The two "half" channels net to ~2/4, and one of them (performance) is the *wrong tenant's* data — a trust negative, not just a gap.

---

## Findings

| # | Title | Severity | Type | Evidence (file:line) | Impact on Sofie | Ceiling (best case as built) | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Brand voice not grounded from the project — manual, empty-by-default, absent from the surface she starts on | major | quality-gap / confusion | `SocialClient.tsx:265-283, 390-399`; `WeekPlanner.tsx:95-102, 116` | Default week is generic; the field lives in Composer, not in Plán týdne where she starts, so first-run batches have `brand=undefined` | Even fully filled it's free-text recall, not real catalog/brand grounding; violates recognition-over-recall | **confirmed** |
| 2 | Hardcoded "Mionelo" identity in deterministic drafts + replies (T1 finding — still present) | major | trust / quality-gap | `src/lib/social/draft.ts:43, 61, 66, 79, 82` | Template mode and any AI-skipped platform emit a *competitor's* brand ("V Mionelo…", "#mionelo", "mionelo.cz") into her posts | Fallback is unavoidable for keyless/skipped paths; without brand injection it will always leak the demo identity | **confirmed** |
| 3 | "What's working" grounding is a fixed demo dataset, not the project's data | major | trust | `draft/route.ts:33-48, 120`; `snapshot.ts:46-75`; `performance.json:3-5` | Her prompt is told Mionelo's channels/ROAS perform best — "grounded in what's performing" is grounded in someone else's numbers | The data seam exists (`buildSnapshot(…, data)`) but the social route never passes the project dataset | **confirmed** |
| 4 | Week planner drafts one platform per run — no cross-channel-per-topic | minor→major | missing-feature | `WeekPlanner.tsx:113, 174-208` | To cover IG/FB/TikTok she reruns the batch 3× over shared topics; risks the "interchangeable captions" she explicitly rejects | Composer can multi-platform draft but can't batch-schedule a week; the two don't compose | **confirmed** |
| 5 | Phase-6 `obsah-plan` (the module under test) is unreachable for `eshop` | minor (informational) | (scope) | `src/lib/projects/modules.ts:130` (`availableFor:["local"]`) | Sofie never touches the content-schedule board; her calendar is WeekPlanner instead | By design (GBP planner for local SEO, services×localities); not a defect for this journey | **confirmed** |
| 6 | Demo identity leaks into UI copy (placeholders) | polish | quality-gap | `SocialClient.tsx:31, 34, 83`; `WeekPlanner.tsx:29, 45` | "Nová zimní směs ořechů", "Mionelo: ořechy…" reinforce the "this is a nuts brand" feel for a non-nuts eshop | Cosmetic; harmless if she types her own | **confirmed** |

---

## Phase-fix status — content-schedule persistence

**Landed & correct — and it does follow the project without leaking.** Verified:
- Store is keyed `(user_id, project_id, key)` — `project-state/store.local.ts:13-36` (sqlite `project_state`, UPSERT on the composite key); dispatcher `store.ts:5-19` (LOCAL→sqlite, else Firestore).
- Route is ownership-checked + key-whitelisted + size-capped, and emits activity **only** on a named transition (`published`/`scheduled`) — `state/[key]/route.ts:26-72`.
- Page loads server state with seed fallback — `obsah-plan/page.tsx:19-23`; client best-effort PUTs on schedule/publish — `ContentSchedule.tsx:72-90`.
- **Follows the project, not the device:** state is server-side per `(uid, projectId)`, so it survives reload and does **not** leak across projects or devices. ✅

**But:** it is **off Sofie's path** (`obsah-plan availableFor:["local"]`, `modules.ts:130`). It is also **not** an AI drafting surface — the footer itself calls AI drafting "the next step" (`ContentSchedule.tsx:26,37`); it's a manual idea→calendar board (services×localities). For Sofie on `eshop`, the calendar that matters is **WeekPlanner**, whose posts persist per-project via the social posts store (`posts/route.ts:14-49`, tenant = `resolveTenant(uid, projectId)`), and that also survives reload and is project-scoped. ✅

---

## Journey verdict — PARTIAL PASS (conditional)

| Dimension | Score | Note |
|---|---|---|
| Completion | ✅ | A week of scheduled drafts on a persisted, project-scoped calendar is achievable (WeekPlanner). |
| Effort | 🟡 | One-click batch is great; but brand voice must be hunted down in Composer, and cross-channel needs 3 reruns. |
| Clarity | 🟡 | Plán týdne is self-explanatory; the source pill (ai/demo/template) helps; brand-voice discoverability is poor. |
| Trust | 🔴 | Performance grounding = wrong tenant's data; template/fallback emits "Mionelo". A senior would not trust or ship this unedited. |
| Missing pieces | 🟡 | No auto brand/catalog grounding; no cross-channel-per-topic batch. |
| Time-saved | 🟡 | Real win vs spreadsheet, but eroded by off-brand editing + per-platform reruns. |
| Senior-quality | 🔴 | Default output reads generic or literally off-brand; fails the "not interchangeable, on-voice" bar unless she manually feeds brand voice every session. |

**Scored acceptance criteria:**
- [~] On-brand & channel-appropriate — *only if* she manually types brand voice; default is generic/Mionelo. Cross-channel differentiation weak (1 platform/run).
- [~] Grounded in what's performing — *claimed and wired*, but from a fixed demo dataset, not her project.
- [x] Calendar/scheduling path — ✅ real, per-project, persists.
- [~] Week ready in <1 hr — plausible, but editing off-brand drafts + 3× reruns pushes it toward the ceiling.

**Grounding score:** 2/4 (locale ✅; performance present-but-wrong-tenant; brand manual; catalog absent).
**Est. time-saved:** ~3–4 h → **~1–1.5 h** for a genuine cross-channel week (batch helps; off-brand editing + per-platform reruns claw some back). Beats the spreadsheet, but not decisively at her senior bar.

---

## Adversarial cross-check (skeptic on my own findings)

- *"She just didn't fill the brand field."* — That's the point: the field is optional, empty by default, and sits in a different component (Composer) than the surface she starts on (WeekPlanner reads it but can't set it). Recognition-over-recall fail; confirmed, not user error.
- *"perfGrounding could be project-scoped elsewhere."* — No. `buildSnapshot` is called with no `data` arg (`draft/route.ts:120`), so it uses the default case-study `performance` (`snapshot.ts:52`). The seam exists but is unused here. Confirmed.
- *"Mionelo only appears keyless."* — No. `social.ts:117-122` fills any AI-skipped platform from `draftPosts`, and the Composer "Šablona" button is pure template mode — both reachable with a live key. Confirmed.
- *"Phase 6 is the thing under test, so grade it."* — Graded for correctness (sound) but it is unreachable for `eshop` (`modules.ts:130`); grading it against Sofie's journey would be scoring a surface she can't open. Reported as informational scope, not a defect.
