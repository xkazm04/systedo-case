"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { PublicByomConfig } from "@/lib/llm/keys/types";

/** Shared BYOM config source of truth for the AI-settings page. Both the keys
 *  editor (ByomKeys) and the operations matrix (ByomMatrix) render `/api/byom` and
 *  used to each fetch it independently — two round-trips for one page, and two
 *  copies of loading/error handling that drifted (the matrix kept saying "connect a
 *  key first" right after you connected one, because its own state hadn't been
 *  refetched). This module-level store fetches once, exposes an explicit
 *  loading/error/ready status so the UI can show a skeleton and a retry instead of a
 *  blank `return null`, and lets a mutation in one section patch the config for the
 *  other so the two stay consistent without a reload. Client-only. */

export type ByomState = { entitled: boolean; config: PublicByomConfig };
export type ByomStatus = "loading" | "error" | "ready";

interface Store {
  status: ByomStatus;
  data: ByomState | null;
}

let store: Store = { status: "loading", data: null };
const listeners = new Set<() => void>();
let fetchStarted = false;

function emit() {
  for (const l of listeners) l();
}

function set(next: Store) {
  store = next;
  emit();
}

async function load() {
  fetchStarted = true;
  set({ status: "loading", data: store.data });
  try {
    const res = await fetch("/api/byom");
    if (!res.ok) return set({ status: "error", data: null });
    const json = (await res.json()) as { entitled?: boolean; config?: PublicByomConfig };
    if (!json.config) return set({ status: "error", data: null });
    set({ status: "ready", data: { entitled: Boolean(json.entitled), config: json.config } });
  } catch {
    set({ status: "error", data: null });
  }
}

/** Replace the shared config after a mutation so every subscriber (keys + matrix)
 *  reflects it immediately — e.g. the matrix's configured-vendor list updates the
 *  moment a key is connected in the keys section. */
export function patchByomConfig(config: PublicByomConfig) {
  if (store.data) set({ status: "ready", data: { ...store.data, config } });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  if (!fetchStarted) void load();
  return () => {
    listeners.delete(cb);
    // No subscribers left → let the next visit refetch fresh config.
    if (listeners.size === 0) fetchStarted = false;
  };
};

const getSnapshot = () => store;

export interface UseByomConfig {
  status: ByomStatus;
  state: ByomState | null;
  /** patch the shared config (after a successful mutation) */
  patch: (config: PublicByomConfig) => void;
  /** re-fetch after an error */
  retry: () => void;
}

export function useByomConfig(): UseByomConfig {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Recover a store left in "error" by a previous visit: retry on mount.
  useEffect(() => {
    if (store.status === "error") void load();
  }, []);
  const retry = useCallback(() => void load(), []);
  return { status: snap.status, state: snap.data, patch: patchByomConfig, retry };
}
