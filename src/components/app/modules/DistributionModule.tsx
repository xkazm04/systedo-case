/** Distribuce — one article repurposed across channels + per-channel attribution.
 *  Each variant is editable: copy to clipboard, tweak inline (with a live
 *  length/limit counter + over-budget trim), and hand off to the social center
 *  pre-filled for the matching platform — no retyping. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { Calendar, Check, Copy, Document } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { fmtInt, fmtPct } from "@/lib/format";
import { repurpose } from "@/lib/distribution/generate";
import type { ChannelPerf, SourceArticle } from "@/lib/distribution/sample";
import { channelToPlatform } from "@/lib/distribution/handoff";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social/types";
import { useProject } from "@/lib/projects/context";

export default function DistributionModule({
  source,
  attribution,
}: {
  source: SourceArticle;
  attribution: ChannelPerf[];
}) {
  const variants = repurpose(source);
  const totalClicks = attribution.reduce((a, c) => a + c.clicks, 0);
  const best = attribution.reduce((a, b) => (b.clicks > a.clicks ? b : a), attribution[0]!);

  return (
    <div className="space-y-6">
      {/* source */}
      <div className="card flex items-center gap-4 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-accent">
          <Document width={22} height={22} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Zdrojový článek</p>
          <p className="truncate text-base font-semibold text-navy-800">{source.title}</p>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="link-inline text-sm">
            {source.url.replace("https://", "")}
          </a>
        </div>
      </div>

      {/* repurposed variants */}
      <div className="grid gap-4 sm:grid-cols-2">
        {variants.map((v) => (
          <VariantCard key={v.channel} channel={v.channel} initialText={v.text} max={v.max} />
        ))}
      </div>

      {/* attribution */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-navy-800">Atribuce podle kanálu</h3>
          <Pill tone="positive">Nejvíc prokliků: {best.channel}</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Kanál</th>
                <th className="px-4 py-3 text-right font-medium">Dosah</th>
                <th className="px-4 py-3 text-right font-medium">Prokliky</th>
                <th className="px-4 py-3 text-right font-medium">CTR</th>
                <th className="px-4 py-3 text-right font-medium">Podíl</th>
              </tr>
            </thead>
            <tbody>
              {attribution.map((c) => (
                <tr key={c.channel} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{c.channel}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.reach)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(c.clicks)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(c.reach > 0 ? c.clicks / c.reach : 0)}</td>
                  <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                    {fmtPct(totalClicks > 0 ? c.clicks / totalClicks : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NextSteps steps={[{ to: "socialni", label: "Naplánovat publikaci", hint: "Vydat varianty v centru sociálních sítí" }]} />
    </div>
  );
}

// --- per-variant card --------------------------------------------------------

/** One repurposed variant: copy, inline-edit with a live counter + trim, and a
 *  per-platform handoff that pre-fills the social center. */
function VariantCard({ channel, initialText, max }: { channel: string; initialText: string; max: number }) {
  const project = useProject();
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const platform = channelToPlatform(channel);
  const over = text.length > max;

  // Clear any pending "copied" timer on unmount.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = text;
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
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  // Trim the text down to the channel's soft budget.
  const trim = () => setText((t) => t.slice(0, max));

  const schedule = async () => {
    if (!platform || sending || text.trim().length < 2) return;
    setSending(true);
    setError(null);
    try {
      // Pre-fill a post for this platform via the social store's createPost
      // (its client surface), scheduled a few minutes out so it lands as a
      // draft-like scheduled post the user can still edit in the social center.
      const scheduledAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, content: text, scheduledAt }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "Předání do sociálních sítí se nezdařilo.");
        return;
      }
      router.push(`/app/${project.id}/socialni`);
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-navy-800">{channel}</span>
        <span className={`tnum text-xs ${over ? "text-negative" : "text-muted"}`}>
          {text.length}/{max}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        aria-label={`Text varianty pro ${channel}`}
        className={`mt-3 w-full flex-1 resize-y rounded-lg border bg-canvas px-3 py-2.5 text-sm leading-relaxed text-navy-700 outline-none transition focus:bg-surface ${
          over ? "border-negative focus:border-negative" : "border-line focus:border-brand-400"
        }`}
      />

      {over && (
        <button
          type="button"
          onClick={trim}
          className="mt-2 self-start text-xs font-semibold text-negative hover:underline"
        >
          Zkrátit na {max} znaků
        </button>
      )}

      {error && <p className="mt-2 text-xs text-negative">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
        >
          {copied ? (
            <Check width={14} height={14} className="text-positive" />
          ) : (
            <Copy width={14} height={14} />
          )}
          <span>{copied ? "Zkopírováno" : "Kopírovat"}</span>
        </button>

        {platform && (
          <button
            type="button"
            onClick={schedule}
            disabled={sending || over || text.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Calendar width={14} height={14} />
            {sending ? "Předávám…" : `Naplánovat na ${SOCIAL_PLATFORM_LABELS[platform]}`}
          </button>
        )}
      </div>
    </div>
  );
}
