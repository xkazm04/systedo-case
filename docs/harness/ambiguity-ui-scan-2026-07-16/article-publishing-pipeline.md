# Article & Reporting Publishing Pipeline — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. `enableMicrosite` lets any tenant hijack or overwrite another tenant's slug (including the demo)
- **Severity**: High
- **Lens**: ambiguity
- **Category**: missing-ownership-guard
- **File**: src/lib/microsite.ts:109
- **Scenario**: Tenant A calls `enableMicrosite("tenantA", { slug: "mionelo", ... })` (or any slug already registered to tenant B). The function does `registry().doc(input.slug).set(cfg, { merge: true })` with no check that the slug is free or owned by the caller — the doc's `tenant`, `brandName`, `accentColor`, and `clientName` are silently replaced. `getMicrosite` then serves tenant A's branding at tenant B's stable public URL. There is also zero slug format validation (empty string, uppercase, path-ish strings all pass straight into a Firestore doc id and a public route segment).
- **Root cause**: The doc comment promises "The slug is stable once set" but nothing enforces it; upsert-by-slug with `merge: true` conflates create and update, and the tenant field is caller-supplied per call rather than verified against the existing doc.
- **Impact**: Cross-tenant takeover of a public, search-findable "proof of results" page — reputational damage plus a confused re-enable path (`disableMicrosite` looks the slug up by tenant, so the hijacked victim can no longer even disable "their" page). The built-in `mionelo` demo is equally claimable.
- **Fix sketch**: Before `set`, `get()` the doc: if it exists and `existing.tenant !== tenant`, throw. Validate `input.slug` against `/^[a-z0-9-]{3,40}$/` and reserve `DEMO_MICROSITE.slug`. Consider dropping `merge: true` in favor of a full write once ownership is proven, so stale fields can't linger.

## 2. Generated microsite article self-certifies "reálná časová řada" while rendering scaled demo data
- **Severity**: High
- **Lens**: ambiguity
- **Category**: honesty-claim-vs-data-source
- **File**: src/lib/snapshot-to-article.ts:215
- **Scenario**: Every `/m/{slug}` microsite today is built from `scaledDataset(seedScale(slug))` — synthetic case-study numbers — and `MicrositeConfig.illustrative` exists precisely so the page can disclose that and stay noindex. But the article the bridge produces answers its own FAQ "Z jakých dat report vychází?" with "Z reálné časové řady výkonu {client}…" ("from the real performance time series"), and the perex says "Automaticky vygenerováno z dashboardu". The claim is baked into the content itself, one layer below where the `illustrative` disclosure lives.
- **Root cause**: `snapshotToArticle` has no notion of data provenance — it cannot distinguish a synced-Ads snapshot from a scaled demo one, yet its template asserts the strongest provenance ("reálné"). The honesty flag was added to the page chrome (microsite.ts:34) but never threaded into the text generator.
- **Impact**: A visitor who reads the FAQ (or an AI crawler consuming the `/clanek/markdown` twin, where the page-level banner does not exist) is told fabricated numbers are the client's real series — exactly the "demo numbers published as proof" failure the `illustrative` comment says must never happen. The Markdown export strips the page-level disclosure entirely.
- **Fix sketch**: Add `provenance: "synced" | "illustrative"` to `snapshotToArticle`'s params (callers already know it from `MicrositeConfig.illustrative`); switch the FAQ answer and perex wording accordingly ("Z ilustrativní datové řady odvozené z případové studie…"), so the disclosure travels with the content into every surface, including Markdown.

