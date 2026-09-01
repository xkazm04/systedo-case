import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** ESLint for Adamant — the vendor defaults, plus the seams this repository
 *  actually asks agents not to cross.
 *
 *  WHY THERE IS ANYTHING BELOW THE VENDOR CONFIG. `AGENTS.md` states a handful of
 *  never/always constraints in prose — every LLM text call goes through ONE
 *  chokepoint; routes and components reach data through a store seam rather than a
 *  driver; no route segment-config opt-out under Cache Components. Prose is read by
 *  whoever reads it. ~97% of the commits here are written by an agent, which means
 *  the constraint is re-derived from a document on every run, and the only thing
 *  that had ever failed on a breach was a reviewer noticing. A fence that fails is
 *  cheaper than a rule that has to be re-explained.
 *
 *  Rung discipline (docs/adr/0007-gate-rung-discipline.md): all three fences pass on
 *  the tree as it stands, so they are BLOCKING — `npm run lint` sits inside
 *  `npm run check`, inside `npm run check:ci`, inside `.husky/pre-push`. A red one is
 *  a regression this change introduced, never pre-existing debt. They are drawn
 *  deliberately narrow for that reason: each one names modules that exist, with an
 *  exception list short enough to read.
 *
 *  WHAT THEY DO NOT DUPLICATE. `scripts/llm-gate.mjs` proves every
 *  `generateStructured` call site is tagged and its contract golden is current;
 *  `scripts/sast.mjs` blocks a route with no caller identity and a `"use client"`
 *  module reading a server env var; `scripts/agent-review.mjs` (Part A) blocks a
 *  segment-config opt-out in a diff. The fences here catch the same breaches one
 *  step earlier — in the editor, on the file being typed, before a commit exists —
 *  which is where an agent can still choose the other design cheaply.
 *
 *  WHAT A MESSAGE HAS TO SAY. A fence going red is the one moment the constraint has
 *  the reader's full attention, and an agent that has just been refused does exactly
 *  one of two things next: it finds the design the rule wanted, or it reaches for a
 *  disable comment. Which of those happens is decided by the message. So every
 *  message below names three things — what was refused, WHICH DESIGN to use instead,
 *  and the record that argued for it — the same shape `scripts/gate-remedy.mjs` gives
 *  every gate in `check:ci`. `test-unit/lint-fences.test.mjs` holds them to it: a
 *  message that stops naming a decision record a reader can open turns the suite red,
 *  because a fence that only says "no" is the one that gets switched off.
 *
 *  ON FORMATTING, since it is the obvious next question: there is deliberately no
 *  Prettier or Biome. ADR-0008 keeps repo tooling on Node built-ins and repo-local
 *  scripts before it takes a dependency, and a formatter would be a build-time
 *  dependency whose whole output is whitespace. Style is not reviewed here — do not
 *  raise it in a review, and do not reformat a file you are not otherwise changing.
 *  What IS enforced is below, and all of it is about seams rather than taste.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    // ── The seams, for everything under src/ ────────────────────────────────
    //
    // Two constraints in one rule because ESLint merges by rule id: a second
    // `no-restricted-imports` for a narrower glob REPLACES this one's options for
    // the files it matches, it does not add to them. So the whole fence is stated
    // here and relaxed below, in that order, rather than split by concern.
    name: "adamant/seams",
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              // The LLM chokepoint. `generateStructured()` in src/lib/llm/index.ts
              // is the ONE place a text call may be made: it is where the provider
              // order, BYOM keys, the demo fallback, metering, telemetry and the
              // language check all live. A second client constructed anywhere else
              // silently opts out of every one of them.
              name: "@google/genai",
              importNames: ["GoogleGenAI"],
              message:
                "Construct the Gemini client only in src/lib/llm/. Every LLM text call goes through " +
                  "generateStructured() in src/lib/llm/index.ts — a client built outside it skips the provider " +
                  "order, BYOM keys, demo fallback, metering and telemetry. (The `Type` schema enum is fine.) " +
                  "INSTEAD: call generateStructured() with a `// llm-tool: <id>` tag and register the tool " +
                  "(`npm run llm:new`). If the chokepoint cannot express what you need, widen it there rather " +
                  "than around it — docs/adr/0003-single-llm-chokepoint.md.",
            },
            {
              name: "@/lib/llm/gemini",
              allowImportNames: ["geminiAvailable"],
              message:
                "src/lib/llm/gemini.ts is a provider adapter, not an entry point. Call generateStructured() " +
                  "from src/lib/llm — only the availability probe may be read from outside. INSTEAD: import " +
                  "`generateStructured` from `@/lib/llm`, which picks the provider for you; if you need this " +
                  "one specifically, the reason belongs in docs/adr/0003-single-llm-chokepoint.md, not here.",
            },
            {
              name: "@/lib/llm/claude",
              allowImportNames: ["claudeAvailable"],
              message:
                "src/lib/llm/claude.ts is a provider adapter, not an entry point. Call generateStructured() " +
                  "from src/lib/llm — only the availability probe may be read from outside. INSTEAD: import " +
                  "`generateStructured` from `@/lib/llm`, which picks the provider for you; if you need this " +
                  "one specifically, the reason belongs in docs/adr/0003-single-llm-chokepoint.md, not here.",
            },
            {
              name: "@/lib/llm/codex",
              allowImportNames: ["codexAvailable"],
              message:
                "src/lib/llm/codex.ts is a provider adapter, not an entry point. Call generateStructured() " +
                  "from src/lib/llm — only the availability probe may be read from outside. INSTEAD: import " +
                  "`generateStructured` from `@/lib/llm`, which picks the provider for you; if you need this " +
                  "one specifically, the reason belongs in docs/adr/0003-single-llm-chokepoint.md, not here.",
            },
          ],
          patterns: [
            {
              // The store seam. Prod is Firestore, local dev is node:sqlite, and the
              // pair is env-switched behind one interface (AGENTS.md § Architecture,
              // point 3). A page or a route that reaches for a driver has picked a
              // backend: it stops working under LOCAL_DB, and the tenant key that
              // makes cross-user IDOR impossible by construction is applied by the
              // store, not by the caller. Inside src/lib/ both drivers are expected —
              // that is the layer that owns them.
              group: ["firebase-admin", "firebase-admin/*", "node:sqlite"],
              message:
                "Routes and components go through a store seam in src/lib/, never a driver. Prod is Firestore " +
                  "and local dev is node:sqlite behind the same interface; importing one here picks a backend, " +
                  "breaks LOCAL_DB, and bypasses the tenant key the store applies. INSTEAD: call a store module " +
                  "in src/lib/ (or add a function to the one that owns this data — that is the layer allowed to " +
                  "hold both drivers), and let it apply the `u_{userId}_proj_{projectId}` key. " +
                  "docs/adr/0001-dual-store-seam.md, and docs/adr/0002-tenant-key-embeds-user-id.md for the key.",
            },
          ],
        },
      ],
    },
  },

  {
    // src/lib/ IS the store layer, so the drivers belong to it. The chokepoint
    // fence stays: a lib module is no more entitled to build its own LLM client
    // than a route is.
    name: "adamant/seams-lib",
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@google/genai",
              importNames: ["GoogleGenAI"],
              message:
                "Construct the Gemini client only in src/lib/llm/. Every LLM text call goes through " +
                  "generateStructured() in src/lib/llm/index.ts. INSTEAD: import it from `@/lib/llm`, or — if " +
                  "this module IS the provider layer — move it under src/lib/llm/, which is the one directory " +
                  "the fence exempts. docs/adr/0003-single-llm-chokepoint.md.",
            },
            {
              name: "@/lib/llm/gemini",
              allowImportNames: ["geminiAvailable"],
              message:
                "Provider adapter — import `generateStructured` from `@/lib/llm` instead. A lib module is no " +
                  "more entitled to pick a provider than a route is: docs/adr/0003-single-llm-chokepoint.md.",
            },
            {
              name: "@/lib/llm/claude",
              allowImportNames: ["claudeAvailable"],
              message:
                "Provider adapter — import `generateStructured` from `@/lib/llm` instead. A lib module is no " +
                  "more entitled to pick a provider than a route is: docs/adr/0003-single-llm-chokepoint.md.",
            },
            {
              name: "@/lib/llm/codex",
              allowImportNames: ["codexAvailable"],
              message:
                "Provider adapter — import `generateStructured` from `@/lib/llm` instead. A lib module is no " +
                  "more entitled to pick a provider than a route is: docs/adr/0003-single-llm-chokepoint.md.",
            },
          ],
        },
      ],
    },
  },

  {
    // src/lib/llm/ is the chokepoint itself — it is allowed to be the exception it
    // enforces on everyone else.
    name: "adamant/seams-llm-chokepoint",
    files: ["src/lib/llm/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  {
    // Cache Components is on (next.config), so a segment-level opt-out un-caches a
    // whole route to serve one dynamic read. The shape that works is a <Suspense>
    // boundary around the read. Part A of the rubric already refuses this in a diff
    // (scripts/agent-review.mjs, rule A2); saying it here moves the refusal into the
    // editor. `maxDuration` and `preferredRegion` are deliberately absent from the
    // list: they are Vercel function settings, not caching opt-outs, and the repo
    // uses both.
    name: "adamant/route-segment-config",
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-exports": [
        "error",
        {
          restrictedNamedExports: ["dynamic", "runtime", "revalidate", "fetchCache", "dynamicParams"],
        },
      ],
      // TWO RULES, TWO JOBS: one refuses the export, the other says what to write
      // instead. `no-restricted-exports` takes no `message` option: all it can print is
      // "'dynamic' is restricted from being exported", which names the rule and not
      // the design — and of the fences here, this is the one whose correct
      // alternative is least guessable from the refusal alone. An agent that reads
      // only that message deletes the export, loses the dynamic read it was there
      // for, and ships a route that renders stale. So the SENTENCE is attached with
      // `no-restricted-syntax`, which does take one. Both fire on
      // `export const dynamic = …`; only this one says what to write instead.
      //
      // `no-restricted-exports` stays because it also catches the re-export spelling
      // (`export { dynamic } from "./config"`) that the selector below does not.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ExportNamedDeclaration > VariableDeclaration > " +
            "VariableDeclarator[id.name=/^(dynamic|runtime|revalidate|fetchCache|dynamicParams)$/]",
          message:
            "Route segment config un-caches this whole route. `cacheComponents` is on (next.config.ts), so " +
            "`export const dynamic`/`runtime`/`revalidate`/`fetchCache`/`dynamicParams` is a whole-route " +
            "opt-out bought to serve one dynamic read. INSTEAD: leave the route cached and wrap the dynamic " +
            "read — `cookies()`, `headers()`, `searchParams`, a per-request fetch — in its own <Suspense> " +
            "boundary with a skeleton fallback, so only that subtree is dynamic. Rubric A2 refuses this in a " +
            "diff too (.github/agent-review-rubric.md), and there is no `eslint-disable` for it: the fix is " +
            "the boundary. `maxDuration` and `preferredRegion` are Vercel function settings, not caching " +
            "opt-outs, and are deliberately allowed.",
        },
      ],
    },
  },
]);

export default eslintConfig;
