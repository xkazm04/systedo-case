"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentType, SVGProps } from "react";
import { Check, Link, Share } from "@/components/icons";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    groupLabel: "Sdílet článek",
    shareLabel: "Sdílet",
    copyLabel: "Kopírovat odkaz na článek",
    copied: "Zkopírováno",
    copyBtn: "Odkaz",
    shareOnFacebook: "Sdílet na Facebooku",
    shareOnX: "Sdílet na X",
    shareOnLinkedIn: "Sdílet na LinkedInu",
    nativeShare: "Sdílet přes systém",
    nativeShareTitle: "Sdílet…",
    toast: "Odkaz zkopírován do schránky",
  },
  en: {
    groupLabel: "Share article",
    shareLabel: "Share",
    copyLabel: "Copy link to article",
    copied: "Copied",
    copyBtn: "Link",
    shareOnFacebook: "Share on Facebook",
    shareOnX: "Share on X",
    shareOnLinkedIn: "Share on LinkedIn",
    nativeShare: "Share via system",
    nativeShareTitle: "Share…",
    toast: "Link copied to clipboard",
  },
} as const;

/** Brand UTM tag so shares originating from the article are attributable in the
 *  dashboard's analytics story. Each channel keeps its own utm_source; the
 *  medium + campaign are the shared "brand tag". */
const UTM_MEDIUM = "social";
const UTM_CAMPAIGN = "clanek";

function withUtm(url: string, source: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", UTM_MEDIUM);
  u.searchParams.set("utm_campaign", UTM_CAMPAIGN);
  return u.toString();
}

/* Brand glyphs are filled logos, so they intentionally live here rather than in
 * the stroke-based shared icon set. */
type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

function Facebook(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07c0 6.02 4.39 11.02 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8v8.44C19.61 23.09 24 18.09 24 12.07z" />
    </svg>
  );
}

function XLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />
    </svg>
  );
}

function LinkedIn(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zm1.78 13.02H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

// navigator.share is client-only and mostly mobile. useSyncExternalStore reads
// it without a hydration mismatch (server snapshot is always false) and without
// a setState-in-effect. The capability is static for the session, so there's
// nothing to subscribe to.
const noopSubscribe = () => () => {};
function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false
  );
}

type SocialKey = "shareOnFacebook" | "shareOnX" | "shareOnLinkedIn";
const SOCIALS: { labelKey: SocialKey; source: string; icon: Glyph; href: (u: string) => string }[] = [
  {
    labelKey: "shareOnFacebook",
    source: "facebook",
    icon: Facebook,
    href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    labelKey: "shareOnX",
    source: "twitter",
    icon: XLogo,
    href: (u) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}`,
  },
  {
    labelKey: "shareOnLinkedIn",
    source: "linkedin",
    icon: LinkedIn,
    href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`,
  },
];

/** Share + copy-link affordance for the article, rendered in the byline row.
 *  Desktop gets a clipboard copy with a confirmation toast and per-network share
 *  links; mobile additionally surfaces the native Web Share sheet. Every link is
 *  stamped with a brand UTM tag so the dashboard can attribute the reach. */
export default function ShareBar({ url, title }: { url: string; title: string }) {
  const t = useT(T);
  const [copied, setCopied] = useState(false);
  const canNativeShare = useCanNativeShare();
  const timer = useRef<number | undefined>(undefined);

  // Clear any pending toast timer on unmount.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flashCopied = () => {
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  const copyLink = async () => {
    const link = withUtm(url, "copy");
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* clipboard unavailable — nothing more we can do */
      }
      document.body.removeChild(ta);
    }
    flashCopied();
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url: withUtm(url, "webshare") });
    } catch {
      /* user dismissed the share sheet, or it failed — no-op */
    }
  };

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t("groupLabel")}>
      <span className="mr-0.5 hidden text-xs font-semibold uppercase tracking-[0.12em] text-muted sm:inline">
        {t("shareLabel")}
      </span>

      <button
        type="button"
        onClick={copyLink}
        aria-label={t("copyLabel")}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        {copied ? (
          <Check width={14} height={14} className="text-positive" />
        ) : (
          <Link width={14} height={14} />
        )}
        <span>{copied ? t("copied") : t("copyBtn")}</span>
      </button>

      {SOCIALS.map(({ labelKey, source, icon: Icon, href }) => {
        const label = t(labelKey);
        return (
          <a
            key={source}
            href={href(withUtm(url, source))}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-navy-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-accent"
          >
            <Icon width={15} height={15} />
          </a>
        );
      })}

      {canNativeShare && (
        <button
          type="button"
          onClick={nativeShare}
          aria-label={t("nativeShare")}
          title={t("nativeShareTitle")}
          className="grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-navy-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-accent"
        >
          <Share width={15} height={15} />
        </button>
      )}

      {/* Desktop confirmation toast. role=status announces it to assistive tech. */}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <span className="animate-drop inline-flex items-center gap-2 rounded-pill bg-onyx px-4 py-2.5 text-sm font-medium text-white shadow-pop">
            <Check width={16} height={16} className="text-brand-400" />
            {t("toast")}
          </span>
        </div>
      )}
    </div>
  );
}
