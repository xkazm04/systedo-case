"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { runPool } from "@/lib/social/plan-pool";
import { draftResponseMeta, mergeDraftMetas, type SocialDraftMeta } from "@/lib/social/draft-meta";
import type { SocialPlatform, Tone } from "@/lib/social/types";

const T = {
  cs: {
    genFailed: "Generování se nezdařilo.",
    serverError: "Nepodařilo se spojit se serverem.",
    partialKept: "Naplánováno {done}/{total} témat. V poli zůstala jen nezpracovaná, spusťte plánování znovu.",
    partialPosts: "Vytvořeno {saved} z {promised} příspěvků. Pro některé sítě se nepodařilo vygenerovat text.",
  },
  en: {
    genFailed: "Generation failed.",
    serverError: "Could not reach the server.",
    partialKept: "Scheduled {done}/{total} topics. Only the unprocessed ones were kept in the field; run the planner again.",
    partialPosts: "Created {saved} of {promised} posts. Some networks could not be generated.",
  },
} as const;

/** How many topics generate at once. The server's generation semaphore is 4-wide
 *  ACROSS ALL USERS (AI_MAX_CONCURRENT) — one browser must not take 3+ of those 4
 *  slots for minutes — and the per-IP minute budget (AI_RATE_PER_MIN, default 8)
 *  comfortably fits a 7-draft burst either way. 2 roughly halves the batch's wall
 *  time (the AI drafts dominate; a 7-topic run goes ~7 draft-latencies → ~4) while
 *  leaving at least half the shared semaphore to everyone else. Verified by the
 *  simulated-timing test in test-unit/social-plan-pool.test.mjs. */
export const PLAN_CONCURRENCY = 2;

/** A worker failure that already carries the user-facing message. */
class PlanError extends Error {}

export interface PlanWeekArgs {
  /** the (≤7) topics to run */
  topics: string[];
  /** ALL trimmed non-empty textarea lines (topics + over-cap tail) */
  allLines: string[];
  platforms: SocialPlatform[];
  tone: Tone;
  /** resolved brand voice (manual → auto → project name), may be undefined */
  brand?: string;
  /** the first scheduling slot; topic i lands on firstSlot + i days */
  firstSlot: Date;
  pid?: string;
}

export interface PlanWeekState {
  running: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  batchHealth: { meta: SocialDraftMeta; flagged: number; total: number } | null;
  /** run the batch; resolves with the textarea lines that should REMAIN (untouched
   *  tail + failed/unprocessed topics), or null when aborted mid-flight (unmount). */
  planWeek: (args: PlanWeekArgs) => Promise<string[] | null>;
}

/** The week planner's batch engine: up to {@link PLAN_CONCURRENCY} topics draft in
 *  parallel (each topic's post saves stay sequential inside its worker), with
 *  fail-fast on the first server error — mirroring the old serial loop's early
 *  break, so the draft route's rate limits are respected exactly as before. The
 *  whole run rides one AbortController wired to unmount: navigating away stops the
 *  remaining network work, and posts already saved stay saved (the caller drops
 *  exactly the topics that fully persisted from the textarea). */
export function usePlanWeek(): PlanWeekState {
  const t = useT(T);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchHealth, setBatchHealth] = useState<PlanWeekState["batchHealth"]>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight batch when the surface unmounts.
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const planWeek = useCallback(
    async (args: PlanWeekArgs): Promise<string[] | null> => {
      const { topics, allLines, platforms, tone, brand, firstSlot, pid } = args;
      if (topics.length === 0 || controllerRef.current) return null;
      const controller = new AbortController();
      controllerRef.current = controller;
      const { signal } = controller;
      setRunning(true);
      setError(null);
      setBatchHealth(null);
      setProgress({ done: 0, total: topics.length });

      const platformSet = new Set(platforms);
      const metas: (SocialDraftMeta | null)[] = topics.map(() => null);
      let savedCount = 0;
      let doneTopics = 0;

      const outcome = await runPool(topics, PLAN_CONCURRENCY, async (topic, i) => {
        let draftJson: { error?: string; drafts?: { platform: SocialPlatform; content: string }[] };
        try {
          const draftRes = await fetch("/api/social/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic,
              tone,
              platforms,
              ai: true,
              ...(brand ? { brand } : {}),
              ...(pid ? { projectId: pid } : {}),
            }),
            signal,
          });
          draftJson = await draftRes.json();
          if (!draftRes.ok) throw new PlanError(draftJson?.error ?? t("genFailed"));
        } catch (err) {
          if (err instanceof PlanError || signal.aborted) throw err;
          throw new PlanError(t("serverError"));
        }
        metas[i] = draftResponseMeta(draftJson);
        // One topic → a differentiated caption per selected platform, all scheduled
        // on the topic's day. Saves stay SEQUENTIAL inside the worker: the bound
        // applies to topics, so total in-flight requests never exceed the bound.
        const when = new Date(firstSlot);
        when.setDate(firstSlot.getDate() + i);
        for (const d of draftJson.drafts ?? []) {
          if (!d?.content || !platformSet.has(d.platform)) continue;
          // A resolved fetch is not an HTTP success (401/429/500) — check it, or the
          // progress completes while nothing persisted (success theater).
          let saveRes: Response;
          try {
            saveRes = await fetch("/api/social/posts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform: d.platform,
                content: d.content,
                scheduledAt: when.toISOString(),
                projectId: pid,
              }),
              signal,
            });
          } catch (err) {
            if (signal.aborted) throw err;
            throw new PlanError(t("serverError"));
          }
          if (!saveRes.ok) {
            const j = await saveRes.json().catch(() => null);
            throw new PlanError((j as { error?: string } | null)?.error ?? t("genFailed"));
          }
          savedCount += 1;
        }
        doneTopics += 1;
        if (!signal.aborted) setProgress({ done: doneTopics, total: topics.length });
      });

      controllerRef.current = null;
      if (signal.aborted) return null; // unmounted — no state updates, saved posts stand

      setRunning(false);
      // Surface the merged draft honesty regardless of how the run ended: posts from
      // a degraded draft are already scheduled, so the flag matters even mid-failure.
      const mergedMeta = mergeDraftMetas(metas);
      if (mergedMeta) {
        setBatchHealth({
          meta: mergedMeta,
          flagged: metas.filter((m) => m && (m.degraded || m.languageMismatch)).length,
          total: topics.length,
        });
      }

      // Coherent partial state: keep exactly the lines whose topic did NOT fully
      // persist (plus the over-cap tail), so a retry cannot double-schedule whole
      // topics that already landed — regardless of the order workers finished in.
      const succeeded = new Set(outcome.succeeded);
      const remaining = allLines.filter((_, idx) => idx >= topics.length || !succeeded.has(idx));

      if (outcome.failed) {
        const firstError = outcome.errors.find((e) => e !== null);
        setError(firstError instanceof PlanError ? firstError.message : t("genFailed"));
        if (succeeded.size > 0) {
          const kept = t("partialKept", { done: succeeded.size, total: topics.length });
          setError((prev) => (prev ? `${prev} ${kept}` : kept));
        }
      } else {
        // A green run can still yield fewer posts than promised if a draft omitted
        // a platform — reconcile posts created against topics × networks.
        const promised = topics.length * platforms.length;
        if (savedCount < promised) {
          setError(t("partialPosts", { saved: savedCount, promised }));
        }
      }
      return remaining;
    },
    [t]
  );

  return { running, progress, error, batchHealth, planWeek };
}
