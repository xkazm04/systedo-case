# WP W2-C — Gap-to-page: generated service×area local microsites flip coverage
card #15 · L · gate: contract (new llm-tool + golden; microsite kind goes publishable) · wave 2

## Goal
From the Lokální gaps table, one click generates a service×area landing page draft (new
`local-page` LLM tool grounded on the catalog + reviews), publishes it as a `local-landing`
microsite at `/m/{slug}` with LocalBusiness JSON-LD — and the coverage matrix flips that combo
to "má stránku" via a live overlay (no fake import rows). Acceptance: the tool passes the
static gate with a golden + CHANGELOG row, a published page renders the local-landing branch
with valid JSON-LD (pinned), `resolveCoverage` overlays published pages over both the seed and
imported rows (pinned) — ≥20 assertions.

## Non-goals
- No LP experiments, no variants, no `/m/[slug]/lp/**` (W3-B). No NAP/citations (#26 concept).
- **No street address / phone / openingHours in the JSON-LD** — the repo has no NAP data model
  (verified: zero `LocalBusiness` hits, no address field on `Project`). Emit only what is true:
  `name`, `url`, `areaServed`, `makesOffer` (service + price from the catalog), `description`.
  Fabricating NAP would be the exact dishonesty the repo bans.
- **Do not edit `src/app/api/ai/modes.ts` or `dispatch.ts`** — W2-A owns them; your mode +
  deps entries are SEAM REQUESTS (exact inserts; you may apply locally to test, then report).
- Do not edit `db.ts` (no migration needed — microsites table exists), `sast-allowlist.json`,
  `context-map.json`. Do not touch `src/lib/ai/tools/local-diagnosis.ts` prompts or any other
  golden.
- Do not grow the single-site `MicrositeCard` (`src/components/campaigns/MicrositeCard.tsx`) —
  the performance microsite flow is untouched.

## Seams
- Kind policy: `src/lib/microsite.ts:43` `PUBLISHABLE_KINDS` gains `"local-landing"` — update
  `test-unit/microsite-local-store.test.mjs:139-149` in the SAME commit (it pins that
  local-landing is refused today; keep `"lp"` refused).
- Config: `src/lib/microsite/types.ts:13-43` `MicrositeConfig` gains
  `local?: LocalPagePayload` (additive; `normalizeConfig` :58-60 untouched for old blobs).
- Store: `src/lib/microsite/store.ts` gains `listByTenant(tenant): Promise<MicrositeConfig[]>`
  (local: `SELECT ... WHERE tenant = ?` beside `getByTenant` `store.local.ts:44-49` WITHOUT its
  LIMIT 1; firestore: query by tenant field). `getByTenant` (single) stays for the performance
  card — byte-identical.
- API: `src/app/api/microsite/route.ts` — POST body gains optional `kind` + `local` (types at
  :41-48); pass through to `enableMicrosite` (`microsite.ts:115-169`, input already accepts
  `kind` :117); **fix the owed error branch** :111-115: `invalid-kind` → 422 with its own cs
  message ("Tento typ stránky zatím nelze publikovat.") instead of the lying 409. For
  local-landing the slug is minted `slugify(`${clientName}-${service}-${area}`)` (validated by
  `MICROSITE_SLUG_RE`, `src/lib/microsite-identity.ts:40`); DELETE takes an optional `slug` to
  offline one local page (tenant-checked via the config's `tenant`).
- Renderer: `src/app/m/[slug]/page.tsx` — branch on `config.kind` (currently never read):
  extract the existing body into `PerformanceMicrosite` and add `LocalLandingMicrosite`
  (NEW `src/components/microsite/LocalLanding.tsx`, ≤200 LOC, server component): hero
  (service × area headline), body sections from `config.local.page`, price from the payload,
  CTA (tel:/mail: only if the payload carries one the OPERATOR typed — never generated),
  LocalBusiness JSON-LD via `<JsonLd>` (`src/components/JsonLd.tsx:7-14` — never raw
  stringify). `generateMetadata` :44-67: local-landing pages are indexable
  (`robots: index` — they exist to rank; keep the microsite default for other kinds),
  canonical via `src/lib/site.ts:15-17`.
- Coverage overlay: `src/lib/local-signals/resolve.ts:182-208` `resolveCoverage` — AFTER the
  import overlay, overlay published local-landing microsites: read `listByTenant` for the
  project's tenant (the resolver is server-only and receives projectId — resolve the tenant the
  way `visibility-plan-resolve.ts` does), match `coverageKey(service, area)`
  (`import.ts:603-607` folding), set `hasPage: true` + keep `rank` semantics (:190-194)
  unchanged. `ResolvedCoverage` (:165-172) gains `pages?: number` (count of published
  local-landing sites) so the UI can say why a cell flipped. The no-signals fast path must
  still check pages (a project can publish before ever importing).
- Tool: NEW `src/lib/ai/tools/local-page.ts` copying the `ads-diagnosis` module shape
  (`src/lib/ai/tools/ads-diagnosis.ts` — system :38-56 with `antiFabrication`, builder, Type
  schema, `_coerce`/`_validate` helpers, demo + deterministic `baseLocalPage`, tag
  `// llm-tool: local-page` inside the `generateStructured` literal beside `id` — :350-368
  shape, verbatim call pattern :355-367). Grounding: service name/price/priceModel from the
  catalog (`loadServicesFor`, `src/lib/catalog/load.ts:74-76`), area, businessType
  (`src/lib/local/business-type.ts:11-20`), brand block (`deriveBrandContext`,
  `src/lib/brand/context.ts:38`), top reviews for the area (from `resolveReviews` output,
  quoted verbatim ≤2, marked as citace) — all pre-computed numbers/strings, anti-fabrication
  line, temperature 0.6.
- Gate ceremony (yours to edit): `test-llm/registry.mjs` entry (system + schema VERBATIM),
  scaffold `npm run llm:new -- --id local-page --label "Lokální stránka" --file
  src/lib/ai/tools/local-page.ts`; BYOM row `src/lib/llm/keys/types.ts:206` region;
  `npm run llm:eval:update -- --reason "..."`; `npm run llm:gate:check` green. While you're in
  the barrel: `src/lib/ai/tools/index.ts` gains BOTH `local-page` and the owed `ads-diagnosis`
  export (W1-D carry-forward; then simplify `dispatch.ts`'s direct import — NO, dispatch.ts is
  W2-A's; leave the barrel addition and note it, the Director re-points dispatch at seams).
- Types: `src/lib/ai-types.ts` — `LocalPageRequest/Result` + mode-id union additions are
  **co-owned with W2-A** (they edit ChannelResearchRequest): you MAY edit the file, but it
  lands whole with the later WP — flag every hunk in your report. Same for
  `src/lib/ai/validation.ts` (your `validateLocalPageRequest` beside the others).
- UI: gaps table `src/components/app/modules/LocalModule.tsx:270,282-291` — second action
  beside `exploreGap`: NEW client `src/components/app/modules/local/GapPageAction.tsx`
  (≤200 LOC; `useAiTool<LocalPageResult>("local-page", projectId)`; flow: generate → preview
  (headline + sections readonly) → publish (POST `/api/microsite` with kind/local) → link to
  `/m/{slug}`; error state for the pre-seams 400 is a plain "brzy" disable — the mode lands
  with the seams commit). Coverage matrix header (:197-209) shows `pages` count when > 0.
  `CoverageCell.tsx` untouched (its toggle stays the manual override).
- Mode seam request (verbatim, anchor after W2-A's region in `modes.ts` — mirror the
  `ads-diagnosis` entry :435-446 with a grounding resolver like `resolveAdsDiagnosis` in
  `src/app/api/ai/grounding.ts:334-356`; the resolver function itself lives in YOUR write set —
  `grounding.ts` is shared: put `resolveLocalPage` in `src/lib/diagnoses/…`? No — put it in
  `src/lib/local-signals/page-grounding.ts` and the modes.ts insert imports it). Tenancy check
  inside the resolver via `requireOwnedProject`-equivalent as grounding.ts does.

## Data contract
```ts
// src/lib/ai-types.ts (additive)
export interface LocalPageRequest {
  service: string; area: string; businessType: string; brand: string;
  price?: number; priceModel?: "from" | "fixed" | "quote"; currency?: string;
  reviews?: Array<{ author: string; rating: number; text: string }>;  // ≤2, verbatim
  brandContext?: string; refine?: string; sample?: boolean;
}
export interface LocalPageSection { heading: string; body: string }
export interface LocalPageResult {
  headline: string; intro: string;
  sections: LocalPageSection[];        // 2–4
  faq: Array<{ q: string; a: string }>; // 2–4
  cta: string;
  source?: "fallback";
}
// src/lib/microsite/types.ts (additive)
export interface LocalPagePayload {
  service: string; area: string; page: LocalPageResult;
  price?: number; priceModel?: string; currency?: string; generatedAt: string;
}
```
Validator: sections/faq clamped, strings capped (headline 120, body 1200), unknown keys
dropped; result normalized so the golden stays stable.

## Invariants
- ADR-0003: the only provider call is `generateStructured` in `local-page.ts`.
- Anti-fabrication: prices and review quotes come from the request only; the prompt says so;
  the validator drops any review not in the request set.
- ADR-0002: publish keys off `currentUserId` + `rejectUnknownProject` (existing route guards
  :28-33); slug ownership settled by the store's PK (`db.ts:540-546`).
- Honest coverage: the overlay reads LIVE published state — unpublishing a page un-flips the
  cell on the next render; no import rows are forged.
- Cache Components: no `export const dynamic`; `/m/[slug]` keeps its current dynamic-by-design
  shape (:1-9).

## Build steps
1. Types + validator + tool + registry entry + golden (`llm:new` scaffold → paste production
   system/schema verbatim → `llm:eval:update --reason`) + BYOM row; `llm:gate:check` green.
2. `page-grounding.ts` resolver + `test-unit/local-page-grounding.test.mjs` (catalog price in,
   review cap, area folding; ≥6).
3. Microsite kind/policy/store/route (`listByTenant`, `local` payload, `invalid-kind` 422) +
   store test updates (:139-149 flip) + new list test.
4. Renderer branch + `LocalLanding.tsx` + JSON-LD fixture test (parse the emitted object:
   `@type: "LocalBusiness"`, `areaServed`, offer price — and assert NO `address` key).
5. Coverage overlay + `test-unit/local-signals.test.mjs` extension (published page flips a
   seed combo AND an imported `hasPage:false` combo; unpublish un-flips; `pages` count).
6. `GapPageAction` + LocalModule mount; LF-normalize; gates; report with verbatim seam
   requests (modes.ts entry + dispatch deps + ai-types/validation hunk list).

## Gates
`npx tsc --noEmit` · `npx eslint src/lib/microsite* src/lib/local-signals src/lib/ai/tools
"src/app/m/[slug]" src/app/api/microsite src/components/microsite
src/components/app/modules/local src/components/app/modules/LocalModule.tsx test-llm/registry.mjs` ·
`npm run test:unit` · `npm run llm:gate:check` · `npm run test:llm:coverage`.
Do NOT run `npm run test:llm` (Director does, backgrounded, on landing).

## Acceptance
- `npm run llm:gate:check` exit 0 with 23 tools; CHANGELOG row `local-page | — | <hash>`.
- Publish fixture: `enableMicrosite(..., {kind:"local-landing", local})` writes the config;
  `/m/{slug}` fixture render carries LocalBusiness JSON-LD without `address` (pinned).
- `resolveCoverage` overlay pinned both directions (flip + un-flip).
- `invalid-kind` POST → 422 (pinned) — the wave-0 carry-forward closed.
- ≥20 new assertions.

## Hotspot requests (seam requests — verbatim inserts + anchors)
- `modes.ts` `local-page` entry + imports (anchor: after the `ads-diagnosis`/local pair
  :435-459 region); `dispatch.ts` deps line (`localPage: generateLocalPage`) + re-point
  `ads-diagnosis` import at the barrel while there (Director's call).
- `src/lib/ai-types.ts` + `src/lib/ai/validation.ts` hunks (co-owned with W2-A — lands whole
  with the later WP; list every hunk).
- `context-map.json` (Director). `docs/testing/llm-quality-matrix.md` one-line note: local-page
  has no baked quality score yet (unbaked ratchet +1, reason recorded — same as ads-diagnosis).
- No db.ts change (uses the existing microsites table).

## Rollback
Revert; stored `local-landing` configs render 404 via the kind policy (old code's
`PUBLISHABLE_KINDS` refuses them at publish, `normalizeConfig` leaves stored kinds alone);
golden + CHANGELOG revert together with the registry entry.
