/** The roof contract (ADR-0013): what a module tells its area roof about itself.
 *  A roof is assembled from these summaries, so a new module appears on its roof
 *  without anyone editing the roof page. A module with no summarizer is shown as
 *  a plain entry tile — allowed, and counted as debt by `summaryCoverage`.
 *
 *  Summarizers are server-side and read through the same stores and resolvers the
 *  module page uses; they must be cheap (one store read, no model call) because a
 *  roof runs all of its rooms' summarizers on every visit, each in its own
 *  Suspense boundary so one slow store never holds the page. */
import type { Project } from "./types";
import type { SupportedLocale } from "@/lib/format";
import { MODULES } from "./modules";

export type RoomStatus = "ok" | "attention" | "empty" | "disconnected";

export interface RoomSummary {
  status: RoomStatus;
  /** One headline figure, pre-formatted for the locale. */
  metric?: { label: string; value: string };
  /** One sentence: what changed or what is waiting. */
  note?: string;
  /** Provenance of the metric; `sample` is always said out loud on the card. */
  source?: "live" | "api" | "import" | "manual" | "sample";
}

export interface SummaryContext {
  project: Project;
  userId: string;
  locale: SupportedLocale;
}

export type Summarizer = (ctx: SummaryContext) => Promise<RoomSummary>;

/** Module key → summarizer. Filled area by area (Phase 4); an absent key is an
 *  entry tile. Kept as a lazy import map so a roof only loads the summarizers of
 *  the rooms it shows. */
export const SUMMARIZERS: Partial<Record<string, () => Promise<{ default: Summarizer }>>> = {};

export async function summarizeRoom(key: string, ctx: SummaryContext): Promise<RoomSummary | null> {
  const load = SUMMARIZERS[key];
  if (!load) return null;
  try {
    const { default: summarize } = await load();
    return await summarize(ctx);
  } catch {
    // A roof card must never take the roof down; the room itself shows the error.
    return null;
  }
}

/** How many of the registry's rooms have a summarizer — the debt the ADR counts. */
export function summaryCoverage(): { covered: number; total: number } {
  const rooms = MODULES.filter((m) => m.area !== "home" && m.area !== "settings");
  return { covered: rooms.filter((m) => SUMMARIZERS[m.key]).length, total: rooms.length };
}
