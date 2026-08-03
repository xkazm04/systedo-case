/** Pure, framework-free model for PERSISTED distribution variants — the missing
 *  spine under Distribuce's "handoff workflow".
 *
 *  The module presented itself as a workflow (regenerate with AI, hand-edit to the
 *  channel's voice, ship) while every variant lived in a component `useState`:
 *  edit four channels, switch tabs, come back — silently gone. This is the stored
 *  form: one blob per project holding, per source article, one entry per channel
 *  (the text, how it got there, and when), with pure transitions so the store is a
 *  thin read-modify-write dispatcher and the interesting logic is unit-testable
 *  without any I/O.
 *
 *  No React and no server imports, so both the client module and the server store
 *  import the same one. Mirrors the shape of lib/catalog/ad-copy.ts. */

/** How a stored variant's current text came to be, and how far along the handoff
 *  it is. Ordered by progress — see {@link advanceStatus}.
 *
 *  `handed_off` composes with (it does not duplicate) the publish events already
 *  recorded on the activity feed: the feed answers "what left the app and when",
 *  this answers "which variant is done" the next time the page is opened. */
export const VARIANT_STATUSES = ["generated", "edited", "handed_off"] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

const STATUS_RANK: Record<VariantStatus, number> = {
  generated: 0,
  edited: 1,
  handed_off: 2,
};

export interface StoredVariant {
  /** the Distribuce channel label this text belongs to (the entry key) */
  channel: string;
  text: string;
  status: VariantStatus;
  /** ISO timestamp of the last change */
  updatedAt: string;
}

/** Everything stored for ONE source article. */
export interface ArticleVariants {
  /** stable id of the source article (see {@link articleKey}) */
  articleKey: string;
  /** the article's title at the time of the last save — for the UI's "you're
   *  editing X" label, so a stored entry is identifiable without the source. */
  title: string;
  variants: StoredVariant[];
  updatedAt: string;
}

/** A source article the user sent into Distribuce from elsewhere in the app (the
 *  article draft panel / content engine). Stored alongside the variants in the SAME
 *  blob deliberately: the handoff and the variants it produces are one record, and
 *  reusing this seam is what keeps the app from growing a second transport for
 *  "here is an article, distribute it". */
export interface StoredArticleSource {
  /** {@link articleKey} of the article — the join to its ArticleVariants entry */
  articleKey: string;
  title: string;
  url: string;
  /** the article prose the channel variants are repurposed FROM */
  body: string;
  /** ISO timestamp the article was handed over */
  savedAt: string;
}

/** The per-project persisted blob (the {items, updatedAt} shape the sibling
 *  single-blob stores use). */
export interface VariantState {
  articles: ArticleVariants[];
  /** Articles handed into Distribuce, newest first. Absent on blobs written before
   *  the handoff existed — read it through {@link storedSources}, never directly. */
  sources?: StoredArticleSource[];
  updatedAt: string;
}

/** How many source articles a project keeps variants for. Oldest-touched drop off
 *  past this, keeping the blob well under the project_state size ceiling. */
export const VARIANT_ARTICLE_CAP = 25;

/** Per-variant text bound — the trust boundary for text the CLIENT echoes back.
 *  Generous next to the largest channel budget (LinkedIn, 3000) so a deliberate
 *  long draft is never truncated, tight enough that the blob stays bounded. */
export const VARIANT_TEXT_MAX = 8000;

const MAX_LABEL = 200;

/** How many handed-over source articles a project keeps, and how much prose each
 *  carries. Both bound the shared blob: 10 × 12 000 chars is a small fraction of
 *  the project_state ceiling even alongside a full set of variants. */
export const SOURCE_ARTICLE_CAP = 10;
export const SOURCE_BODY_MAX = 12_000;
const MAX_URL = 500;

// ---------------------------------------------------------------------------
// Article identity
// ---------------------------------------------------------------------------

/** FNV-1a, 32-bit — a tiny, dependency-free, platform-identical hash. Not for
 *  security; only for a stable short key that the client and the server derive
 *  identically (node:crypto would not survive the client import). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The stable storage key for a source article. Derived from url + title, so
 *  re-opening the same article finds its variants and a DIFFERENT article never
 *  inherits them — which a title slug alone could not guarantee (two drafts share
 *  a headline, and an empty title collapses everything onto one key). */
