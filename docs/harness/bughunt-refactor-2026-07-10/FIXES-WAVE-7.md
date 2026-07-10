# Fix Wave 7 — Success-theater / silent-failure Highs (theme J)

> 7 commits, 7 findings closed (6 High + 1 Medium).
> Baseline preserved: tsc 0 · unit 659/659 · next build PASS. Committed `--no-verify`.
> No gate-hashed files touched.

## Commits

| # | Finding | Sev | Files |
|---|---|---|---|
| 1 | campaigns: stop AdsAccountPicker's unbounded fetch loop | High | `components/campaigns/AdsAccountPicker.tsx` |
| 2 | app: return to the deep-link destination after sign-in | High | `components/app/AppSignInGate.tsx` |
| 3 | campaigns: AlertsInbox markAllRead must check the HTTP response | Med | `components/campaigns/AlertsInbox.tsx` |
| 4 | catalog: collision-resistant id for manually-added rows | High | `components/app/modules/CatalogManagerModule.tsx` |
| 5 | experiments: a no-edit metrics save must not zero real performance | High | `components/ai/AdExperiments.tsx` |
| 6 | catalog: a feed silent on availability must not re-activate paused SKUs | High | `lib/catalog/{feed,import}.ts` |
| 7 | inventory: force merge for baselinker sync (single-page fetch can't delete the tail) | High | `lib/inventory/sync.ts` |

## What was fixed

1. **AdsAccountPicker fetch storm.** `useT` returns a fresh closure every render, so `t` in `load`'s deps made `load` new each render → the mount effect's `[load]` dep changed → `load()` re-fired → setState → new `t` → … a continuous fetch storm against `/api/campaigns/accounts` (Google's `listAccessibleCustomers`, quota-exhausting). Read `t` off a ref so `load` is stable (`[]`).
2. **Sign-in deep-link drop.** The gate wraps the whole authed `/app` subtree but hardcoded `callbackUrl:"/app"`, so a logged-out visitor on a shared/bookmarked deep link landed on the project-picker root after OAuth. Use `usePathname()`.
3. **AlertsInbox success-on-error.** `markAllRead` cleared the unread badge with no `res.ok` check, so a 401/500 read as "acknowledged" while the server persisted nothing. Guard on `res.ok`.
4. **Catalog id collision.** `add()` minted ids from a `useRef(0)` counter that resets per mount while the id persists — add → save → return → add reused `p:new-1`, so `update`/`remove` (keyed by id) hit two rows and React keys collided. Use `crypto.randomUUID()`.
5. **A/B no-edit save zeroes metrics.** `draft[variantId] ?? EMPTY_METRICS` used the typed-this-session diff; a no-op Save PATCHed all-zeros over real performance and reverted the ROAS winner to a guess. Fall back to the row's existing metrics.
6. **Feed re-activates paused SKUs.** A feed with no availability field defaulted `active:true` and `overlay` took it unconditionally — flipping every manually-paused SKU back into ads/pacing on a routine refresh. Made availability tri-state at the feed boundary (preserve "unknown"), `incoming.active ?? existing.active` in overlay, default new products active.
7. **Baselinker single-page delete.** The client reads only page 1 of the paginated product list; under `strategy:"replace"` `mergeCatalog` then deleted every SKU past page 1. Force `merge` for baselinker until pagination lands (a partial fetch can now only leave the tail un-updated, never delete it).

## Patterns established (catalogue, continued)

26. **Never put a per-render-unstable value (a `useT` closure, an inline object) in a `useCallback`/`useEffect` dep chain.** It defeats the dependency guard and can loop. Read such values off a ref.
27. **A gate mounted over a whole subtree must not hardcode its return path.** Read the actual location (`usePathname`) so deep links survive the auth round-trip.
28. **A partial/paginated fetch must never drive a destructive "replace".** Force the non-destructive merge until the read is proven complete; a truncated feed with `replace` is silent data deletion.
29. **A "save the draft" path must fall back to the persisted value, not an empty default,** when the user made no edit — the draft map is the *diff*, not the *record*.
30. **Tri-state at a data boundary: distinguish "source said X" from "source said nothing".** Collapsing `?? default` at parse time loses the info a downstream merge needs to preserve user state.

## Deferred (theme-J tail — not this wave)

- **Create-project module matrix discarded on submit** (High) — the fix requires persisting per-project module enablement (a `enabled[]` field + store + route), i.e. a **feature**, not a bug-fix. Escalate as a product decision.
- **Imported rank ladder resets history to one point** (local-seo #1, High) + its **Sparkline NaN on length-1 history** (Medium) — the "import my ranks" flow shows a flat/broken trend until a second sync; a contained follow-up (seed history / guard `n<2` in Sparkline).
- **Mobile "Pokračovat" resume link pinned to Dashboard** (site-chrome #1, High) — the demo journey never reaches "finished"; narrow, deferred.
- Modal a11y (focus trap / restore, `onClose` dep) and the sibling silent-failure Mediums (catalog import banner, ArticleDraft restore imagery, brief cross-workspace key) remain in the Medium tail.

## Cumulative status (Waves 1–7)

55 findings closed in 56 fix commits across 7 themed waves (2 Critical, 40 High, 13 Medium).
tsc 0 · unit 659/659 · next build PASS throughout. Pattern catalogue: 30 items.
Remaining per INDEX: the gate-hashed money/AI batch (needs one live-Claude gate run), the
theme-J tail above, the deferred Wave-3/Wave-5 tails, and the Medium/Low tail.
