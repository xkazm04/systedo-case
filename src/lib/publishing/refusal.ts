/** The wire shape of a cadence refusal, and the one function that reads it.
 *
 *  `POST /api/social/posts` answers `409 { error: "cadence-exceeded", channel,
 *  cap, count, weekStart }` when a scheduled post would break the operator's own
 *  per-channel weekly cap. Three unrelated surfaces have to recognise that (the
 *  week planner, the content-plan board's hand-off, the Distribuce variant card),
 *  and each of them already had an error path that would otherwise render the raw
 *  machine string "cadence-exceeded" at a human — so the parse lives here, once.
 *
 *  Trust boundary: this reads a RESPONSE, which is ours, but it is still parsed
 *  defensively. A 409 whose body does not carry a usable cap is NOT a refusal this
 *  can explain, so it returns null and the caller falls back to its generic error
 *  — better a plain "scheduling failed" than a confident sentence about a cap of
 *  NaN. Pure and framework-free. */
import { isChannelKey, type ChannelKey } from "./channel-key";

export interface CadenceRefusal {
  channel: ChannelKey;
  /** the weekly cap that was hit */
  cap: number;
  /** how many items already occupy the channel-week */
  count: number;
  /** Monday of that local week, YYYY-MM-DD */
  weekStart: string;
}

const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null;

/** A failed response → the refusal it describes, or null when it is any other
 *  failure. Callers pass the status AND the already-parsed body, because every one
 *  of them had to read the body for its own error message anyway. */
export function parseCadenceRefusal(status: number, body: unknown): CadenceRefusal | null {
  if (status !== 409 || !body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (o.error !== "cadence-exceeded") return null;
  const cap = int(o.cap);
  const count = int(o.count);
  if (!isChannelKey(o.channel) || cap === null || cap < 1 || count === null) return null;
  return {
    channel: o.channel,
    cap,
    count,
    weekStart: typeof o.weekStart === "string" ? o.weekStart : "",
  };
}
