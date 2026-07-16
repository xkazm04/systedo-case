"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useSession } from "next-auth/react";

export interface AuthedResource<T> {
  /** the last successfully-loaded value (or the initial value before the first
   *  load settles) */
  data: T;
  /** local updater for optimistic mutations that change the resource WITHOUT a
   *  re-fetch (mark-all-read, connect / disconnect) */
  setData: Dispatch<SetStateAction<T>>;
  /** false once the first authed load has settled (success OR failure); stays
   *  true while unauthenticated or before that first settle — the gate a panel
   *  like ControlPlane renders `null` behind until its data exists */
  loading: boolean;
  /** re-run the fetch (after a mutation, or exposed as a manual refresh). Same
   *  no-op-on-failure semantics as the mount load. */
  reload: () => Promise<void>;
}

/** Auth-gated fetch-on-mount for the signed-in-only campaign panels. Collapses
 *  the copy-pasted `load` useCallback + `if (status === "authenticated") void
 *  load()` effect that ControlPlane, AlertsInbox, ActivityFeed and
 *  SklikConnectCard each hand-rolled (each with its own
 *  eslint-disable react-hooks/set-state-in-effect — now justified once, here).
 *
 *  The `fetcher` owns the request + response parsing and returns the next value,
 *  or `undefined` to KEEP the current one — matching every panel's
 *  `if (!res.ok) return` and silent `catch` (a failed load never clears good
 *  data, and never surfaces an error on this non-critical chrome). Re-fetches
 *  whenever `refreshKey` changes; SklikConnectCard passes no key (its status
 *  only reloads when auth resolves).
 *
 *  Callers MUST wrap `fetcher` in their own useCallback (keyed on e.g. the
 *  project id) so this hook's effect stays stable and doesn't refetch on every
 *  render. */
export function useAuthedResource<T>(
  fetcher: () => Promise<T | undefined>,
  initial: T,
  refreshKey: number = 0
): AuthedResource<T> {
  const { status } = useSession();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const next = await fetcher();
      // undefined = "keep the current value" (a non-ok response or a thrown
      // fetch), exactly as the hand-rolled loads did.
      if (next !== undefined) setData(next);
    } catch {
      /* non-critical chrome — keep the current value */
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    // Reload when auth resolves or a refresh is requested (a sync minting alerts,
    // a proposal landing in the control plane). `reload` only sets state after
    // its awaited fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void reload();
  }, [status, reload, refreshKey]);

  return { data, setData, loading, reload };
}
