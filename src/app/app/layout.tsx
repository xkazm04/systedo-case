/** Auth gate for the whole authed product surface. The product is per-user, so
 *  anonymous visitors get a sign-in screen instead of the workspace. Uses a
 *  server-side session check (the Firestore session strategy can't be read at the
 *  edge, so gating here rather than in middleware). The marketing chrome is hidden
 *  on /app by ChromeGate, so this renders inside a clean full-height main. */
import type { Metadata } from "next";
import { auth } from "@/auth";
import AppSignInGate from "@/components/app/AppSignInGate";

export const metadata: Metadata = {
  title: "Pracovní prostor",
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) return <AppSignInGate />;
  return <>{children}</>;
}
