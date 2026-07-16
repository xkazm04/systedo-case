# Project Lifecycle, Onboarding & Overview — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 3 medium / 0 low)

## 1. Create-project module matrix is elaborate theater — the assembled module set is silently discarded on submit
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-data-loss-on-submit
- **File**: src/components/app/CreateProjectForm.tsx:332 (root: src/components/app/create-project-shared.tsx:56-67)
- **Scenario**: The user spends real effort in the comparison grid — toggling package modules off, enabling coral "proposed" additions, watching the live "N zapnuto" counter — then clicks "Vytvořit projekt". `draft.submit(type, accent, nature)` posts only `{ name, type, accentColor, domain, nature }`; the `enabled` Set never leaves the component. The created project ships with the type's registry defaults.
- **Root cause**: create-project-shared.tsx documents this as "PROTOTYPE: the chosen module set is captured by the caller but not yet sent", and create-project-packages.ts says the `add` statuses are "NOT wired into the real registry" — but nothing in the UI says so. The doc-comment is the only place the trade-off lives, invisible to users and easy to miss for the next developer who assumes the grid works.
- **Impact**: Users' explicit choices are dropped without feedback — the worst kind of trust break for the very first interaction with the product. Toggling a "navrženo" module implies it will exist in the project; it won't. Future devs debugging "modules missing after create" will chase the API before finding the comment.
- **Fix sketch**: Either wire it (send `modules: [...enabled]` in the POST body and persist per-project) or make the prototype honest: disable toggles outside the default package, or add an inline note ("Vlastní výběr modulů uložíme brzy — zatím se použije výchozí sada typu") whenever `!atDefault`. At minimum, gate the coral `add` toggles since those can never take effect today.

## 2. Onboarding dismiss (and account-link PATCH) never check res.ok — HTTP errors leave a permanently disabled button and no message
- **Severity**: High
- **Lens**: ambiguity
- **Category**: unchecked-response-silent-failure
- **File**: src/components/app/DismissOnboarding.tsx:16-24 (same pattern: src/components/app/ProjectsHome.tsx:233-246)
- **Scenario**: The user clicks "Skrýt" on the onboarding card while the session has expired (or the route 500s). `fetch` resolves with a 4xx/5xx — no throw — so the `catch` (which is the only place `setBusy(false)` lives on the non-success path) never runs. `router.refresh()` executes, the server still sees `dismissed: false`, and the card re-renders with the dismiss button stuck disabled (`busy` remains true) and zero feedback. Same shape in `UnmappedAccountsCallout.link()`: a failed PATCH silently closes the picker and refreshes; the account just reappears unmapped with no explanation.
- **Root cause**: Both handlers treat "fetch resolved" as "operation succeeded". `catch` only covers network failure; HTTP-level failure takes the success path (DismissOnboarding) or the silent-finally path (link).
- **Impact**: User action visibly does nothing, and in DismissOnboarding the control dead-ends until a full reload. Erodes trust exactly on the "get me out of onboarding" escape hatch.
- **Fix sketch**: `if (!res.ok) throw new Error()` in both, reset `busy` in `finally`, and surface a small inline error (the file already ships a `role="alert"` error pattern in ProjectsHome's duplicate modal to reuse).

## 3. Duplicate-dialog default name hardcodes Czech "(kopie)" regardless of locale
- **Severity**: Medium
- **Lens**: ui
- **Category**: hardcoded-locale-string
- **File**: src/components/app/ProjectsHome.tsx:407
- **Scenario**: An `en`-locale user opens "Duplicate as template" on project "Acme": the pre-filled name is "Acme (kopie)" while every other string in the dialog is English. If they accept the default (the common path — it's a template flow), the Czech suffix is baked into the new project's name across the whole app.
- **Root cause**: `useState(\`${project.name} (kopie)\`)` bypasses the `T`/`useT` translation table the rest of the file scrupulously uses (even the bullet lists got a dedicated `DUP_LISTS` structure to stay localized).
- **Impact**: Visible i18n inconsistency that persists into user data, not just chrome; undermines the otherwise complete cs/en parity of this surface.
- **Fix sketch**: Add `dupSuffix: "(kopie)" / "(copy)"` to `T` and initialize with `useState(\`${project.name} ${t("dupSuffix")}\`)` (compute inside the component; `useT` is already available before the state hook).

## 4. Portfolio PNO colored good/bad by a magic 0.2 threshold — type-blind and color-only
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: magic-number-threshold
- **File**: src/components/app/overview/PortfolioCompare.tsx:110
- **Scenario**: The portfolio table paints PNO green when `<= 0.2` and coral otherwise, for every project uniformly. A lead-gen or app project with a perfectly healthy 25% PNO shows alarm-coral next to an e-shop's green 19%, in the very view whose stated purpose is "any two projects read on the same axis". Nothing explains where 20% comes from.
- **Root cause**: Undocumented literal `0.2` chosen as a universal "good PNO" cutoff; healthy PNO is business-type- and margin-dependent (the codebase already models per-type KPI presets and cost models it could consult). The signal is also conveyed by hue alone — no icon/weight difference — so red/green-colorblind users lose it entirely, and every non-green row reads as "problem" rather than "above an arbitrary bar".
- **Impact**: Misleads exactly the multi-client-agency persona the portfolio view targets: projects get visually flagged as unhealthy on a threshold that was never a decision. Future devs can't tell if 0.2 is product policy or a placeholder.
- **Fix sketch**: Name it (`const PNO_HEALTHY_MAX = 0.2` with a comment stating the assumption), ideally source it per project type or from the project's cost model / target PNO; add a non-color cue (e.g. a small ▲/– affix or `title` explaining "cíl ≤ 20 %") so the judgment is legible and accessible.

## 5. ProjectSwitcher declares role="menu" but implements none of the menu keyboard contract
- **Severity**: Medium
- **Lens**: ui
- **Category**: aria-menu-without-keyboard
- **File**: src/components/app/ProjectSwitcher.tsx:41-48, 78-117
- **Scenario**: A keyboard user opens the switcher (Enter on the trigger works) — then Escape does nothing, ArrowUp/Down do nothing, and focus stays on the trigger; the only way to close without picking is to Tab away and hope, since the outside-close listener is `mousedown`-only. A screen reader announces "menu" and sets expectations (arrow navigation, Escape) the widget doesn't meet.
- **Root cause**: `role="menu"`/`role="menuitem"`/`aria-haspopup="menu"` were applied to a plain link list, but the behavior half of the ARIA menu pattern (Escape-to-close returning focus, arrow-key roving focus) was never implemented; dismissal is exclusively a document `mousedown` listener.
- **Impact**: Core navigation chrome — used on every authed page — is degraded for keyboard and AT users, and the ARIA roles make it worse than no roles (broken promise beats no promise). Escape-to-dismiss is also a common sighted-user expectation.
- **Fix sketch**: Minimal: add a `keydown` handler closing on Escape (and restoring focus to the trigger). Better: either drop to honest semantics (`aria-expanded` + a plain list of links, no menu roles) or complete the pattern with ArrowUp/Down roving focus across items — links-as-menuitems make the "honest semantics" route the cheaper, safer choice.
