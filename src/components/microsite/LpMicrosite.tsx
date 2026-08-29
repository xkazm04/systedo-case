/** W3-B — the `lp` microsite body: ONE arm of a landing-page experiment, chosen per
 *  request, at the experiment's single public address.
 *
 *  HOW THE MEASUREMENT WORKS, AND WHAT IT DOES NOT CLAIM. Every request draws an arm
 *  uniformly (`pickArm`) and counts one VIEW for it; the drawn arm's id is rendered
 *  into the CTA, so the conversion beacon reports the arm that was actually on screen.
 *  Each view is therefore its own trial, and each arm's conversion rate is the rate of
 *  the pages it really served — which is exactly what `evaluate()` reads.
 *
 *  There is NO stickiness and no cookie, because this product sets no measurement
 *  cookie anywhere (`analytics/track.ts`, `go/[id]/route.ts`) and adding one here to
 *  buy per-person consistency would be a bigger change to what we store about
 *  visitors than the measurement is worth. The honest consequence — a returning
 *  visitor may see a different arm — is stated on the page itself, not only in this
 *  comment.
 *
 *  The page is NOINDEX (see the route's metadata) and it prints no numbers: an
 *  experiment page that showed its own score would stop producing independent trials,
 *  and an address that accumulates search identity for six weeks and then disappears
 *  when the test ends is the opposite of what a local landing page is for.
 *
 *  Server component. The only client code is the CTA (see LpCtaLink). */
import { headers } from "next/headers";
import { Container } from "@/components/ui";
import type { LpPagePayload, MicrositeConfig } from "@/lib/microsite";
import { pickArm } from "@/lib/lp-exp/serve";
import { lpUtcDay } from "@/lib/lp-exp/counts";
import { bumpLpCount } from "@/lib/lp-exp/counts-store";
import { isBotUserAgent } from "@/lib/organic-channels/outcomes";
import { getT } from "@/lib/i18n/server";
import LpCtaLink from "./LpCtaLink";

const T = {
  cs: {
    splitNote:
      "Tato stránka je součástí A/B testu. Zobrazuje se náhodně vybraná varianta, takže při další návštěvě můžete vidět jinou. Neukládáme k tomu žádné cookies ani údaje o návštěvníkovi — počítá se jen zobrazení a akce.",
    ctaFallback: "Mám zájem",
  },
  en: {
    splitNote:
      "This page is part of an A/B test. A randomly chosen variant is shown, so a later visit may show a different one. No cookies and no visitor data are stored for it — only views and actions are counted.",
    ctaFallback: "I'm interested",
  },
} as const;

export default async function LpMicrosite({
  config,
  lp,
}: {
  config: MicrositeConfig;
  lp: LpPagePayload;
}) {
  const t = await getT(T);
  const accent = config.accentColor || "var(--color-brand-600)";

  // The draw. `pickArm` is uniform and injectable-RNG pure; production passes the
  // default Math.random. A payload that somehow reached here with no arms renders the
  // shell rather than throwing — the publish path refuses to create one.
  const arm = pickArm(lp.arms);
  if (!arm) return null;

  // The UA is READ (never stored) for exactly one decision — is this an automated
  // fetcher? A link unfurler hitting the URL the moment it is pasted into Slack would
  // otherwise register as a view for whichever arm it happened to draw, and a
  // measurement whose first data points are robots is worse than no measurement. The
  // same coarse test the `/go/{id}` redirect uses, for the same reason.
  const ua = (await headers()).get("user-agent");
  if (!isBotUserAgent(ua)) {
    // Fire-and-forget: `void` on purpose. The page is the contract; the count is
    // bookkeeping, and awaiting it would put the store's latency in front of every
    // visitor and its failures in front of the tenant's audience.
    void bumpLpCount(lp.experimentId, arm.armId, lpUtcDay(new Date()), "views", lp.projectId).catch(
      () => {
        /* a lost view is a smaller failure than a page that does not render */
      }
    );
  }

  const ctaLabel = arm.cta || t("ctaFallback");

  return (
    <>
      <div style={{ backgroundColor: accent }} className="h-1.5 w-full" aria-hidden />

      <Container className="py-12 sm:py-16">
        <header className="border-b border-line pb-8">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: accent }}>
            {config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={config.logoUrl}
                alt={config.brandName}
                className="h-8 w-auto max-w-[140px] object-contain"
              />
            )}
            {config.brandName}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
            {arm.headline}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">{arm.intro}</p>

          {lp.target && (
            <p className="mt-6">
              <LpCtaLink
                armId={arm.armId}
                convertPath={`/m/${config.slug}/convert`}
                target={lp.target}
                label={ctaLabel}
                accent={accent}
              />
            </p>
          )}
        </header>

        {arm.bullets.length > 0 && (
          <ul className="mt-8 max-w-2xl space-y-3">
            {arm.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-navy-700">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accent }}
                  aria-hidden
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {/* The CTA without an operator target is a sentence, not a link — there is
            nowhere to send anyone, and inventing a destination is the same
            fabrication the local landing page refuses to make. */}
        {!lp.target && arm.cta && (
          <p className="mt-8 max-w-2xl rounded-lg bg-canvas px-4 py-3 text-sm font-medium text-navy-800">
            {arm.cta}
          </p>
        )}

        {/* Disclosure, not fine print: the visitor is in a randomised test and we say
            so, together with what is (and is not) recorded about them. */}
        <p className="mt-12 max-w-2xl border-t border-line pt-4 text-xs leading-relaxed text-muted">
          {t("splitNote")}
        </p>
      </Container>
    </>
  );
}
