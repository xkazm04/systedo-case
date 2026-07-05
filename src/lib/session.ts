/** Request-scoped session accessors. React's `cache()` memoizes for the lifetime
 *  of a single server request, so the /app auth gate, the project layout, the
 *  module guard, and the page all share ONE session read (and one derived user id)
 *  instead of each hitting the Firestore session store on the same navigation.
 *
 *  This is request memoization only — never a cross-request cache — so per-user
 *  data stays fresh and nothing personal leaks into a prefetched shell. Callers
 *  must still invoke these inside a <Suspense> boundary (or after connection()),
 *  exactly as they did with `auth()` directly. Server-only. */
import "server-only";
import { cache } from "react";
import { auth } from "@/auth";

/** The signed-in session for this request, or null. Deduped across call sites. */
export const currentSession = cache(async () => auth());

/** The signed-in user's id for this request, or null. Deduped across call sites. */
export const currentUserId = cache(async (): Promise<string | null> => {
  const session = await currentSession();
  return ((session?.user as { id?: string } | undefined)?.id) ?? null;
});
