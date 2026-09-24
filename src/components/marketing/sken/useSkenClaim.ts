"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { OnboardingScanResult } from "@/lib/ai-types";
import type { RedeemCandidate } from "@/lib/onboarding/redeem-plan";
import { claimNextStep, phaseForRedeemResponse, type SkenClaimPhase } from "./claim-phase";

export type { SkenClaimPhase };

/** The claim lifecycle of the public scan, in one hook — because it is a state
 *  machine that spans a full page unload and back, and inlining it in the view
 *  would hide exactly the transition that can go wrong.
 *
 *  The trip:
 *    1. `claim(scan, url)` POSTs the result to /api/sken/claim, which parks it under
 *       a token and returns it. Nothing is created yet.
 *    2. We try the redeem right away. A visitor who is already signed in is done
 *       here, without leaving the page; an anonymous one gets a 401 (which never
 *       spends the token) and only THEN do we hand the token to `signIn` as part of
 *       the callbackUrl. Every scrap of client state dies on that trip — the token in
 *       the URL IS the continuity.
 *    3. We come back at /sken?claim=<token> and POST it to /api/sken/redeem again.
 *    Every redeem sends `chooser: true`: when the caller already owns a project for
 *    the scanned site the answer is `choosing` (token unspent), and `choose(target)`
 *    re-POSTs with the project id or "new".
 *
 *  What each answer means lives in claim-phase.ts (pure, tested); the states that
 *  are NOT success are stated there, and none silently drops the visitor. */

const callbackFor = (token: string) => `/sken?claim=${encodeURIComponent(token)}`;

export function useSkenClaim(opts: { claimToken?: string; selfHosted?: boolean }) {
  const { claimToken, selfHosted = false } = opts;
  const router = useRouter();
  const [phase, setPhase] = useState<SkenClaimPhase>(claimToken ? "redeeming" : "idle");
  /** The token we are mid-flight with, so a `needs-signin` retry re-uses it rather
   *  than asking the visitor to scan again. */
  const [pendingToken, setPendingToken] = useState<string | undefined>(claimToken);
  const [candidates, setCandidates] = useState<RedeemCandidate[]>([]);

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

  /** POST the token to the redeem door and route on the answer (claim-phase.ts).
   *  `alive` lets the mount effect drop a response that lands after unmount;
   *  `onUnauthed` lets the claim leg turn a 401 into the sign-in trip. */
  const redeem = useCallback(
    async (token: string, o: { target?: string; alive?: () => boolean; onUnauthed?: () => void } = {}) => {
      const alive = o.alive ?? (() => true);
      try {
        const res = await fetch("/api/sken/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, chooser: true, ...(o.target ? { target: o.target } : {}) }),
        });
        if (!alive()) return;
        if (o.onUnauthed && claimNextStep(res.status) === "sign-in") return o.onUnauthed();
        const verdict = phaseForRedeemResponse(res.status, await res.json().catch(() => null));
        if (!alive()) return;
        if (verdict.phase === "done") return router.replace(verdict.href);
        if (verdict.phase === "choosing") setCandidates(verdict.candidates);
        setPhase(verdict.phase);
      } catch {
        if (alive()) setPhase("failed");
      }
    },
    [router]
  );

  /** Park the scan, then try the redeem; leave for the provider only on a 401. */
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
        const token = json.token;
        setPendingToken(token);
        await redeem(token, { onUnauthed: () => startSignIn(token) });
      } catch {
        setPhase("failed");
      }
    },
    [redeem, startSignIn]
  );

  /** Retry the sign-in leg with the token we already hold. */
  const retrySignIn = useCallback(() => {
    if (pendingToken) startSignIn(pendingToken);
  }, [pendingToken, startSignIn]);

  /** Answer the chooser: a project id merges into it, "new" creates one. */
  const choose = useCallback(
    (target: string) => {
      if (!pendingToken) return;
      setPhase("redeeming");
      void redeem(pendingToken, { target });
    },
    [pendingToken, redeem]
  );

  /** Re-POST the same token after a 503 — the server put the claim back. */
  const retryRedeem = useCallback(() => {
    if (!pendingToken) return;
    setPhase("redeeming");
    void redeem(pendingToken);
  }, [pendingToken, redeem]);

  // The return leg. Guarded by a ref so React's development double-invoke (and any
  // re-render) cannot POST the same single-use token twice — the second POST would
  // 404 by design and turn a successful claim into an "expired" screen.
  const redeemedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!claimToken || redeemedRef.current === claimToken) return;
    redeemedRef.current = claimToken;
    let alive = true;
    void redeem(claimToken, { alive: () => alive });
    return () => {
      alive = false;
    };
  }, [claimToken, redeem]);

  return { phase, candidates, claim, choose, retrySignIn, retryRedeem };
}
