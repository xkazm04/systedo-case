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

/** The per-project persisted blob (the {items, updatedAt} shape the sibling
 *  single-blob stores use). */
export interface VariantState {
  articles: ArticleVariants[];
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
  return { articles: [], updatedAt: now.toISOString() };
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
