/** Pure state + trust-boundary sanitizer for the saved content library — the
 *  briefs and article drafts the Obsahový engine produces, kept per project so the
 *  work survives a cleared browser, a new laptop or a colleague's session.
 *
 *  Everything here is PURE (no store, no framework, no clock unless injected) so
 *  the transitions are unit-testable and identical on both storage backends. The
 *  thin read-modify-write dispatcher lives in ./store.
 *
 *  SIZE DISCIPLINE (the reason this file has caps at all): the blob rides
 *  `project_state`, whose dispatcher rejects anything over 900 KB. An article draft
 *  is the largest thing this app generates, and an inserted Creative visual is a
 *  data: URL worth megabytes on its own. So:
 *    • inserted figure sources are STRIPPED on save (the placeholder survives, the
 *      bytes don't) — the library stores text, never embedded imagery;
 *    • one entry is capped at ENTRY_MAX_BYTES;
 *    • the library is capped at LIBRARY_CAP entries AND LIBRARY_MAX_BYTES, pruning
 *      oldest-first, so a save can never grow the blob past what the store accepts.
 *  Pruning (rather than throwing) is deliberate: the failure mode this direction
 *  exists to remove is "your work vanished", and refusing the newest save would
 *  reintroduce it at the worst moment. */
import type { BriefRequest, BriefResult, ContentType } from "@/lib/ai-types";
import { CONTENT_TYPES } from "@/lib/ai-types";
import type { Block, FaqItem, Inline } from "@/lib/article";

/** A brief on its own, or a brief plus the article draft written from it. */
export type SavedContentKind = "brief" | "article";

/** The slice of AiMeta worth persisting: enough to label the entry honestly (which
 *  model, was it the deterministic demo fallback, how long it took) WITHOUT the
 *  full prompt, which is the single largest field on the response. */
export interface SavedGenerationMeta {
  model: string;
  demo: boolean;
  tookMs: number;
}

export interface SavedContentEntry {
  /** stable per-entry id; re-saving the same brief updates that entry in place */
  id: string;
  kind: SavedContentKind;
  /** display title — the brief's H1 (falls back to the title tag) */
  title: string;
  slug: string;
  /** ISO timestamp of the last save */
  savedAt: string;
  /** the inputs that produced it, so a restored entry can be re-generated */
  form: BriefRequest;
  brief: BriefResult;
  briefMeta: SavedGenerationMeta;
  /** the article draft, when one had been generated at save time */
  draft?: { blocks: Block[]; faq: FaqItem[] };
  draftMeta?: SavedGenerationMeta;
}

export interface ContentLibraryState {
  entries: SavedContentEntry[];
  updatedAt: string;
}

/** Newest-first entry cap. */
export const LIBRARY_CAP = 30;
/** Serialized ceiling for ONE entry (an oversized draft is truncated, not stored raw). */
export const ENTRY_MAX_BYTES = 48 * 1024;
/** Serialized ceiling for the whole blob — far under project_state's 900 KB budget. */
export const LIBRARY_MAX_BYTES = 600 * 1024;

const MAX_TEXT = 400;
const MAX_LONG_TEXT = 4_000;
const MAX_LIST = 40;
const MAX_BLOCKS = 200;

const str = (v: unknown, max = MAX_TEXT): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

const strList = (v: unknown, max = MAX_LIST, len = MAX_TEXT): string[] =>
  Array.isArray(v) ? v.slice(0, max).map((x) => str(x, len)).filter(Boolean) : [];

function sanitizeMeta(raw: unknown): SavedGenerationMeta {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    model: str(o.model, 80),
    demo: o.demo === true,
    tookMs: typeof o.tookMs === "number" && Number.isFinite(o.tookMs) ? Math.max(0, Math.round(o.tookMs)) : 0,
  };
}

