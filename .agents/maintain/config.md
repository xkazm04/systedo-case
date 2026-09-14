# Maintain project overlay

- Scope: tracked first-party application code, tests, scripts, and maintained
  documentation. Preserve unrelated dirty paths and exclude generated output,
  dependencies, registry skill links, local data, and run artifacts.
- Context map: `context-map.json`; use exact context names for coverage and memory.
- State directory: `.ai/maintain/` (gitignored).
- Gates: run focused checks for each batch, `npm run check:fast` before retaining a
  batch, and the repository-required checks appropriate to the changed paths before
  delivery. A client-component change also requires `npm run build`.
- Delivery: commit on the current branch by explicit pathspec; never push.
- Memory outbox: `.personas/memory-outbox.jsonl` only when the local Personas context
  list exists and the exact context name is known.
- Sensitive scopes: authentication, tenant isolation, billing and spend controls,
  credentials, personal data, Firestore or SQLite schemas, and external ad-platform
  writes. Keep behavior changes in these scopes to a dedicated authorized batch.

## Skill improvement log

- 2026-09-14: `review:agent:gate` compares the committed
  `origin/master...HEAD` range, so a working-tree repair does not change its verdict.
  Run focused checks before committing, then rerun the diff review against the commit.
- 2026-09-14: In the managed Codex sandbox, Node's test runner can fail with
  `spawn EPERM` before any test executes. Rerun the same command with approved process
  access and record the sandbox failure separately from the test verdict.
