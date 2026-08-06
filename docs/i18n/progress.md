# i18n re-authoring ledger

The resumable state for the multi-session **en-first re-authoring** of the
catalog. A session starts by reading this file and ends by updating it.

Direction, gates and coverage rules: [`contract.md`](./contract.md).
Read all five artifacts before touching a string — `glossary`, `style-en`,
`style-cs`, `constructions-cs`, `exemplars-cs`.

## Where things stand

Run `node scripts/i18n-audit.mjs` for live numbers. Baseline at the flip:

| Metric | 2026-08-05 (flip) | Now |
|---|---|---|
| cs/en pairs | 3 286 | 3 286 |
| adopters | 195 | 195 |
| coverage gap (cs outside a locale table) | 90 strings / 34 files | 90 / 34 |
| leftover source (cs = en, post-DNT) | 55 | **46** |
| register breaks (tykání) | 7 | **0** |
| pairs reviewed en-first | 0 | **1 232 of 3 286 (37 %)** |

The register count is not a straight improvement story: the 2026-08-05 detector
found 7 and reported clean. Wave 1's reviewers found **3 more by reading**, and
widening the regex then surfaced a **9th** nobody had seen
(`InventoryBudgetActions.subtitle`). All 10 are fixed and the detector now
covers pronouns and 2sg present forms — but the lesson stands: *this scan's
recall is bounded by its word list, so a clean report is weak evidence.*

## Phase status

- [x] **P0 · Direction flip.** `DEFAULT_LOCALE` → `en`, split from the new
      `HOME_MARKET_LOCALE` (`cs`) so ~199 money-formatting call sites did not
      move. `TDict`/`getMessages` fallback → `en`. `<html lang>` → `en`.
      All four gates green.
- [x] **P0 · Artifacts re-pointed.** `contract.md` rewritten for en-source;
      `glossary`, `style-en`, `style-cs` headers corrected;
      `constructions-cs.md` + `exemplars-cs.md` authored and **validated**
      against the real catalog; `review-cs.md` opened.
- [x] **P0 · Tooling.** `scripts/i18n-audit.mjs` — the check typecheck cannot do.
- [x] **P1 · Anchored fixes.** 7 CS-REGISTER + 10 CS-LEFTOVER, all citing a rule.
- [ ] **P2 · Typography sweep.** *Blocked on decision A1* in
      [`review-cs.md`](./review-cs.md) (em dash → en dash, 258 sites). Every
      other typography class is already clean: 0 three-dot ellipses of 140, 2
      straight quotes of 51, 0 Czech quotes leaked into en. There is no cheap
      scripted win left here — unusually, this catalog was already good.
- [ ] **P3 · Coverage.** 90 strings / 34 files. Largest: `lp/page.tsx` (9),
      `ContentPipeline` (8), `OrganicChannels` (8), `ReviewInbox` (6),
      `LandingNewWorld` (6). Long tail of 1–4 per file.
- [ ] **P4 · en-first re-authoring.** The main body of work. 3 286 pairs.
      - [x] **Wave 1 (2026-08-06)** — 4 agents, 65 files, 1 232 pairs:
            `site & marketing`, `modules-platform`, `campaigns`, `social-twin`.
            **60 values changed (24 en, 36 cs) — 95 % left untouched**, which is
            the intended ratio. Gate + typecheck + lint + build + 2 123 tests green.
      - [ ] Wave 2 — `ai` (477), `modules-commerce` (470), `modules-content`
            (250), `modules-local` (246), `pages` (143 — excluding
            `design-system/page.tsx`, an internal gallery), `dashboard` (172),
            `app-shell` (151), `lib-other` (75).
- [ ] **P5 · Retire `constructions-en.md`** once P4 completes — it describes
      defects of the old cs→en direction that P4 removes.

## How to run a P4 batch

One **file** per batch (locale tables are per-file, so batches never conflict).

