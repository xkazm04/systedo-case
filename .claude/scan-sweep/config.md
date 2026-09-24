# /scan-sweep — project overlay (systedo-case)

Everything here is repo-specific. The skill itself lives in the registry lane
(`.claude/skills/scan-sweep` → `../ai-registry/skills/scan-sweep`) and must not
carry any of this.

## Keys

| Key | Value |
| --- | --- |
| `contextMap` | `context-map.json` (116 contexts, 16 groups) |
| `memoryOutbox` | `.personas/memory-outbox.jsonl` (gitignored) |
| `backlogDigest` | `.personas/backlog-digest.json` (gitignored) |
| `gates` | `npm run typecheck` + `npx eslint <file>` per commit; `npm run build` once per round |
| `depth` | skill default (12 / 20 for `--one`) |
| `neverSweep` | — |

## Gates in this repo

- `npm run check` is `typecheck && lint && build`. **`npm run lint` runs eslint
  over the WHOLE tree, including `uat/` and `test-unit/`**, so it is red for
  reasons that have nothing to do with a sweep's diff. Verify per-commit with
  `npm run typecheck && npx eslint <your files>`, then run `npm run build`
  separately once — chaining through `npm run check` means a foreign lint error
  short-circuits the build and you never verify it at all.
- The pre-commit hook runs lint-staged, a secret scan, and `scripts/llm-gate.mjs`.
  The LLM gate is static-only for files outside `src/lib/ai/**` and `src/app/api/ai/**`
  — a component-only commit costs about 15 seconds, not the 10-minute real-model prove.

## Skill improvement log

- **2026-08-29** — **Rubric A1 decides what a sweep can build here, before
  reward/risk does.** `.github/agent-review-rubric.md` §A1 blocks any file under
  `src/components/` that ends a diff **over 200 lines and larger than it was**.
  Several contexts are dominated by files already far over that line
  (`components/ai/primitives.tsx` 658, `useAiTool.ts` 339, `AiAssistant.tsx` 260),
  so a finding whose fix lands in one of them is unbuildable no matter how small
  and safe it is — extracting to a new file does not help either, because a new
  path is outside the context's declared `file_paths` (veto 1) and would raise the
  ratcheted unmapped-file count in `npm run agents:surface`. **Check the LOC
  headroom of each of a context's files before choosing what to build**, and route
  the rest to the backlog naming A1 as the blocker rather than the reward/risk
  bar. Measured in the first `ai-assistant-core` round: 6 findings were `better` +
  no gate, only 3 had a file with headroom.
- **2026-08-29** — the four "kit" panels under `src/components/app/modules/`
  (`LtvDiagnosisPanel`, `LeadSourceDiagnosisPanel`, `LocalDiagnosisPanel`,
  `LpVariantIdeasPanel`) all pass their whole `useAiTool` object as `tool={tool}`,
  so a capability added to `AiToolPanel`'s `AiPanelTool<T>` interface reaches all
  four with no call-site edit. That is the one seam in this area where an
  in-context change is not blocked by veto 1 — check it first.
- **2026-08-29** — **A cross-group moonshot round is one snapshot, not sixteen.** `--develop`
  with `--lenses moonshot-architect,feature-scout` over all 16 groups was run as a
  16-way read-only scout fan-out (one general-purpose subagent per group, ~150-250k
  tokens each) returning L+ cards in the §4.10 form, consolidated here, then triaged
  one card at a time with AskUserQuestion. `moonshot-architect` is NOT a registered
  key in `references/lenses.md` — it ran as an owner-defined ad-hoc lens and the
  snapshot records it as such; do not add it to a context's `lens_keys` as if it were
  a stabilize-tier pass. Convergence is the signal: 4 groups independently proposed
  the Sklik+Google spine and 5 the peer benchmark — corroboration count is on the
  deck (`docs/roadmap/moonshot-deck-2026-08-29.md`).
- **2026-08-29 (wave 0 build)** — The worktree is checked out **CRLF** with `core.autocrlf=false`
  while the index is LF: any file an editor touches comes back as a whole-file diff. Normalize
  with `sed -i 's/\r$//' <files>` before staging. Unit tests must run with the loader flags from
  the `test:unit` script (`--import ./test-llm/setup.mjs …`) or `@/lib` imports fail to resolve.
- **2026-09-24 (challenge run, 3 waves x 4 builders in the shared checkout)** — **A FAILING
  pre-commit hook rolls back the whole working tree.** `lint-staged` (v17) takes a backup stash at
  hook start and, when a task fails, does `reset --hard HEAD` + re-applies it: every edit a SIBLING
  made during that ~20 s window is erased. `lint-staged.config.mjs` runs `tsc --noEmit` over the
  WHOLE project on any staged .ts/.tsx, so a sibling's in-flight type error is enough to fail your
  hook. Measured twice in one run (two builders lost an uncommitted edit and re-applied it). Builders
  here must run `npx tsc --noEmit` and `npx eslint <staged>` to exit 0 BEFORE `git commit`, and
  re-check their own `git diff --stat` after every commit in the tree.
- **2026-09-24** — `context:decay:check` and `review:agent:gate` diff against `origin/master`, which
  lags local master by the owner's unpushed commits; a builder sees red from a crossing it did not
  make. Integrate with `node scripts/context-decay.mjs --check --base <run base>`. `i18n:audit:check`
  was already red at the run base (46 > 40) and is not in `check:ci` — compare the finding LIST
  against a base log, not the exit code.
