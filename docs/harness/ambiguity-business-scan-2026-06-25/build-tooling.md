# Build & Tooling Config — Ambiguity + Business scan
> Context: project build/tooling config — npm scripts & the composite `check` gate, TS/Next/ESLint/PostCSS/Playwright setup, the Husky+lint-staged+CI quality gate, README and `.env.example`.
> Files analyzed: 12
> Total findings: 5

## 1. README is the front door to a marketing demo, but the repo is a multi-user cloud product
- **Lens**: 🚀 Business
- **Value**: High
- **Effort**: M
- **File**: README.md:9-25 (page table), README.md:297-309 (deploy/tech); cross-ref `.env.example:29-105`
- **Problem/Opportunity**: The README presents only four public pages (`/dashboard`, `/clanek`, `/ai-asistent`, `/kampane`). Yet `.env.example` documents a whole second product: Google login via Auth.js (`AUTH_SECRET`, `GOOGLE_CLIENT_*`), Firestore persistence, a `/app` multi-user workspace (`DEV_AUTH`/`LOCAL_DB`), cron sync + Resend email/webhook alerts (`CRON_SECRET`, `RESEND_API_KEY`), and a Creative Studio (Leonardo + Gemini-vision + RAG embeddings + Firebase Storage). `.env.example:31` points to `SETUP.md` — which exists — but the README never links it or even acknowledges these features.
- **Why it matters**: For a hiring/portfolio asset the README *is* the product. It currently under-sells the most impressive work (auth, Firestore, cron, vision/RAG studio), so a reviewer skimming the front page never learns it is there.
- **Fix sketch**: Add a "Plné cloud rozhraní (`/app`)" section to README listing auth/Firestore/cron/Creative Studio and linking `SETUP.md`; extend the page table with the `/app` routes. Keep the demo framing up top, but make the README a true table of contents for the repo.

## 2. CI does not mirror the pre-commit gate, despite the comment claiming it does
- **Lens**: 🌀 Ambiguity
- **Value**: High
- **Effort**: S
- **File**: .github/workflows/ci.yml:3-4 & :26-39; .husky/pre-commit:2-7; lint-staged.config.mjs:11
- **Problem/Opportunity**: ci.yml's header says it "Mirrors the local pre-commit gate: the same `npm run check`... that Husky/lint-staged enforce locally." But the hook runs only `lint-staged` (eslint + `tsc --noEmit`) plus `llm-gate.mjs` — it never runs `build`. So `build` and the `llm:eval --strict` goldens run **only in CI**, while the real-Claude LLM run happens **only** in pre-commit. Separately, `npm run test:e2e` (Playwright) runs in neither, and `test:unit` (package.json:18) matches **zero** files — `test-unit/**/*.test.mjs` does not exist, making that script a silent no-op.
- **Why it matters**: A green local commit can still fail CI on `build` (and vice-versa), and the "mirrors" comment is actively misleading. The dead `test:unit` script implies a unit suite that is not there.
- **Fix sketch**: Correct the ci.yml comment to state the real split (build/goldens = CI only; real-LLM = local only). Either delete `test:unit` from package.json or add the missing `test-unit/` suite and wire it into both gates. Optionally add `build` to lint-staged so the hook genuinely matches `npm run check`.

## 3. `.env.example` references a `GEMINI_MODEL` it never defines, and the deploy guide omits the cloud vars
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: .env.example:88-89; README.md:297-302 (Nasazení)
- **Problem/Opportunity**: The Creative Studio block says the vision model defaults to "společný `GEMINI_MODEL`", and the code does read `GEMINI_MODEL` (`src/lib/llm/models.ts`), yet `.env.example` has no `GEMINI_MODEL=` entry — so the variable that actually selects the production model is invisible to anyone copying the example. Meanwhile README's Vercel deploy steps claim only `GEMINI_API_KEY` is (optionally) needed, ignoring `AUTH_SECRET`, `GOOGLE_CLIENT_*`, Firestore and `CRON_SECRET` required for the `/app` product.
- **Why it matters**: Onboarding friction and a correctness trap: a contributor can't discover the model override, and a follower of the deploy guide ships a cloud app with auth/cron broken.
- **Fix sketch**: Add a commented `# GEMINI_MODEL=gemini-3-flash-preview` line near the LLM block. Split README "Nasazení" into "Statický web (jen `GEMINI_API_KEY`)" vs "Plný `/app` (Auth + Firestore + cron)", linking `SETUP.md` for the latter.

## 4. No enforceable Node version pin despite a hard `node:sqlite` requirement
- **Lens**: 🚀 Business
- **Value**: Medium
- **Effort**: S
- **File**: package.json:1-56 (no `engines`); README.md:142-144; .github/workflows/ci.yml:20
- **Problem/Opportunity**: The campaigns feature requires built-in `node:sqlite` ("Node 22.5+/24", README:143) and scripts use recent flags like `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` (package.json:18). CI pins `node-version: 22`, but the repo has no `engines` field and no `.nvmrc`/`.node-version`, so a contributor on Node 20 (or 18) gets cryptic runtime failures rather than a clear gate.
- **Why it matters**: Lowers onboarding friction and prevents "works on my machine" confusion — a one-line, low-risk DX win for a showcase repo.
- **Fix sketch**: Add `"engines": { "node": ">=22.5" }` to package.json and commit a `.nvmrc` (e.g. `22`). Optionally add `engine-strict=true` via `.npmrc`. Commit-safe (not in the LLM hash set).

## 5. README factual/internal-consistency drift (timeout 30s vs 60s; "React Compiler" not enabled)
- **Lens**: 🌀 Ambiguity
- **Value**: Medium
- **Effort**: S
- **File**: README.md:106-107 (60 s) vs README.md:213-214 (30 s); README.md:308 ("React Compiler"); next.config.ts:1-50; playwright.config.ts:16-18
- **Problem/Opportunity**: The README states the client timeout/limit message at both **60 s** (AI-asistent section) and **30 s** (Playwright section), while the Playwright config comment fixes the ceiling at 60 s (test timeout 100 s). It also lists "React 19 (**React Compiler**)" as a used technology, but `next.config.ts` enables no `experimental.reactCompiler` and `react-compiler` appears only as a transitive entry in `package-lock.json` — it is not actually turned on.
- **Why it matters**: Contradictory magic numbers and an unverifiable framework claim are exactly what a sharp interviewer probes; they cheapen an otherwise polished repo.
- **Fix sketch**: Pick one timeout value (60 s) and use it in both README sections, anchored to the config. Either enable `experimental: { reactCompiler: true }` in next.config.ts (and add the dep) or drop the "React Compiler" claim from README.md:308.
