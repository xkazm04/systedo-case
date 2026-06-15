"use client";

import { SessionProvider } from "next-auth/react";

/** Client session context so header / page components can read the auth state.
 *  Wraps the whole app in the root layout. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
