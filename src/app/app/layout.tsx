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
import { SELF_HOSTED } from "@/lib/deploy-mode";
import { recordPageView } from "@/lib/analytics/track";
import { GATE_ROUTE } from "@/lib/analytics/funnel";
import AppSignInGate from "@/components/app/AppSignInGate";

export const metadata: Metadata = {
  title: "Pracovní prostor",
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // The prerendered static shell IS this fallback under Cache Components, so a
    // `null` here is a white flash on every cold entry to the authed surface. Match
    // the sibling /app/page.tsx pattern: a `role="status"` shell that announces
    // "loading" to assistive tech instead of dead silence.
    <Suspense
      fallback={
        <div
          role="status"
          className="animate-loading-reveal flex min-h-[55vh] items-center justify-center"
          aria-busy="true"
        >
          <span className="sr-only">Načítání… · Loading…</span>
        </div>
      }
    >
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

async function AuthGate({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session?.user) {
    // First-party funnel: one anonymous "sign-in wall rendered" counter (route +
    // UTC day only — no IP/UA/session). This render is request-time by nature
    // (it just read the session), so the count is per visitor hit, not per build.
    // Best-effort inside; a store hiccup never breaks the gate.
    await recordPageView(GATE_ROUTE);
    // Deploy mode is server-only env; the client gate gets it as a prop so a
    // self-hosted install offers the operator-password flow, not Google.
    return <AppSignInGate selfHosted={SELF_HOSTED} />;
  }
  return <>{children}</>;
}
