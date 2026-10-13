/** Rooms own a URL hash (#station-1..3, #lamp-1..8), so browser Back closes
 *  an open room and a room can be linked to. This is the one store every room,
 *  opener and back button reads (fixes the contest variant's known limit:
 *  "Browser Back does not close rooms").
 *
 *  Opening assigns location.hash, which pushes a history entry with a null
 *  state; Next's app router ignores a popstate whose state is null and
 *  restores its own entry on the way back, so the route is never re-fetched.
 *  Swapping lamp rooms replaces the entry, so one Back always returns to the
 *  page whichever room the visitor ended up in. */
import { useSyncExternalStore } from "react";

const ROOM_RE = /^#(station-[1-3]|lamp-[1-8])$/;
const listeners = new Set<() => void>();
let pushedHere = false;
let opener: HTMLElement | null = null;

function read(): string {
  const m = ROOM_RE.exec(window.location.hash);
  return m ? m[1] : "";
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("hashchange", l);
  return () => {
    listeners.delete(l);
    window.removeEventListener("hashchange", l);
  };
}

/** The open room's key ("station-2", "lamp-5") or "" when none is open. */
export function useRoom(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}

export function openRoom(key: string) {
  if (read()) return;
  const active = document.activeElement;
  opener = active instanceof HTMLElement ? active : null;
  pushedHere = true;
  window.location.hash = key;
}

/** Close the open room: step back over the entry we pushed, or, when the page
 *  was loaded straight into a room, drop the hash in place. */
export function closeRoom() {
  if (!read()) return;
  if (pushedHere) {
    pushedHere = false;
    window.history.back();
  } else {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    emit();
  }
}

/** Move to a sibling room without adding a history entry. */
export function swapRoom(key: string) {
  window.history.replaceState(window.history.state, "", `#${key}`);
  emit();
}

/** The element that opened the current room, for returning focus on close. */
export function takeOpener(): HTMLElement | null {
  const o = opener;
  opener = null;
  return o;
}
