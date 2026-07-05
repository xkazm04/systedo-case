/** Auth gate for the whole authed product surface. The product is per-user, so
 *  anonymous visitors get a sign-in screen instead of the workspace. Uses a
 *  server-side session check (the Firestore session strategy can't be read at the
 *  edge, so gating here rather than in middleware). The marketing chrome is hidden
 *  on /app by ChromeGate, so this renders inside a clean full-height main.
 *
 *  Under Cache Components the session read (cookies) must sit inside a <Suspense>
 *  boundary so the layout itself can prerender a static shell; the gate streams in
 *  once auth resolves. */
import { Suspense } from "react";
import type { Metadata } from "next";
import { currentSession } from "@/lib/session";
import AppSignInGate from "@/components/app/AppSignInGate";

export const metadata: Metadata = {
  title: "Pracovní prostor",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

async function AuthGate({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session?.user) return <AppSignInGate />;
  return <>{children}</>;
}
