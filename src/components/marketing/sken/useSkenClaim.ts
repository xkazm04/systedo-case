"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { OnboardingScanResult } from "@/lib/ai-types";

/** The claim lifecycle of the public scan, in one hook — because it is a state
 *  machine that spans a full page unload and back, and inlining it in the view
 *  would hide exactly the transition that can go wrong.
 *
 *  The trip:
 *    1. `claim(scan, url)` POSTs the result to /api/sken/claim, which parks it under
 *       a token and returns it. Nothing is created yet and nobody is signed in.
 *    2. We hand that token to `signIn` as part of the callbackUrl, and the browser
 *       leaves. Every scrap of client state dies here — the token in the URL IS the
 *       continuity.
 *    3. We come back at /sken?claim=<token> and POST it to /api/sken/redeem, which
 *       (now with a session) creates and seeds the project and answers with its id.
 *
 *  The states that are NOT success are the point of the hook:
 *   - `needs-signin` — we returned with a token but no session (the user cancelled
 *     the provider, or the cookie did not stick). The token is still good, so the
 *     offer is "sign in again", not "start over".
 *   - `expired` — the token is unknown, spent or older than its TTL. Honest dead
 *     end: the scan is gone, run it again.
 *  Both are recoverable and both are stated; neither silently drops the visitor on
 *  an empty page. */
export type SkenClaimPhase = "idle" | "claiming" | "redeeming" | "needs-signin" | "expired" | "failed";

const callbackFor = (token: string) => `/sken?claim=${encodeURIComponent(token)}`;

export function useSkenClaim(opts: { claimToken?: string; selfHosted?: boolean }) {
  const { claimToken, selfHosted = false } = opts;
  const router = useRouter();
  const [phase, setPhase] = useState<SkenClaimPhase>(claimToken ? "redeeming" : "idle");
  /** The token we are mid-flight with, so a `needs-signin` retry re-uses it rather
   *  than asking the visitor to scan again. */
  const [pendingToken, setPendingToken] = useState<string | undefined>(claimToken);

  const startSignIn = useCallback(
    (token: string) => {
      // Mirrors AppSignInGate: a self-hosted install has no Google provider, so
      // `signIn()` with no provider routes to Auth.js's own page (the operator
      // Credentials form). Same callbackUrl either way.
      const callbackUrl = callbackFor(token);
      if (selfHosted) void signIn(undefined, { callbackUrl });
      else void signIn("google", { callbackUrl });
    },
    [selfHosted]
  );

  /** Park the scan, then leave for the provider. */
  const claim = useCallback(
    async (scan: OnboardingScanResult, scannedUrl: string) => {
      setPhase("claiming");
      try {
        const res = await fetch("/api/sken/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scan, scannedUrl }),
        });
        const json = (await res.json().catch(() => null)) as { token?: string } | null;
        if (!res.ok || typeof json?.token !== "string") {
          setPhase("failed");
          return;
        }
        setPendingToken(json.token);
        startSignIn(json.token);
      } catch {
        setPhase("failed");
      }
    },
    [startSignIn]
  );

  /** Retry the sign-in leg with the token we already hold. */
  const retrySignIn = useCallback(() => {
    if (pendingToken) startSignIn(pendingToken);
  }, [pendingToken, startSignIn]);

  // The return leg. Guarded by a ref so React's development double-invoke (and any
  // re-render) cannot POST the same single-use token twice — the second POST would
  // 404 by design and turn a successful claim into an "expired" screen.
  const redeemedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!claimToken || redeemedRef.current === claimToken) return;
    redeemedRef.current = claimToken;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/sken/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: claimToken }),
        });
        if (!alive) return;
        if (res.status === 401) {
          setPhase("needs-signin");
          return;
        }
        const json = (await res.json().catch(() => null)) as { projectId?: string } | null;
        if (!res.ok || typeof json?.projectId !== "string") {
          setPhase(res.status === 404 ? "expired" : "failed");
          return;
        }
        router.replace(`/app/${json.projectId}/start`);
      } catch {
        if (alive) setPhase("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [claimToken, router]);

  return { phase, claim, retrySignIn };
}