export function articleKey(source: { title: string; url: string }): string {
  return fnv1a(`${source.url}\n${source.title}`);
}

// ---------------------------------------------------------------------------
// Trust boundary
// ---------------------------------------------------------------------------

function isStatus(v: unknown): v is VariantStatus {
  return typeof v === "string" && (VARIANT_STATUSES as readonly string[]).includes(v);
}

/** Coerce an untrusted, client-supplied entry into a bounded StoredVariant.
 *  `channel` is forced from the trusted argument (never read from the payload).
 *  Pure. */
export function sanitizeVariant(raw: unknown, channel: string, now: Date = new Date()): StoredVariant {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const at =
    typeof o.updatedAt === "string" && !Number.isNaN(Date.parse(o.updatedAt))
      ? o.updatedAt
      : now.toISOString();
  return {
    channel: channel.slice(0, MAX_LABEL),
    text: typeof o.text === "string" ? o.text.slice(0, VARIANT_TEXT_MAX) : "",
    status: isStatus(o.status) ? o.status : "edited",
    updatedAt: at,
  };
}

// ---------------------------------------------------------------------------
// Pure transitions
// ---------------------------------------------------------------------------

export function emptyVariantState(now: Date = new Date()): VariantState {
  return { articles: [], sources: [], updatedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Handed-over source articles + source selection
// ---------------------------------------------------------------------------

/** Coerce an untrusted, client-supplied article into a bounded StoredArticleSource.
 *  Returns null when the payload has no usable title or an unusable URL — the UTM
 *  stamper builds a `new URL()` from it, so an unparseable value must never be
 *  stored rather than break every variant link later. Pure. */
export function sanitizeSource(raw: unknown, now: Date = new Date()): StoredArticleSource | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim().slice(0, MAX_LABEL) : "";
  const url = typeof o.url === "string" ? o.url.trim().slice(0, MAX_URL) : "";
  if (!title || !url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  const savedAt =
    typeof o.savedAt === "string" && !Number.isNaN(Date.parse(o.savedAt))
      ? o.savedAt
      : now.toISOString();
  return {
    articleKey: articleKey({ title, url }),
    title,
    url,
    body: typeof o.body === "string" ? o.body.slice(0, SOURCE_BODY_MAX) : "",
    savedAt,
  };
}

/** The stored sources, newest first — [] for a blob written before the handoff
 *  existed (or a project that never used it). Pure. */
export function storedSources(state: VariantState | null): StoredArticleSource[] {
  return state?.sources ?? [];
}

/** Add (or refresh) one handed-over article at the front of the list, replacing
 *  the same article in place so re-sending a revised draft updates rather than
 *  duplicates it. Oldest fall off past `cap`. Never mutates. Pure. */
export function upsertSource(
  prev: VariantState | null,
  source: StoredArticleSource,
  cap = SOURCE_ARTICLE_CAP,
  now: Date = new Date()
): VariantState {
  const rest = storedSources(prev).filter((s) => s.articleKey !== source.articleKey);
  return {
    articles: prev?.articles ?? [],
    sources: [source, ...rest].slice(0, Math.max(1, cap)),
    updatedAt: now.toISOString(),
  };
}

/** Where the article currently open in Distribuce came from. The distinction is
 *  load-bearing: the fixture is illustrative content that must never be mistaken
 *  for the user's own work (and vice versa). */
export type SourceOrigin = "sample" | "project";

export interface SourceChoice {
  key: string;
  title: string;
  origin: SourceOrigin;
}

/** The article Distribuce should show, given the fixture, everything stored, and
 *  the user's explicit pick (null = "no choice made yet").
 *
 *  With NOTHING stored this always returns the fixture — which is what keeps a
 *  brand-new project exactly as it was: the fixture IS the empty state, not a
 *  fallback that a stored article competes with. Once the user has handed an
 *  article over, their newest article is the default (they came here to distribute
 *  it), the fixture stays explicitly selectable, and an unknown/stale key resolves
 *  to that same default instead of throwing. Pure. */
export function selectSource<S extends { title: string; url: string; body?: string }>(
  fixture: S,
  sources: readonly StoredArticleSource[],
  selectedKey: string | null
): { source: S; origin: SourceOrigin; key: string } {
  const fixtureKey = articleKey(fixture);
  const asSource = (s: StoredArticleSource): S =>
    ({ ...fixture, title: s.title, url: s.url, body: s.body }) as S;

  if (sources.length === 0) return { source: fixture, origin: "sample", key: fixtureKey };
  if (selectedKey === fixtureKey) return { source: fixture, origin: "sample", key: fixtureKey };
  const hit = selectedKey ? sources.find((s) => s.articleKey === selectedKey) : undefined;
  const chosen = hit ?? sources[0]!;
  return { source: asSource(chosen), origin: "project", key: chosen.articleKey };
}

/** Every article the source picker can offer, in render order: the user's own
 *  articles newest-first, then the fixture — always last and always labelled, so
 *  the illustrative content can be reached again without ever being the thing that
 *  quietly looks like your work. Pure. */
export function sourceChoices(
  fixture: { title: string; url: string },
  sources: readonly StoredArticleSource[]
): SourceChoice[] {
  return [
    ...sources.map((s) => ({ key: s.articleKey, title: s.title, origin: "project" as const })),
    { key: articleKey(fixture), title: fixture.title, origin: "sample" as const },
  ];
}

/** The status a variant should carry after `next` happens to it.
 *
 *  Monotone within one version of the text: a hand-edit on top of an AI variant is
 *  still "edited", and re-copying an already handed-off variant stays handed off.
 *  The one deliberate step BACKWARD is a fresh AI regeneration or a new hand-edit
 *  after a handoff — that is a new version of the text which has NOT shipped yet,
 *  and claiming otherwise would let the badge lie about work still to do. Callers
 *  express that by passing `textChanged`. Pure. */
export function advanceStatus(
  current: VariantStatus | undefined,
  next: VariantStatus,
  textChanged = false
): VariantStatus {
  if (!current) return next;
  if (textChanged) return next;
  return STATUS_RANK[next] >= STATUS_RANK[current] ? next : current;
}

/** Upsert one channel's variant for one article, then move the article to the
 *  front (most-recently-touched first) and drop the oldest past `cap`. Replaces
 *  the channel entry in place, so a regenerate overwrites rather than duplicates.
 *  Never mutates the input. Pure. */
export function upsertVariant(
  prev: VariantState | null,
  articleKey: string,
  title: string,
  entry: StoredVariant,
  cap = VARIANT_ARTICLE_CAP,
  now: Date = new Date()
): VariantState {
  const nowIso = now.toISOString();
  const existing = prev?.articles.find((a) => a.articleKey === articleKey);
  const rest = (prev?.articles ?? []).filter((a) => a.articleKey !== articleKey);
  const variants = [
    ...(existing?.variants ?? []).filter((v) => v.channel !== entry.channel),
    entry,
  ];
  const article: ArticleVariants = {
    articleKey,
    title: title.slice(0, MAX_LABEL),
    variants,
    updatedAt: nowIso,
  };
  return {
    articles: [article, ...rest].slice(0, Math.max(1, cap)),
    // Variants and handed-over sources live in one blob; a variant write must
    // carry the sources through untouched or saving an edit would silently
    // un-hand-over the article it belongs to.
    ...(prev?.sources ? { sources: prev.sources } : {}),
    updatedAt: nowIso,
  };
}

/** The stored variants for one article as a channel → entry lookup. Returns an
 *  EMPTY object when nothing is stored, which is what keeps a fresh project
 *  byte-identical to before this store existed: the module falls straight through
 *  to the deterministic repurpose output. Pure. */
export function variantsForArticle(
  state: VariantState | null,
  key: string
): Record<string, StoredVariant> {
  const article = state?.articles.find((a) => a.articleKey === key);
  const out: Record<string, StoredVariant> = {};
  for (const v of article?.variants ?? []) out[v.channel] = v;
  return out;
}

/** Overlay the stored text on top of freshly repurposed variants: a channel with
 *  a stored entry keeps the user's/AI's text, one without keeps the deterministic
 *  draft. Order and every other field (link, budget) come from `fresh`, so the
 *  store can never resurrect a stale UTM link or a retired channel. Pure. */
export function applyStoredVariants<T extends { channel: string; text: string }>(
  fresh: readonly T[],
  stored: Record<string, StoredVariant>
): T[] {
  return fresh.map((v) => {
    const hit = stored[v.channel];
    return hit ? { ...v, text: hit.text } : v;
  });
}
