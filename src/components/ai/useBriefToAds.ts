"use client";

/** The brief → ads handoff, in ONE place.
 *
 *  ContentBriefGenerator has always offered `onCreateAds` — it maps the finished
 *  brief onto an AdRequest through the single `briefToAdSeed` bridge and hands it
 *  up. But only the standalone /ai-asistent surface ever passed the prop, so the
 *  project's own Tvorba (ContentEngine) — the surface the context map calls the
 *  unified home for "articles, social copy, ads" — could not take a maker from
 *  brief to ad without leaving their project.
 *
 *  Both mount points now consume THIS hook, so the two cannot drift into two
 *  different handoffs: it owns the seed, the remount nonce (AdGenerator prefills
 *  through a lazy initializer, so a repeat handoff only applies when the component
 *  is re-keyed) and the callback itself. What each surface does differently — the
 *  assistant switches tab, the module opens a modal — is the single `onHandoff`
 *  argument, which is the only part that legitimately differs.
 *
 *  No new AI operation and no second bridge: the mapping stays in
 *  lib/ai/handoff.ts `briefToAdSeed`, called at ContentBriefGenerator's one call
 *  site. */
import { useCallback, useState } from "react";
import type { AdRequest } from "@/lib/ai-types";

export interface BriefToAdsHandoff {
  /** the seed to hand to AdGenerator (null before the first handoff) */
  seed: Partial<AdRequest> | null;
  /** bump per handoff — use as AdGenerator's `key` so a fresh seed prefills */
  nonce: number;
  /** pass verbatim as ContentBriefGenerator's `onCreateAds` */
  onCreateAds: (seed: Partial<AdRequest>) => void;
}

/** @param onHandoff surface-specific reveal of the ad generator (switch tab, open
 *  the modal) — fired after the seed is stored. */
export function useBriefToAdsHandoff(onHandoff?: () => void): BriefToAdsHandoff {
  const [seed, setSeed] = useState<Partial<AdRequest> | null>(null);
  const [nonce, setNonce] = useState(0);

  const onCreateAds = useCallback(
    (next: Partial<AdRequest>) => {
      setSeed(next);
      setNonce((n) => n + 1);
      onHandoff?.();
    },
    [onHandoff]
  );

  return { seed, nonce, onCreateAds };
}
