# Adamant — context sweep plan

Precomputed 2026-07-30 from `git ls-files` (1,172 source files). Re-derive if
the tree has moved substantially since.

- **Personas project id:** `c76fe554`
- **Repo root:** `C:\Users\kazda\kiro\systedo-case`
- **Bridge:** first free port at or above 17400 — probe, do not assume.

## Why this file exists

A whole-tree scan under-maps a repo this size and reports success anyway. On the
personas repo one whole-tree pass mapped 9% of files; sweeping subtree-by-subtree
reached ~89%. Everything below is the partition for that sweep. Full mechanics in
[`references/bridge.md`](references/bridge.md).

## Scopes

Four scans covering 1,132 of 1,172 files (97%) — the cleanest partition of the
three projects. Run them all concurrently; the single-flight guard is per-scope.

| Files | `subtree` |
|------:|---|
| 458 | `src/lib` |
| 266 | `test-unit` |
| 243 | `src/components` |
| 165 | `src/app` |

Consider dropping `test-unit` unless you want tests mapped — 266 files of test
code will produce contexts that mirror the modules they exercise, which tends to
duplicate the `src/lib` map rather than add to it. Decide before spending the
session, not after.

## The 40-file tail

`scripts` (14), `test-llm` (8), `uat` (7), `tests` (5), plus 6 loose config
files. **Do not scan `.` to sweep these up** — a whole-tree pass is the failure
mode this plan exists to avoid, and a parent-prefix scan also retires the child
contexts you just built. Leave them unmapped and say so, or scan `scripts`
alone if it matters.

## After the sweep

Run the idempotent repair routes once, then consolidate group sprawl with
explicit merge pairs. Verify by counting DISTINCT paths across all contexts
against the 1,172 above — not by trusting the per-scan numbers.

## Note on `context-map.json`

This repo has one committed at the root. Check whose it is before believing it:
if it carries a `$schema` of `vibeman.dev`, it is a different tool's artifact and
its counts will disagree with the Personas database. **The database is the
authority** for anything the app does. The same trap cost a personas session a
5x sizing error.