## 3. Anchor validation ignores FAQ answers and rejects legitimate links to FAQ ids
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: validator-namespace-asymmetry
- **File**: src/lib/article-validate.ts:91
- **Scenario**: (a) An author puts a `kind:"anchor"` link inside a FAQ answer (`faq[n].a` is `Inline[]`, same type as paragraph content) pointing at a deleted heading — `anchorHrefs(a.blocks)` never scans `a.faq`, so the dead link ships silently. (b) Conversely, a body paragraph links to `#kolik-orechu` (a FAQ item's effective id — a real DOM id the renderer emits, per `faqItemId`) — the loop checks only `idSet` of headings and fails the build for a link that actually works.
- **Root cause**: The validator carefully unifies the heading+FAQ id namespace for *uniqueness* (lines 74–90) but then validates anchor *targets* against headings only, and collects anchor *sources* from blocks only. The two halves of the same namespace rule disagree.
- **Impact**: The guard's core promise — "a dead `#anchor` fails loudly" — has a silent hole (FAQ answers) and a false-positive edge (valid FAQ deep links), so authors learn either to distrust the validator or to avoid linking to FAQ items at all.
- **Fix sketch**: Extend `anchorHrefs` to also scan `a.faq.map(f => f.a)`, and validate hrefs against `new Set([...ids, ...faqIds])`. Both are two-line changes; add a unit case for each in `test-unit/article-validate.test.mjs`.

## 4. Markdown serializer escapes only table pipes — content metacharacters and non-portable links corrupt the "portable" document
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: incomplete-escaping
- **File**: src/lib/article-markdown.ts:28
- **Scenario**: `inlineToMarkdown` interpolates raw text into Markdown: a plain string containing `*`, `_`, `#` at line start, or `[text]` renders as unintended emphasis/heading/link; link text containing `]` or an href containing `)` breaks the `[text](href)` syntax outright; a bold run containing `**` terminates early. Meanwhile `escapeCell` shows the team knows escaping matters — but only for `|` in tables (and headers aren't run through `inlineToMarkdown` at all, only `escapeCell`). Additionally, `figure.src` is documented as site-relative (`/clanek/foo.svg`) and internal CTAs point at `/dashboard`, so the file the header comment calls "one portable Markdown document" has images and links that 404 the moment it leaves the site — a real hazard for the AI-crawler and `.md`-export audiences it exists for.
- **Root cause**: The serializer treats the typed block model as guaranteeing Markdown-safe text, an assumption that holds for today's hand-authored `article.json` but not for the other two producers it advertises (deterministic bridge with client-supplied names/segments; future AI drafts). No `baseUrl` concept exists for absolutizing site-relative hrefs.
- **Impact**: A client named `Nuts & Co. [CZ]` or a segment string with brackets silently produces malformed Markdown on the machine-readable twin — the surface built specifically for parsers, which are least forgiving of it.
- **Fix sketch**: Add an `escapeMd` helper (backslash-escape `\ * _ [ ] < > #` + backtick) applied to text runs and link text; percent-encode `(`/`)` in hrefs. Accept an optional `baseUrl` in `articleToMarkdown` to absolutize hrefs/srcs starting with `/`. Extend the existing unit test with a metacharacter fixture.

## 5. OG card's eyebrow and footer rows have no truncation — long category/segment/author strings clip mid-glyph
- **Severity**: Low
- **Lens**: ui
- **Category**: og-card-overflow
- **File**: src/lib/article-og.tsx:65
- **Scenario**: `truncate()` guards title (96) and perex (160), but the eyebrow (`{meta.category} · {meta.readingMinutes} min čtení`, rendered at 26px with 4px letter-spacing) and the footer's author/role fields render raw. Generated report metadata pipes tenant-controlled values through here (`category`, and via tags/segment conventions elsewhere); a long category or a future long author/role simply runs past the 1200px canvas — satori clips it at the edge with no ellipsis, and can push the brand pill off-card.
- **Root cause**: Truncation was added where overflow was already observed (buying-guide titles — see the `titleSize` comment) rather than as a rule for every single-line text slot on a fixed-size canvas; the 64/96/160 thresholds are character counts standing in for pixel width.
- **Impact**: The share card — often a link's entire first impression — degrades to visibly amputated text exactly for the auto-generated per-client reports where nobody proofreads each card.
- **Fix sketch**: Apply `truncate(…, 48)`-style caps to category, author, and role (cheap, consistent with existing approach), and note next to the magic numbers that they approximate the slot's pixel budget at the given font size so future edits keep them in sync.
