/** Pure helpers for the Datový report chat: which period the report runs on
 *  (validated from the dashboard link) and the per-bucket conversation memory
 *  (localStorage read / write, defensive parse, capped). No React and no
 *  "use client" — the hook in ReportChat.tsx and the two mount pages import from
 *  here, and the unit tests exercise these parts directly. */
import { ANALYSIS_PERIODS, type AnalysisPeriod, type ChatTurn } from "@/lib/ai-types";

/** Keep the chat memory bounded so a long conversation can't grow the stored entry
 *  without limit — the last N turns are plenty of context to restore on return. */
export const MAX_REPORT_MESSAGES = 30;

/** Validate a raw `?period` value carried from the dashboard link against the
 *  report's known period keys, falling back to the 90-day default the report has
 *  always opened on. The dashboard also offers `7d`, which the report doesn't —
 *  those (and any garbage) fall back too, so the link can never open an invalid
 *  window. */
export function validateReportPeriod(raw: string | string[] | undefined): AnalysisPeriod {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (ANALYSIS_PERIODS as readonly string[]).includes(v ?? "") ? (v as AnalysisPeriod) : "90d";
}

/** Per-bucket localStorage key for the conversation. `bucket` is the project id on
 *  the authed mount and a shared demo bucket on the public demo mount, so the two
 *  never share a transcript. Mirrors the repo's `app:*:${id}` key convention. */
export function reportChatKey(bucket: string): string {
  return `app:report-chat:${bucket}`;
}

/** True when a value is a well-formed chat turn (a role we render + string content). */
function isChatTurn(v: unknown): v is ChatTurn {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (t.role === "user" || t.role === "assistant") && typeof t.content === "string";
}

/** Cap a transcript to the last {@link MAX_REPORT_MESSAGES} turns (keeps the tail). */
export function capMessages(msgs: ChatTurn[]): ChatTurn[] {
  return msgs.length > MAX_REPORT_MESSAGES ? msgs.slice(-MAX_REPORT_MESSAGES) : msgs;
}

/** Defensive parse of a stored transcript: returns the last
 *  {@link MAX_REPORT_MESSAGES} well-formed turns (extra keys stripped), or `[]` on
 *  missing / corrupt / non-array storage. Never throws. */
export function parseStoredMessages(raw: string | null): ChatTurn[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const clean = parsed.filter(isChatTurn).map((t) => ({ role: t.role, content: t.content }));
    return capMessages(clean);
  } catch {
    return [];
  }
}

/** Serialize a capped transcript for storage. */
export function serializeMessages(msgs: ChatTurn[]): string {
  return JSON.stringify(capMessages(msgs));
}

/** A transcript is "settled" — safe to persist — when it is empty (cleared) or ends
 *  on an assistant reply. A transcript ending on a user turn is a pending / errored
 *  exchange we deliberately don't persist, so a restored conversation never dangles
 *  on an unanswered question. */
export function isSettled(msgs: ChatTurn[]): boolean {
  return msgs.length === 0 || msgs[msgs.length - 1]!.role === "assistant";
}
