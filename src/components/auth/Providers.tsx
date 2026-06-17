"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

/** Client session context so header / page components can read the auth state.
 *  Wraps the whole app in the root layout.
 *
 *  `session` is normally undefined in production, so the provider fetches it from
 *  the NextAuth endpoint as usual. In dev-auth mode the server seeds it with the
 *  test-user session and we disable focus revalidation, so `useSession()` agrees
 *  with the server `auth()` instead of being reset to null by the (empty) real
 *  session endpoint. */
export default function Providers({
  children,
  session,
  devAuth = false,
}: {
  children: React.ReactNode;
  session?: Session | null;
  devAuth?: boolean;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={!devAuth}>
      {children}
    </SessionProvider>
  );
}
