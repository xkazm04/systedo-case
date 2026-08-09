"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readSocialBrand, writeSocialBrand } from "@/lib/social/brand-storage";

/** The social center's brand-voice field, moved to the TENANT store. It used to
 *  live only in localStorage (per-browser), so the voice never followed the user
 *  across devices. It now persists per (user, project) under the registered
 *  `social-brand` project-state key, with a read-old-write-new migration: on
 *  first load, an empty server value seeded from a non-empty localStorage value
 *  is written back to the server, so an existing user's voice survives the move.
 *  localStorage stays the anonymous / no-project / offline fallback and is
 *  mirrored on every write (a failed network save never loses the text).
 *
 *  One module-level store per project (the useByomConfig pattern) — Composer
 *  edits it, WeekPlanner reads it, both see the same state instantly, which
 *  retires the `social:brand-changed` CustomEvent + storage-event glue. */

interface Entry {
  /** immutable — replaced on change (useSyncExternalStore identity contract) */
  snapshot: { brand: string; loaded: boolean };
  listeners: Set<() => void>;
  started: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();

function entry(pid: string | undefined): Entry {
  const key = pid ?? "";
  let e = entries.get(key);
  if (!e) {
    e = { snapshot: { brand: "", loaded: false }, listeners: new Set(), started: false, saveTimer: null };
    entries.set(key, e);
  }
  return e;
}

function emit(e: Entry) {
  for (const l of e.listeners) l();
}

function stateUrl(pid: string): string {
  return `/api/projects/${encodeURIComponent(pid)}/state/social-brand`;
}

async function load(pid: string | undefined) {
  const e = entry(pid);
  e.started = true;
  const local = readSocialBrand(pid);
  if (!pid) {
    // No project → localStorage is the only home (unchanged legacy behavior).
    e.snapshot = { brand: local, loaded: true };
    emit(e);
    return;
  }
  // Seed from localStorage immediately (no blank flash), then reconcile with the
  // server: a stored tenant value wins; an empty server + non-empty local value
  // migrates local → server (read-old-write-new).
  e.snapshot = { brand: local, loaded: false };
  emit(e);
  try {
    const res = await fetch(stateUrl(pid));
    if (res.ok) {
      const json = (await res.json()) as { data?: unknown };
      const server = typeof json.data === "string" ? json.data : "";
      if (server) {
        e.snapshot = { brand: server, loaded: true };
        writeSocialBrand(pid, server); // keep the offline mirror fresh
        emit(e);
        return;
      }
      if (local) {
        // Migration: the browser knows a voice the tenant store doesn't yet.
        void fetch(stateUrl(pid), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: local }),
        }).catch(() => {});
      }
    }
    // Server empty / unreachable / not owned (demo project, signed out) → the
    // local value stands.
    e.snapshot = { brand: local, loaded: true };
    emit(e);
  } catch {
    e.snapshot = { brand: local, loaded: true };
    emit(e);
  }
}

const SAVE_DEBOUNCE_MS = 800;

function setBrandValue(pid: string | undefined, value: string) {
  const e = entry(pid);
  e.snapshot = { brand: value, loaded: e.snapshot.loaded };
  emit(e);
  // Mirror to localStorage synchronously (offline / anonymous continuity)…
  writeSocialBrand(pid, value);
  // …and debounce the tenant-store write (a keystroke is not a network call).
  if (!pid) return;
  if (e.saveTimer) clearTimeout(e.saveTimer);
  e.saveTimer = setTimeout(() => {
    e.saveTimer = null;
    void fetch(stateUrl(pid), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: entry(pid).snapshot.brand }),
    }).catch(() => {});
  }, SAVE_DEBOUNCE_MS);
}

function subscribe(pid: string | undefined, cb: () => void) {
  const e = entry(pid);
  e.listeners.add(cb);
  if (!e.started) void load(pid);
  return () => {
    e.listeners.delete(cb);
    if (e.listeners.size === 0) e.started = false; // next visit reloads fresh
  };
}

export interface UseSocialBrand {
  /** the manual brand voice ("" when unset) */
  brand: string;
  /** true once the server reconcile (or the local-only read) finished */
  loaded: boolean;
  setBrand: (value: string) => void;
}

export function useSocialBrand(pid: string | undefined): UseSocialBrand {
  const sub = useCallback((cb: () => void) => subscribe(pid, cb), [pid]);
  const snap = useCallback(() => entry(pid).snapshot, [pid]);
  const s = useSyncExternalStore(sub, snap, snap);
  const setBrand = useCallback((value: string) => setBrandValue(pid, value), [pid]);
  return { brand: s.brand, loaded: s.loaded, setBrand };
}
