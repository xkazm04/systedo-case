/** Per-project report annotations — "what happened here" business events pinned to a
 *  date, so a LIVE report chart has memory of the story behind the numbers (a demo
 *  dataset carries an authored event calendar; live data got events:undefined). One
 *  annotation is {id, date, text, createdAt}; the project's set is a single {items,
 *  updatedAt} blob persisted through the store trio. Framework-free — the pure
 *  sanitizers/state transitions live here (mirrors diagnoses/organic-channels/types),
 *  and the same file maps annotations into the PerformanceData event shape the sample
 *  path uses, so chart markers + recap grounding read one canonical source. */
import type { PerformanceData, PerformanceEvent } from "@/lib/types";
import type { SupportedLocale } from "@/lib/format";

/** One dated client note. `text` is bounded; `date` is a YYYY-MM-DD calendar day. */
export interface Annotation {
  /** stable id — keys the persisted item, the React list and the DELETE route */
  id: string;
  /** the day the event happened, YYYY-MM-DD */
  date: string;
  /** the note, e.g. "Spustili jsme TV kampaň" (bounded, plain text) */
  text: string;
  /** ISO timestamp the note was created */
  createdAt: string;
}

/** The persisted per-project blob: the notes + a save stamp. Mirrors the other
 *  single-blob stores ({items, updatedAt}). */
export interface AnnotationState {
  /** newest-first (by createdAt); capped at ANNOTATION_CAP */
  items: Annotation[];
  updatedAt: string;
}

/** Honest cap per project — a report's event log, not an unbounded journal. Adding
 *  past the cap drops the OLDEST note (truncation the UI states plainly). */
export const ANNOTATION_CAP = 50;

/** Max note length — a marker label, not a paragraph. */
export const ANNOTATION_TEXT_MAX = 160;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string that is also a real calendar day (rejects 2026-13-40). */
function isValidYmd(v: string): boolean {
  if (!YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Coerce arbitrary client JSON into a clean {date, text} draft, or null to reject
 *  (missing/blank text, malformed date). Never trust the wire. */
export function sanitizeAnnotationInput(raw: unknown): { date: string; text: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = typeof o.date === "string" ? o.date.trim() : "";
  const text = typeof o.text === "string" ? o.text.trim().slice(0, ANNOTATION_TEXT_MAX) : "";
  if (!isValidYmd(date) || !text) return null;
  return { date, text };
}

/** A collision-resistant id without pulling a dependency (crypto.randomUUID where
 *  available, else a timestamped random — ids are opaque, only uniqueness matters). */
function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Append a sanitized draft as a new annotation (newest-first) and re-cap to
 *  ANNOTATION_CAP by dropping the OLDEST. Pure — the store stamps `updatedAt`. */
export function addAnnotation(
  prev: AnnotationState | null,
  input: { date: string; text: string },
  now: Date = new Date()
): AnnotationState {
  const item: Annotation = {
    id: newId(),
    date: input.date,
    text: input.text,
    createdAt: now.toISOString(),
  };
  const items = [item, ...(prev?.items ?? [])].slice(0, ANNOTATION_CAP);
  return { items, updatedAt: now.toISOString() };
}

/** Remove one annotation by id. Returns the next state + whether an item was found
 *  (so the route can 404 an unknown id instead of silently succeeding). */
export function removeAnnotation(
  prev: AnnotationState | null,
  id: string,
  now: Date = new Date()
): { state: AnnotationState; found: boolean } {
  const items = prev?.items ?? [];
  const next = items.filter((a) => a.id !== id);
  return {
    state: { items: next, updatedAt: now.toISOString() },
    found: next.length !== items.length,
  };
}

/** Annotations whose date falls in the inclusive [from, to] window. YYYY-MM-DD
 *  strings sort lexicographically, so plain string compare is correct here. */
export function annotationsInWindow(items: Annotation[], from: string, to: string): Annotation[] {
  return items.filter((a) => a.date >= from && a.date <= to);
}

/** Map annotations into the dataset's PerformanceEvent shape (kind "milestone" — a
 *  neutral client-authored marker), so a live report chart renders markers on the
 *  SAME path a sample dataset's authored events would, and the resolver can drop
 *  them straight onto PerformanceData.events. Sorted ascending by date. */
export function annotationsToEvents(items: Annotation[]): PerformanceEvent[] {
  return [...items]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => ({ date: a.date, label: a.text, kind: "milestone" as const }));
}

/** The in-window annotations as a short recap grounding block ("Poznámky klienta"),
 *  fed through the USER-prompt grounding channel (no system-prompt/fingerprint
 *  change). Window = the last `windowDays` ending at the dataset's last day. "" when
 *  there is no data or no in-window note, so the prompt stays byte-identical.
 *  Capped so a busy log can't blow the prompt. */
export function annotationsGroundingText(
  items: Annotation[],
  data: PerformanceData | undefined,
  windowDays: number,
  locale: SupportedLocale,
  maxLines = 12
): string {
  if (!items.length || !data?.daily.length) return "";
  const lastDate = data.daily[data.daily.length - 1]!.date;
  const to = new Date(`${lastDate}T00:00:00.000Z`);
  const from = new Date(to.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const inWin = annotationsInWindow(items, from, lastDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, maxLines);
  if (!inWin.length) return "";
  const lines = inWin.map((a) => `${a.date}: ${a.text}`).join("; ");
  return locale === "en"
    ? `Client notes for this period (business events behind the numbers) — reference them when they explain a move: ${lines}.`
    : `Poznámky klienta k tomuto období (události v byznysu za čísly) — zmiň je, když vysvětlují pohyb: ${lines}.`;
}
