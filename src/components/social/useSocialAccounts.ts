"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { SocialAccount } from "@/lib/social/types";

/** Shared connected-accounts source for the social center. AccountsBar owns the
 *  connect/disconnect UI, but WeekPlanner and PostsList also need the answer to
 *  "will a scheduled post ever publish?" — the cron only walks users returned by
 *  listConnectedSocialUserIds, so with zero connected accounts a `scheduled` post
 *  sits forever. Instead of three independent fetches of `/api/social/accounts`
 *  (or a silent prop drill), this module-level store fetches once per page visit
 *  and lets the AccountsBar mutation patch it for every subscriber — the same
 *  pattern as components/hooks/useByomConfig. Client-only. */

export type SocialAccountsStatus = "loading" | "error" | "ready";

interface Store {
  status: SocialAccountsStatus;
  configured: boolean;
  accounts: SocialAccount[];
}

let store: Store = { status: "loading", configured: false, accounts: [] };
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
  set({ ...store, status: "loading" });
  try {
    const res = await fetch("/api/social/accounts");
    if (!res.ok) return set({ status: "error", configured: false, accounts: [] });
    const json = (await res.json()) as { configured?: boolean; accounts?: SocialAccount[] };
    set({ status: "ready", configured: Boolean(json.configured), accounts: json.accounts ?? [] });
  } catch {
    set({ status: "error", configured: false, accounts: [] });
  }
}

/** Replace the shared account list after a connect/disconnect mutation so every
 *  subscriber (the bar, the planner's warning, the list's warning) reflects it
 *  immediately. */
export function patchSocialAccounts(accounts: SocialAccount[]) {
  set({ ...store, status: "ready", accounts });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  if (!fetchStarted) void load();
  return () => {
    listeners.delete(cb);
    // No subscribers left → let the next visit refetch fresh accounts.
    if (listeners.size === 0) fetchStarted = false;
  };
};

const getSnapshot = () => store;

export interface UseSocialAccounts {
  status: SocialAccountsStatus;
  /** whether real publishing credentials are configured server-side */
  configured: boolean;
  accounts: SocialAccount[];
  /** patch the shared list after a successful connect/disconnect */
  patch: (accounts: SocialAccount[]) => void;
  /** re-fetch (after an error, or after sign-in) */
  reload: () => void;
}

export function useSocialAccounts(): UseSocialAccounts {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const reload = useCallback(() => void load(), []);
  return {
    status: snap.status,
    configured: snap.configured,
    accounts: snap.accounts,
    patch: patchSocialAccounts,
    reload,
  };
}
