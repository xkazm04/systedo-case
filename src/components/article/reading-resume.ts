/** Pure helpers behind the "Pokračovat ve čtení" resume chip (article-reading
 *  #4). ReadingProgress persists the reader's scroll position per pathname; on
 *  a return visit these decide whether the stored position is worth offering
 *  and how much reading time remains. Framework-free and unit-tested in
 *  test-unit/reading-resume.test.mjs. */

export interface ReadingPosition {
  /** absolute scroll offset (px) to return to */
  y: number;
  /** reading progress 0..1 at the time of saving */
  p: number;
  /** epoch ms of the save (informational; not used for expiry today) */
  ts: number;
}

/** Versioned storage key, scoped per pathname so each article remembers its own place. */
export function readingPositionKey(pathname: string): string {
  return `systedo.read.v1:${pathname}`;
}

/** Parse a stored position defensively — malformed or truncated JSON, missing
 *  fields and non-finite numbers all degrade to "no stored position". */
export function parseReadingPosition(raw: string | null): ReadingPosition | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const { y, p, ts } = v as Record<string, unknown>;
    if (typeof y !== "number" || typeof p !== "number" || typeof ts !== "number") return null;
    if (!Number.isFinite(y) || !Number.isFinite(p) || !Number.isFinite(ts)) return null;
    if (y < 0 || p < 0 || p > 1) return null;
    return { y, p, ts };
  } catch {
    return null;
  }
}

/** Below this the reader barely started; above it they effectively finished —
 *  neither is worth interrupting the fresh page-load with a chip. */
export const RESUME_MIN_PROGRESS = 0.05;
export const RESUME_MAX_PROGRESS = 0.95;
/** Don't offer a jump shorter than this — the reader is already (nearly) there
 *  (covers the browser's own scroll restoration after a same-session reload). */
export const RESUME_MIN_DISTANCE_PX = 400;
/** After this the stored position is too old to trust: the article may have been
 *  edited/re-laid-out since, so a saved place risks landing the reader in an
 *  unrelated section. `ts` is recorded precisely so we can expire it. */
export const RESUME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Should the chip be offered for this stored position, given where the
 *  viewport currently sits? Positions older than {@link RESUME_MAX_AGE_MS} are
 *  declined — the layout the pixel/fraction was saved under may no longer hold. */
export function shouldOfferResume(
  pos: ReadingPosition | null,
  currentY: number,
  now: number = Date.now()
): pos is ReadingPosition {
  if (!pos) return false;
  if (now - pos.ts > RESUME_MAX_AGE_MS) return false;
  if (pos.p < RESUME_MIN_PROGRESS || pos.p > RESUME_MAX_PROGRESS) return false;
  return Math.abs(pos.y - currentY) >= RESUME_MIN_DISTANCE_PX;
}

/** Where to scroll to resume, derived from the stored progress *fraction* rather
 *  than the absolute pixel offset — so a different breakpoint, edited content or
 *  resized images still land the reader at the same relative point in the piece.
 *  `maxScroll` is `scrollHeight - innerHeight`; the result is clamped into it. */
export function resumeScrollTop(progress: number, maxScroll: number): number {
  if (!Number.isFinite(maxScroll) || maxScroll <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, progress)) * maxScroll);
}

/** Estimated minutes of reading left at the stored progress — never less than
 *  1 so the chip doesn't promise "0 min" for an unfinished article. */
export function remainingMinutes(readingMinutes: number, progress: number): number {
  return Math.max(1, Math.ceil(readingMinutes * (1 - progress)));
}
