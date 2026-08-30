# ADR-0006 — Colocated dictionaries, typed for parity, with no parity script

## Status

Accepted (colocation from the start; authoring direction flipped 2026-08-05 —
full contract in `docs/i18n/contract.md`)

## Context

A central message catalogue is the default choice, and in a two-locale product
maintained mostly by agents it fails in a specific way: the catalogue and the
component drift. A key is renamed in one place, a component is deleted and its
keys are not, a new string is added to one locale column and not the other. The
usual mitigation is a parity script, which is a second thing to keep correct.

## Decision

**Each component owns its own dictionary.** A `const T = { cs: {...}, en: {...} }`
typed as `TDict` sits in the file that uses it, consumed through `useT(T)` on the
client and `await getT(T)` on the server (`src/lib/i18n/client.ts`,
`src/lib/i18n/server.ts`). The central catalogue is reserved for chrome — nav and
footer — where the strings genuinely are shared.

**Parity is the type system, not a script.** `TDict` makes the two locale columns
structurally identical, so a key added to one and not the other is a `tsc`
failure. There is deliberately no parity script; adding one would be a second
source of truth for something the compiler already decides.

Interpolation is bare regex, not ICU (`src/lib/i18n/interpolate.ts`) — see the
contract for why. Two different "defaults" are kept apart on purpose:
`DEFAULT_LOCALE` (the authoring source, now `en`) and `HOME_MARKET_LOCALE` (`cs`,
which is what prices in CZK depend on). Collapsing them back into one value
reprices CZK as USD.

## Consequences

- Deleting a component deletes its strings. There is no orphan catalogue.
- What typecheck *cannot* see is real and is measured, not asserted: a `cs` value
  that was never actually written, tykání, or a string that never reached a `T`
  table at all. `npm run i18n:audit` reports those and sits on the reporting rung
  (ADR-0007) with a ratchet baseline in `scripts/i18n-audit.mjs`. Fix findings and
  lower the baseline in the same commit; never raise it.
- `npm run i18n:gate` is a per-wave diff gate against a reference tree, run
  during a localization wave — not on every commit.
- The cost is repetition: the same word is translated in several components. That
  is accepted, because the alternative failure (a shared key changed for one
  caller and silently changed for six others) is worse and harder to see.

## Consequences observed

_Read back 2026-08-30 against the tree, not against intentions._

- **Reversing the authoring direction cost nothing structural.** `en` became the
  source and `cs` the transcreation on 2026-08-05 — a change that would have been
  a catalogue-wide migration under a central message file. Colocation made it a
  per-component edit and a pair of constants, and the split between
  `DEFAULT_LOCALE` and `HOME_MARKET_LOCALE` is what kept CZK prices from being
  repriced as USD.
- **The ratchet has moved, downward, which is the point.** The baselines in
  `scripts/i18n-audit.mjs` went 40 → 38 (hardcoded strings) and 42 → 40
  (untranslated `cs` values) on 2026-08-28, each lowered in the commit that fixed
  the findings. Both counts are still non-zero and have been for months, so
  "measured, not asserted" is holding as a description and not yet as a cure.
- **No parity script has been invented since**, which was the specific temptation
  this record was written to head off. The prohibition earned its sentence.