function sanitizeBrief(raw: unknown): BriefResult | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const titleTag = str(o.titleTag);
  const h1 = str(o.h1);
  // A brief with no headline is not a brief — refuse rather than store a husk.
  if (!titleTag && !h1) return null;
  const outline = Array.isArray(o.outline)
    ? o.outline.slice(0, MAX_LIST).flatMap((s) => {
        const sec = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        const heading = str(sec.heading);
        return heading ? [{ heading, points: strList(sec.points) }] : [];
      })
    : [];
  const faq = Array.isArray(o.faq)
    ? o.faq.slice(0, MAX_LIST).flatMap((f) => {
        const it = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        const question = str(it.question);
        return question ? [{ question, answer: str(it.answer, MAX_LONG_TEXT) }] : [];
      })
    : [];
  return {
    titleTag,
    metaDescription: str(o.metaDescription),
    h1,
    slug: str(o.slug, 120),
    outline,
    faq,
    keywords: strList(o.keywords),
    internalLinks: strList(o.internalLinks),
    rationale: str(o.rationale, MAX_LONG_TEXT),
  };
}

function sanitizeForm(raw: unknown, brief: BriefResult): BriefRequest {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const contentType = (CONTENT_TYPES as readonly string[]).includes(o.contentType as string)
    ? (o.contentType as ContentType)
    : "blog";
  return {
    // Fall back to the brief itself so a restored entry always has something to
    // re-generate from, even if the form was lost on the way in.
    topic: str(o.topic) || brief.h1 || brief.titleTag,
    primaryKeyword: str(o.primaryKeyword) || brief.keywords[0] || "",
    audience: str(o.audience),
    contentType,
  };
}

/** Inline runs: a string, a link, or bold text — anything else is dropped. */
function sanitizeInline(v: unknown): Inline[] {
  if (!Array.isArray(v)) return [];
  const out: Inline[] = [];
  for (const item of v.slice(0, MAX_LIST)) {
    if (typeof item === "string") {
      out.push(item.slice(0, MAX_LONG_TEXT));
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const text = str(o.text, MAX_LONG_TEXT);
    if (!text) continue;
    if (typeof o.href === "string") {
      const kind = o.kind === "external" || o.kind === "anchor" ? o.kind : "internal";
      out.push({ text, href: o.href.slice(0, 500), kind });
    } else if (o.bold === true) {
      out.push({ text, bold: true });
    } else {
      out.push(text);
    }
  }
  return out;
}

/** One draft block, or null when the shape isn't one this app can render.
 *
 *  A `figure` keeps its alt/caption but LOSES its src: an inserted Creative visual
 *  is a multi-megabyte data: URL, and the library is a text store. The stripped
 *  figure restores exactly as the AI's own "add an image here" placeholder, which
 *  is what the workspace already knows how to render. */
function sanitizeBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case "h2":
    case "h3": {
      const text = str(o.text);
      return text ? { type: o.type, id: str(o.id, 120) || text.toLowerCase().replace(/\s+/g, "-").slice(0, 80), text } : null;
    }
    case "p": {
      const content = sanitizeInline(o.content);
      return content.length ? { type: "p", content } : null;
    }
    case "ul":
    case "ol": {
      const items = Array.isArray(o.items)
        ? o.items.slice(0, MAX_LIST).map(sanitizeInline).filter((i) => i.length > 0)
        : [];
      return items.length ? { type: o.type, items } : null;
    }
    case "callout": {
      const content = sanitizeInline(o.content);
      const variant = o.variant === "info" || o.variant === "warn" ? o.variant : "tip";
      return content.length ? { type: "callout", variant, title: str(o.title, 160), content } : null;
    }
    case "quote": {
      const content = sanitizeInline(o.content);
      return content.length
        ? { type: "quote", content, ...(str(o.cite, 160) ? { cite: str(o.cite, 160) } : {}) }
        : null;
    }
    case "cta": {
      const text = str(o.text, MAX_LONG_TEXT);
      const cta = str(o.cta, 160);
      return text && cta
        ? {
            type: "cta",
            text,
            href: str(o.href, 500),
            kind: o.kind === "external" ? "external" : "internal",
            cta,
            ...(str(o.campaign, 120) ? { campaign: str(o.campaign, 120) } : {}),
          }
        : null;
    }
    case "figure": {
      const alt = str(o.alt, 300);
      return alt
        ? {
            type: "figure",
            src: "",
            alt,
            width: typeof o.width === "number" ? o.width : 1200,
            height: typeof o.height === "number" ? o.height : 1200,
            ...(str(o.caption, 300) ? { caption: str(o.caption, 300) } : {}),
          }
        : null;
    }
    default:
      // stat / table and anything unknown: not produced by the draft tool — dropped
      // rather than stored as a shape the renderer may not understand.
      return null;
  }
}

