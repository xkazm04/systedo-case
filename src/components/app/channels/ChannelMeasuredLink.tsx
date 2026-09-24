"use client";

/** The playbook's "Measured link" section: mint a `/go/{id}` for THIS channel through
 *  the existing `POST /api/projects/{id}/go-links` and put its absolute address on
 *  the clipboard. It never posts, publishes or sends anything — the operator pastes
 *  the link where the hint says. Every decision (default destination, the channel's
 *  own host refused, demo / reuse / cap state, placement hint, this channel's links)
 *  is the pure `measured-link` module; this file only renders it and does the two
 *  requests. The 30-day count sits beside the plan's fit and never reorders it. */
import { useEffect, useState } from "react";
import { Check, Link as LinkIcon } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import { useProject } from "@/lib/projects/context";
import { isDemoProject } from "@/lib/projects/demo";
import { useCopyFeedback } from "@/lib/useCopyFeedback";
import type { ChannelOutcome } from "@/lib/organic-channels/outcomes";
import type { OrganicChannel } from "@/lib/organic-channels/types";
import {
  absoluteGoHref,
  channelMeasured,
  defaultDestination,
  linkState,
  linksForChannel,
  placementHint,
  type MeasuredLink,
} from "@/lib/organic-channels/measured-link";

const T = {
  cs: {
    title: "Měřený odkaz",
    intro: "Krátký odkaz /go, který počítá prokliky z tohoto kanálu. Vložíte ho sami, nic se neodesílá.",
    "listing-website-field": "Vložte ho do pole Web ve svém zápisu.",
    "profile-bio": "Dejte ho do popisu profilu nebo do příspěvku.",
    "article-cta": "Použijte ho jako výzvu k akci v článku.",
    "newsletter-cta": "Použijte ho jako odkaz výzvy k akci v newsletteru.",
    "pitch-signature": "Přidejte ho do nabídky nebo do e-mailového podpisu.",
    destLabel: "Kam odkaz vede",
    mint: "Vytvořit a zkopírovat",
    copyExisting: "Zkopírovat odkaz",
    minting: "Vytvářím…",
    copied: "Zkopírováno",
    demo: "Na ukázkovém projektu nelze měřené odkazy vytvářet.",
    atCap: "Projekt už má maximální počet měřených odkazů ({n}).",
    "bad-url": "Zadejte celou webovou adresu (http nebo https).",
    "channel-own-host": "Odkaz musí vést na váš web. Odkaz na samotný kanál o vás nic nezměří.",
    error: "Měřený odkaz se nepodařilo vytvořit.",
    measured: "Odkazy: {links} · prokliky za 30 dní: {clicks}",
  },
  en: {
    title: "Measured link",
    intro: "A short /go link that counts clicks from this channel. You paste it yourself; nothing is sent.",
    "listing-website-field": "Paste it into the website field of your listing.",
    "profile-bio": "Put it in your profile bio or in a post.",
    "article-cta": "Use it as the call to action in your article.",
    "newsletter-cta": "Use it as the call-to-action link in your newsletter.",
    "pitch-signature": "Add it to your pitch or your email signature.",
    destLabel: "Where the link leads",
    mint: "Create and copy",
    copyExisting: "Copy link",
    minting: "Creating…",
    copied: "Copied",
    demo: "Measured links can't be created on a sample project.",
    atCap: "This project already has the maximum number of measured links ({n}).",
    "bad-url": "Enter a full web address (http or https).",
    "channel-own-host": "The link has to lead to your site. A link to the channel itself measures nothing about you.",
    error: "Couldn't create the measured link.",
    measured: "Links: {links} · clicks in 30 days: {clicks}",
  },
} as const;

type Listing = { links: MeasuredLink[]; outcomes: ChannelOutcome[]; cap?: number };

/** The existing GET: this project's links plus their live 30-day rollup. The list is
 *  context, not a precondition — on failure the idempotent POST still works. */
async function fetchListing(projectId: string): Promise<Listing | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}/go-links`);
    const json = res.ok ? ((await res.json().catch(() => null)) as Listing | null) : null;
    return json && Array.isArray(json.links) ? { ...json, outcomes: json.outcomes ?? [] } : null;
  } catch {
    return null;
  }
}

export default function ChannelMeasuredLink({ channel }: { channel: OrganicChannel }) {
  const t = useT(T);
  const project = useProject();
  const demo = isDemoProject(project);
  const { copied, copy } = useCopyFeedback();
  const [dest, setDest] = useState(() => defaultDestination(project) ?? "");
  const [listing, setListing] = useState<Listing>({ links: [], outcomes: [] });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (demo) return;
    let live = true;
    void fetchListing(project.id).then((l) => live && l && setListing(l));
    return () => {
      live = false;
    };
  }, [demo, project.id]);

  const state = linkState({ demo, links: listing.links, channel, dest, cap: listing.cap });
  const mine = linksForChannel(listing.links, channel);
  const measured = channelMeasured(listing.outcomes, channel);

  const act = async () => {
    if (busy) return;
    if (state.kind === "reuse") return copy(absoluteGoHref(state.href, window.location.origin));
    if (state.kind !== "ready") return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/projects/${project.id}/go-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.body),
      });
      const json = (await res.json().catch(() => null)) as { href?: string } | null;
      if (!res.ok || !json?.href) {
        setFailed(true);
        return;
      }
      await copy(absoluteGoHref(json.href, window.location.origin));
      void fetchListing(project.id).then((l) => l && setListing(l));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const reason =
    state.kind === "demo"
      ? t("demo")
      : state.kind === "at-cap"
        ? t("atCap", { n: listing.cap ?? 0 })
        : state.kind === "invalid" && dest.trim()
          ? t(state.error)
          : null;

  return (
    <div className="rounded-card border border-line bg-canvas px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("title")}</p>
      <p className="mt-1 text-sm leading-relaxed text-navy-700">
        {t(placementHint(channel))} {t("intro")}
      </p>
      <label className="mt-3 block text-xs font-medium text-muted" htmlFor={`measured-dest-${channel.id}`}>
        {t("destLabel")}
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={`measured-dest-${channel.id}`}
          type="url"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          disabled={demo}
          placeholder="https://"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void act()}
          disabled={busy || (state.kind !== "ready" && state.kind !== "reuse")}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-4 py-2 text-sm font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? <Check width={14} height={14} className="text-positive" /> : <LinkIcon width={14} height={14} />}
          {copied ? t("copied") : busy ? t("minting") : state.kind === "reuse" ? t("copyExisting") : t("mint")}
        </button>
      </div>
      {reason && <p className="mt-2 text-xs text-muted">{reason}</p>}
      {failed && <p className="mt-2 text-xs text-negative">{t("error")}</p>}
      {mine.length > 0 && (
        <ul className="mt-3 space-y-1">
          {mine.map((l) => (
            <li key={l.id} className="flex gap-2 font-mono text-[0.7rem] text-navy-600">
              <span className="shrink-0">{l.href}</span>
              <span className="truncate text-muted" title={l.url}>→ {l.url}</span>
            </li>
          ))}
        </ul>
      )}
      {measured && measured.clicks30d > 0 && (
        <p className="mt-2 text-xs font-medium text-navy-700">
          {t("measured", { links: measured.links, clicks: measured.clicks30d })}
        </p>
      )}
    </div>
  );
}
