/** The client's side of the social write chokepoint: one function that POSTs a
 *  scheduled post to `/api/social/posts` and classifies what came back.
 *
 *  Three surfaces schedule through that route (the week planner, the content-plan
 *  board's hand-off, the Distribuce variant card) and each had its own hand-rolled
 *  fetch + `!res.ok` branch. That was survivable while the only failure was "it
 *  didn't work"; it stops being survivable now that one specific failure — the
 *  409 cadence refusal — has to be told apart from every other one and answered
 *  with an override, because a surface that misses the distinction renders the
 *  machine string "cadence-exceeded" at a human.
 *
 *  ABORTS ARE RE-THROWN, NOT CLASSIFIED. An aborted request has no outcome: the
 *  caller unmounted, and turning that into an `error` would make a navigation look
 *  like a failed schedule. Client-safe (no server imports). */
import type { SocialPlatform } from "@/lib/social/types";
import { parseCadenceRefusal, type CadenceRefusal } from "./refusal";

export interface SchedulePostInput {
  platform: SocialPlatform;
  content: string;
  /** ISO instant the channel should send it */
  scheduledAt: string;
  projectId?: string;
  /** The operator's explicit answer to a cadence refusal — re-posts the identical
   *  request past their own weekly cap, and the server records the exception. Never
   *  set by inference: only a human click may put it here. */
  overrideCadence?: boolean;
  signal?: AbortSignal;
}

export interface ScheduleOutcome {
  ok: boolean;
  /** the created post, when `ok` */
  post: { id?: string; scheduledAt?: string } | null;
  /** set when the write was refused by the channel's weekly cadence cap */
  refusal: CadenceRefusal | null;
  /** the parsed response body — callers that already had their own error copy
   *  keep reading `error` off it exactly as they did before */
  body: unknown;
  /** the server's human-readable failure, when it was any OTHER failure */
  error: string | null;
}

export async function schedulePost(input: SchedulePostInput): Promise<ScheduleOutcome> {
  const { signal, ...fields } = input;
  const res = await fetch("/api/social/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
    ...(signal ? { signal } : {}),
  });
  const body = await res.json().catch(() => null);
  const refusal = parseCadenceRefusal(res.status, body);
  const post = (body as { post?: { id?: string; scheduledAt?: string } } | null)?.post ?? null;
  return {
    ok: res.ok && Boolean(post?.id),
    post,
    refusal,
    body,
    // null when there is nothing the SERVER said — the caller then falls back to
    // its own copy, exactly as it did before this function existed.
    error: res.ok || refusal ? null : ((body as { error?: string } | null)?.error ?? null),
  };
}

/** Re-post every request the weekly cap refused, WITH the operator's override —
 *  the one action behind "Naplánovat i tak" on a batch run.
 *
 *  Sequential on purpose: these are the posts a cap already said no to, so firing
 *  them in parallel at the very route that is rate-limited per user is the wrong
 *  shape. Best-effort per post (a later failure does not undo an earlier success),
 *  then one refresh event so the calendar and the posts list re-read what landed. */
export async function overrideRefused(requests: SchedulePostInput[]): Promise<void> {
  for (const req of requests) {
    await schedulePost({ ...req, overrideCadence: true }).catch(() => null);
  }
  window.dispatchEvent(new CustomEvent("social:posts-changed"));
}
