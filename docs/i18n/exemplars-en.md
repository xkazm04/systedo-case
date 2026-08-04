# Gold cs→en exemplars — systedo-case

Eight pairs harvested from the strongest existing colocated `T` tables, one
per string class, each with a one-line why-note. Replace a pair only when a
better one ships; keep the file at ~8.

---

**1. Button / CTA** — `src/components/brand/BrandLanding.tsx` (`heroStartFree`)

> cs: `Začít zdarma`
> en: `Start free`

*Why*: shortest possible idiomatic CTA in both languages — no "for free" or
"start for free" padding; matches the length discipline of a hero button.

---

**2. Heading** — `src/components/app/modules/RankLadder.tsx` (`title`)

> cs: `Žebříček pozic klíčových slov`
> en: `Keyword ranking ladder`

*Why*: a Czech noun-phrase heading (genitive chain: "ladder of positions of
keywords") becomes an equally compact English noun-phrase heading via
compounding ("keyword ranking ladder"), not a translated genitive clause —
demonstrates the word-order rule in `style-en.md`.

---

**3. Tooltip / hover hint** — `src/components/campaigns/BudgetMoves.tsx` (`pauseMoveSpend`, used inline in a hover title)

> cs: `utrácí {amount} bez návratnosti`
> en: `spending {amount} with no return`

*Why*: keeps the placeholder in the same grammatical slot, uses the
progressive ("spending") to match the live/ongoing framing a hover hint
implies, and stays as short as the Czech original.

---

**4. Error / status** — `src/components/app/modules/CatalogModule.tsx` (`timedOut`)

> cs: `Model neodpověděl včas — zobrazujeme sestavený návrh z feedu.`
> en: `Model timed out — showing the feed-assembled draft.`

*Why*: calm, non-alarmist, actionable-by-implication (a fallback is already
shown); the em dash carries the same contrastive beat in both locales per
`style-cs.md`/`style-en.md`.

---

**5. Empty state (transcreation)** — `src/components/campaigns/AlertsInbox.tsx` (`empty`)

> cs: `Žádná upozornění. Při synchronizaci vás upozorníme na nově kritické kampaně.`
> en: `No alerts. We'll notify you when newly critical campaigns are found during a sync.`

*Why*: the money example — carries the reassuring rhythm ("nothing now, but
here's when you'll hear from us") rather than a literal clause-for-clause
rendering; both versions read as native product copy, not as translations of
each other.

---

**6. String with `{placeholders}`** — `src/components/social/WeekPlanner.tsx` (`batchSummary`)

> cs: `{topics}/7 témat × {plats} sítě = {posts} příspěvků v jednom běhu (na síť jiná verze)`
> en: `{topics}/7 topics × {plats} networks = {posts} posts in one run (a distinct version per network)`

*Why*: all three placeholder names stay byte-identical and in the same
position (per the contract's frozen-placeholder rule); the parenthetical
clarifier is reworded for English flow ("na síť jiná verze" → "a distinct
version per network") without touching the arithmetic skeleton.

---

**7. Marketing / landing line** — `src/components/brand/BrandLanding.tsx` (`heroTitle2`)

> cs: `Reklamy, které nepovolí.`
> en: `Ads that never crack.`

*Why*: transcreation, not translation — a literal rendering ("ads that won't
give in") would be flat; "never crack" keeps the brand's unbreakable-monolith
attitude (mirrors `heroTitle1`: "Stůjte pevně." → "Stand adamant.") and reads
as a line an English copywriter would actually write for this brand.

---

**8. `aria-label`** — `src/components/campaigns/AlertsInbox.tsx` (`ariaLabelUnread`)

> cs: `Upozornění ({n} nepřečtených)`
> en: `Alerts ({n} unread)`

*Why*: descriptive and count-inclusive as an aria-label needs to be, keeps
the placeholder in place, and sidesteps the no-plural-mechanism constraint
the same way in both locales — cs accepts the genitive-plural default
(`style-cs.md` §Number agreement), en's "unread" is invariant by nature.
