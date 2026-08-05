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
| leftover source (cs = en, post-DNT) | 55 | **45** |
| register breaks (tykání) | 7 | **0** |
| pairs re-authored en-first | 0 | **0** |

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