function sanitizeDraft(raw: unknown): { blocks: Block[]; faq: FaqItem[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const blocks = Array.isArray(o.blocks)
    ? o.blocks.slice(0, MAX_BLOCKS).map(sanitizeBlock).filter((b): b is Block => b !== null)
    : [];
  if (blocks.length === 0) return null;
  const faq = Array.isArray(o.faq)
    ? o.faq.slice(0, MAX_LIST).flatMap((f) => {
        const it = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        const q = str(it.q);
        const a = sanitizeInline(it.a);
        return q ? [{ q, a }] : [];
      })
    : [];
  return { blocks, faq };
}

/** Stable id for a saved brief: slug (or headline) + a short hash of the topic, so
 *  re-saving the same piece of work UPDATES its entry instead of piling duplicates
 *  into the library after every regeneration. Pure, deterministic. */
export function contentEntryId(brief: { slug: string; h1: string; titleTag: string }, topic: string): string {
  const base = (brief.slug || brief.h1 || brief.titleTag || "obsah")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  let h = 2166136261;
  for (const ch of `${base}|${topic}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `${base || "obsah"}-${(h >>> 0).toString(36)}`;
}

/** Coerce an untrusted client payload into a storable entry, or null when it holds
 *  no usable brief. Bounded on every axis; the whole entry is dropped if it still
 *  serializes past ENTRY_MAX_BYTES after the draft is discarded. */
export function sanitizeEntry(raw: unknown, now: Date = new Date()): SavedContentEntry | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const brief = sanitizeBrief(o.brief);
  if (!brief) return null;
  const form = sanitizeForm(o.form, brief);
  const draft = sanitizeDraft(o.draft);
  const entry: SavedContentEntry = {
    id: contentEntryId(brief, form.topic),
    kind: draft ? "article" : "brief",
    title: brief.h1 || brief.titleTag,
    slug: brief.slug,
    savedAt: now.toISOString(),
    form,
    brief,
    briefMeta: sanitizeMeta(o.briefMeta),
    ...(draft ? { draft, draftMeta: sanitizeMeta(o.draftMeta) } : {}),
  };
  if (bytes(entry) <= ENTRY_MAX_BYTES) return entry;
  // Too large with the draft attached: keep the brief (the small, high-value half)
  // rather than losing the save entirely.
  const briefOnly: SavedContentEntry = { ...entry, kind: "brief", draft: undefined, draftMeta: undefined };
  return bytes(briefOnly) <= ENTRY_MAX_BYTES ? briefOnly : null;
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/** The stored entries, newest-first — [] for a project that never saved. Pure. */
export function libraryEntries(state: ContentLibraryState | null): SavedContentEntry[] {
  return state?.entries ?? [];
}

/** Add (or refresh) one entry at the front, replacing the same id in place. Prunes
 *  oldest-first until BOTH the count and the byte budget fit. Never mutates. */
export function upsertEntry(
  prev: ContentLibraryState | null,
  entry: SavedContentEntry,
  now: Date = new Date()
): ContentLibraryState {
  const rest = libraryEntries(prev).filter((e) => e.id !== entry.id);
  let entries = [entry, ...rest].slice(0, LIBRARY_CAP);
  const updatedAt = now.toISOString();
  // Byte-budget prune: drop the oldest until the blob fits. The newest entry is
  // never the one dropped — it is the save the user just asked for.
  while (entries.length > 1 && bytes({ entries, updatedAt }) > LIBRARY_MAX_BYTES) {
    entries = entries.slice(0, -1);
  }
  return { entries, updatedAt };
}

/** Drop one entry by id. Never mutates. */
export function removeEntry(
  prev: ContentLibraryState | null,
  id: string,
  now: Date = new Date()
): ContentLibraryState {
  return { entries: libraryEntries(prev).filter((e) => e.id !== id), updatedAt: now.toISOString() };
}
