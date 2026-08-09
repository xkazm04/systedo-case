"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SocialPost } from "@/lib/social/types";

/** Shared per-project data sources for the social center. The screen used to
 *  double-fetch: posts (PostsList + WeekPlanner) and brand-context (Composer +
 *  WeekPlanner) each ran their own fetch, coordinated only via window
 *  CustomEvents. These module-level stores (the useByomConfig pattern, keyed by
 *  projectId) fetch once per page visit and share the result with every
 *  subscriber. The `social:posts-changed` CustomEvent bus is KEPT as the
 *  invalidation signal — it is already dispatched by every mutator (Composer
 *  submit, planner batch, list delete) and stays the simplest correct sync — but
 *  it now triggers ONE refetch instead of one per listening component.
 *  Client-only. */

interface Entry<T> {
  /** immutable snapshot object — REPLACED on every change so useSyncExternalStore
   *  (which compares by identity) re-renders, and stable between changes so it
   *  doesn't loop. */
  snapshot: { data: T; loaded: boolean };
  listeners: Set<() => void>;
  started: boolean;
  /** detach the entry's window-event invalidation listener */
  detach?: () => void;
}

function makeStore<T>(opts: {
  empty: T;
  /** null → this pid has nothing to fetch (the entry stays empty, no request) */
  url: (pid: string | undefined) => string | null;
  parse: (json: unknown) => T;
  /** window events that invalidate the entry (one refetch for all subscribers) */
  invalidateOn?: string[];
}) {
  const entries = new Map<string, Entry<T>>();

  function entry(pid: string | undefined): Entry<T> {
    const key = pid ?? "";
    let e = entries.get(key);
    if (!e) {
      e = { snapshot: { data: opts.empty, loaded: false }, listeners: new Set(), started: false };
      entries.set(key, e);
    }
    return e;
  }

  async function load(pid: string | undefined) {
    const url = opts.url(pid);
    const e = entry(pid);
    e.started = true;
    if (url === null) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      e.snapshot = { data: opts.parse(await res.json()), loaded: true };
      for (const l of e.listeners) l();
    } catch {
      /* non-critical — consumers render their empty state */
    }
  }

  function subscribe(pid: string | undefined, cb: () => void) {
    const e = entry(pid);
    e.listeners.add(cb);
    if (!e.started) {
      void load(pid);
      if (opts.invalidateOn?.length && !e.detach) {
        const handler = () => void load(pid);
        for (const ev of opts.invalidateOn) window.addEventListener(ev, handler);
        e.detach = () => {
          for (const ev of opts.invalidateOn!) window.removeEventListener(ev, handler);
        };
      }
    }
    return () => {
      e.listeners.delete(cb);
      if (e.listeners.size === 0) {
        // Last subscriber gone → next visit refetches fresh data.
        e.started = false;
        e.detach?.();
        e.detach = undefined;
      }
    };
  }

  function useStore(pid: string | undefined): { data: T; loaded: boolean; refresh: () => void } {
    const sub = useCallback((cb: () => void) => subscribe(pid, cb), [pid]);
    const snap = useCallback(() => entry(pid).snapshot, [pid]);
    const s = useSyncExternalStore(sub, snap, snap);
    const refresh = useCallback(() => void load(pid), [pid]);
    return { data: s.data, loaded: s.loaded, refresh };
  }

  return { useStore };
}

// ── posts ─────────────────────────────────────────────────────────────────────

const postsStore = makeStore<SocialPost[]>({
  empty: [],
  url: (pid) => (pid ? `/api/social/posts?projectId=${encodeURIComponent(pid)}` : "/api/social/posts"),
  parse: (json) => (json as { posts?: SocialPost[] }).posts ?? [],
  invalidateOn: ["social:posts-changed"],
});

/** The project's social posts — one fetch shared by PostsList + WeekPlanner,
 *  refetched when any mutator dispatches `social:posts-changed`. */
export function useSocialPosts(pid: string | undefined): {
  posts: SocialPost[];
  /** false until the first fetch answered (renders the loading state honestly) */
  loaded: boolean;
  refresh: () => void;
} {
  const { data, loaded, refresh } = postsStore.useStore(pid);
  return { posts: data, loaded, refresh };
}

// ── auto-derived brand context ────────────────────────────────────────────────

const brandContextStore = makeStore<string>({
  empty: "",
  // No project → nothing to fetch; the entry stays "".
  url: (pid) => (pid ? `/api/projects/${encodeURIComponent(pid)}/brand-context` : null),
  parse: (json) => (json as { context?: string }).context ?? "",
});

/** The project's auto-derived catalogue voice — one fetch shared by Composer +
 *  WeekPlanner. Empty string for no project / empty catalogue / fetch failure. */
export function useBrandContext(pid: string | undefined): string {
  const { data } = brandContextStore.useStore(pid);
  return data;
}
