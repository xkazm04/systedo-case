import type { Metadata } from "next";
import { Suspense } from "react";
import SkenHero from "@/components/marketing/sken/SkenHero";
import SkenClient from "@/components/marketing/sken/SkenClient";
import VisibilityPlanBand from "@/components/marketing/kanaly/VisibilityPlanBand";
import { recordPageView } from "@/lib/analytics/track";
import { SKEN_ROUTE } from "@/lib/analytics/funnel";
import { isClaimToken } from "@/lib/onboarding/claim-token";
import { SELF_HOSTED } from "@/lib/deploy-mode";
import { getT } from "@/lib/i18n/server";

/** /sken — the public, no-account website scan (WP W2-B).
 *
 *  A visitor types their own address, gets a real read of their business plus a
 *  first channel plan, and can keep it: signing in turns the scan into a seeded
 *  project instead of an empty workspace. It is the one surface where the product
 *  proves itself before asking for anything — the sign-in gate at /app asks first.
 *
 *  Request-time by construction (the surface awaits `searchParams` to pick up the
 *  `?claim=` token the sign-in redirect brings back), so `recordPageView` counts
 *  visitors rather than builds. No `export const dynamic` — the dynamic read sits
 *  inside a Suspense boundary, which is what Cache Components asks for. */
const T = {
  cs: {
    metaTitle: "Sken webu zdarma – co o vás web říká a kde získat viditelnost",
    metaDescription:
      "Zadejte adresu webu a během chvíle dostanete profil firmy (co prodáváte, komu, jakým tónem), klíčová slova, konkurenty a orientační plán bezplatných kanálů. Bez registrace.",
  },
  en: {
    metaTitle: "Free website scan – what your site says and where to get seen",
    metaDescription:
      "Enter a web address and get a business profile (what you sell, to whom, in what voice), keywords, competitors and an indicative plan of free channels. No sign-up.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(T);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: SKEN_ROUTE },
  };
}

export default function SkenPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string | string[] }>;
}) {
  return (
    <>
      <SkenHero />
      <Suspense fallback={null}>
        <SkenSurface searchParams={searchParams} />
      </Suspense>
      <VisibilityPlanBand />
    </>
  );
}

async function SkenSurface({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string | string[] }>;
}) {
  const { claim } = await searchParams;
  // First-party page-view counter (route + UTC day only, no IP/UA/session) — the
  // denominator of the /sken funnel. This component is request-time (it awaits
  // searchParams), so the count is per visitor render. Best-effort inside.
  await recordPageView(SKEN_ROUTE);

  // The token comes back on the sign-in `callbackUrl`. Shape-checked here so a
  // junk query string never reaches the redeem route (or the client's state).
  const raw = Array.isArray(claim) ? claim[0] : claim;
  return <SkenClient claimToken={isClaimToken(raw) ? raw : undefined} selfHosted={SELF_HOSTED} />;
}