1. Read the component around its table — what each control does, who reads it,
   how much room it has. **This is the step that makes it en-first**; do not
   read the cs value first, or you will translate it instead of the feature.
2. Rewrite `en` from that understanding, against `style-en.md`. Most values will
   not change — the existing English is good. Change what is *derived-sounding*,
   not what is merely different from your instinct.
3. Transcreate `cs` from the finished `en`: glossary → style-cs →
   constructions-cs → exemplars-cs. Cite a rule ID for every change.
4. Placeholders stay byte-identical (`contract.md` § Format system). No plural
   invention — phrase around it (CS-COUNT) or flag it.
5. `npm run typecheck` after each batch; full gates before committing.
6. Append any new rule or exception to `constructions-cs.md`, any term decision
   to `glossary.md`, anything you refused to guess to `review-cs.md`.

**Do not half-sweep.** If a batch surfaces a term that wants one house decision,
park it in `review-cs.md` § A and leave *every* site alone — including the one
in front of you. A stranded minority is the dominant defect the reference run
found ([`lessons-i18n.md`](./lessons-i18n.md) § 6).

## Batch log

| Date | Scope | Pairs touched | Rules cited | Notes |
|---|---|---|---|---|
| 2026-08-05 | P0/P1 foundation | 17 | CS-REGISTER ×7, CS-LEFTOVER ×10 | Direction flip + artifacts. `AdsAccountPicker.noAccess` word-order half of the edit reverted → parked as CS-NOUNMOD (A4). |
| 2026-08-06 | P4 wave 1 (4 agents) | 60 (24 en, 36 cs) | CS-TERM-DRIFT, CS-REGISTER, CS-ASPECT, CS-COUNT, CS-LEFTOVER, CS-FALSEMAP (new), EN-ARTICLE | See harvest below. Two complete term sweeps (`sync`→`synchronizace` 7 sites, `post`→`příspěvek` 2). Three real shipped bugs fixed. |

## Harvest from wave 1 — what the artifacts learned

Recorded because this is the only mechanism by which one review pays for the
strings nobody reads twice.

**Rules gained**
- **CS-FALSEMAP** (constructions-cs Part 1) — the literal Czech equivalent is a
  real word that says something else. 4 verified instances; `přes {n}` silently
  meant "more than {n}".
- **CS-PREP-REPEAT**, **CS-SVO-AMBIG** (Part 2, parked) — both real, both
  blocked on a ruling.
- **EN-ARTICLE promoted to VALIDATED** in `constructions-en.md` — a quarter of
  all en fixes. It was the file's only unproven-but-true rule.

**Artifacts corrected by evidence — the reviewers were right and I was wrong**
- **`exemplars-cs.md` #1 stated a minority position.** Its "not `Vygenerovat`"
  note lost 13–4 to the catalog, and all 4 of the minority sit in the file the
  exemplar was harvested from. Two agents caught it independently, both by
  counting before applying. Rewritten as a contextual rule.
- **CS-QUOTE was proposed and rejected.** "~10 UI sites" were all *code
  comments*; catalog values had zero. Filed in Part 3 so it isn't re-derived.
- **"The en column is consistently British" was wrong.** Measured: 4:3, 3:5,
  0:2 — only `analyse` is a real cluster. Both agents had generalised from their
  own sample. Now parked as A6.

**The generalisable lesson:** *an agent that greps a handful of files and
reports a house convention has usually found its own sample, not the catalog.*
Verify every claimed convention against all 3 286 pairs before writing it into
an artifact — including claims made by this file's own author.

**Cross-slice stranding is real.** The site agent's two sweeps were complete
*within its slice* but left 2 sibling sites stranded in files no agent owned
(`app/lokalni-seo/page.tsx`, `lib/projects/types.ts`) — the page metadata ended
up contradicting its own hero. **Closing those is the merge step's job**, and
wave 2's dispatch must list unowned files explicitly.
