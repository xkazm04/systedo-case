/** The exact UTM-stamped link shipped in this variant — visible and copyable, so
 *  the attribution table's `utm_source` column is verifiable against what actually
 *  goes out rather than merely implied.
 *
 *  Beside it: the MEASURED link (WP W2-A). The UTM link above is attributable only
 *  in the destination's OWN analytics — a tool Adamant cannot see. A minted
 *  `/go/{id}` hops through this app first, so the click lands in the organic outcome
 *  ledger and comes back as a real number beside the channel's curated fit. It is
 *  also short, which is what makes it usable in the places free channels actually
 *  live: a bio, a directory listing, a forum signature.
 *
 *  BOTH halves are derived from the one `link` prop — the destination by stripping
 *  the UTM triple, the campaign by reading it back off the query — so the mint needs
 *  no extra plumbing through VariantCard and cannot mint a link for a different
 *  article than the one the row is showing. */
"use client";

import { useState } from "react";
import { Check, Link, Sparkles } from "@/components/icons";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import { useProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import { withoutUtm } from "@/lib/distribution/utm";

const T = {
  cs: {
    utmLabel: "Odkaz s UTM",
    copyAriaLabel: "Kopírovat odkaz s UTM pro {channel}",
    linkBtn: "Odkaz",
    copied: "Zkopírováno",
    measuredBtn: "Měřený odkaz",
    measuredMinting: "Vytvářím…",
    measuredTitle: "Vytvoří krátký odkaz /go, jehož prokliky se počítají do výsledků kanálu.",
    measuredError: "Měřený odkaz se nepodařilo vytvořit.",
  },
  en: {
    utmLabel: "UTM link",
    copyAriaLabel: "Copy UTM link for {channel}",
    linkBtn: "Link",
    copied: "Copied",
    measuredBtn: "Measured link",
    measuredMinting: "Creating…",
    measuredTitle: "Creates a short /go link whose clicks count toward this channel's results.",
    measuredError: "Couldn't create the measured link.",
  },
} as const;

/** The campaign tag already stamped on the variant link — reused verbatim so the
 *  minted hop stamps the SAME utm_campaign the direct link would have. */
function campaignOf(link: string): string {
  try {
    return new URL(link).searchParams.get("utm_campaign") ?? "";
  } catch {
    return "";
  }
}

export default function VariantLinkRow({
  channel,
  link,
  onCopied,
}: {
  channel: string;
  link: string;
  /** the link left the app — beacon + advance the variant's status */
  onCopied: () => void;
}) {
  const t = useT(T);
  const project = useProject();
  const { copied, copy } = useCopyFeedback();
  const measured = useCopyFeedback();
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState(false);

  /** Mint (or re-use — the route is idempotent per url+channel) the short link and
   *  put its ABSOLUTE address on the clipboard: a bare `/go/{id}` pasted into a
   *  directory would be a dead relative path. */
  const mint = async () => {
    if (minting) return;
    setMinting(true);
    setError(false);
    try {
      const res = await fetch(`/api/projects/${project.id}/go-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: withoutUtm(link), channel, campaign: campaignOf(link) }),
      });
      const json = (await res.json().catch(() => null)) as { href?: string } | null;
      if (!res.ok || !json?.href) {
        setError(true);
        return;
      }
      await measured.copy(new URL(json.href, window.location.origin).toString());
      onCopied();
    } catch {
      setError(true);
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
          {t("utmLabel")}
        </span>
        <code className="flex-1 truncate font-mono text-[0.7rem] text-navy-600" title={link}>
          {link.replace("https://", "")}
        </code>
        <button
          type="button"
          onClick={() => void copy(link).then(onCopied)}
          aria-label={t("copyAriaLabel", { channel })}
          className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line bg-surface px-2 py-1 text-[0.7rem] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
        >
          {copied ? <Check width={12} height={12} className="text-positive" /> : <Link width={12} height={12} />}
          <span>{copied ? t("copied") : t("linkBtn")}</span>
        </button>
        <button
          type="button"
          onClick={() => void mint()}
          disabled={minting}
          title={t("measuredTitle")}
          className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line bg-surface px-2 py-1 text-[0.7rem] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {measured.copied ? (
            <Check width={12} height={12} className="text-positive" />
          ) : (
            <Sparkles width={12} height={12} />
          )}
          <span>
            {measured.copied ? t("copied") : minting ? t("measuredMinting") : t("measuredBtn")}
          </span>
        </button>
      </div>
      {error && <p className="text-[0.7rem] text-negative">{t("measuredError")}</p>}
    </div>
  );
}
