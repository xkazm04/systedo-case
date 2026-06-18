/** Distribuce — one article repurposed across channels + per-channel attribution.
 *  Each variant is editable: copy to clipboard, tweak inline (with a live
 *  length/limit counter + over-budget trim), and hand off to the social center
 *  pre-filled for the matching platform — no retyping. */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill } from "@/components/ui";
import { Calendar, Check, Copy, Document, Info, Link, Refresh, Sparkles } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import { fmtInt, fmtPct } from "@/lib/format";
import { repurpose } from "@/lib/distribution/generate";
import type { ChannelPerf, SourceArticle } from "@/lib/distribution/sample";
import { channelToPlatform } from "@/lib/distribution/handoff";
import { channelUtmSource } from "@/lib/distribution/utm";
import { SOCIAL_PLATFORM_LABELS } from "@/lib/social/types";
import { useProject } from "@/lib/projects/context";
import { useAiTool } from "@/components/ai/useAiTool";
import type { RepurposeResult, Tone } from "@/lib/ai-types";

/** Tone used for the AI repurposing — friendly/human matches the demo content. */
const REPURPOSE_TONE: Tone = "pratelsky";

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
          <VariantCard
            key={v.channel}
            channel={v.channel}
            initialText={v.text}
            max={v.max}
            link={v.link}
            source={source}
          />
        ))}
      </div>

      {/* attribution */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-navy-800">Atribuce podle kanálu</h3>
            <p className="mt-0.5 text-xs text-muted">
              Ukázková data — řádky odpovídají <code className="font-mono text-[0.7rem] text-navy-700">utm_source</code> z odkazů výše.
            </p>
          </div>
          <Pill tone="positive">Nejvíc prokliků: {best.channel}</Pill>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Kanál</th>
                <th className="px-4 py-3 font-medium">utm_source</th>
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
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs text-navy-600">{channelUtmSource(c.channel)}</code>
                  </td>
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
function VariantCard({
  channel,
  initialText,
  max,
  link,
  source,
}: {
  channel: string;
  initialText: string;
  max: number;
  link: string;
  source: SourceArticle;
}) {
  const project = useProject();
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const linkTimer = useRef<number | undefined>(undefined);

  // AI repurposing for this single channel (repurpose tool, via /api/ai). The
  // deterministic variant is the initial value + fallback; on success we swap in
  // the model's channel-native text, which still flows through the UTM link,
  // length counter, copy and push-to-social affordances below.
  const ai = useAiTool<RepurposeResult>("repurpose");
  /** The AI text already applied to the editor — applied once per arrival during
   *  render (avoids a set-state-in-effect cascade); manual edits then stick. */
  const [appliedAiText, setAppliedAiText] = useState<string | null>(null);
  const aiText =
    ai.status === "done"
      ? ai.data?.result.variants.find((v) => v.channel === channel)?.text ?? null
      : null;
  if (aiText && aiText !== appliedAiText) {
    setAppliedAiText(aiText);
    setText(aiText);
  }
  const usingAi = Boolean(aiText) && text === aiText;

  const platform = channelToPlatform(channel);
  const over = text.length > max;

  // Clear any pending "copied" timers on unmount.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(linkTimer.current);
    },
    []
  );

  // Copy arbitrary text to the clipboard, with a textarea fallback for browsers
  // lacking the async clipboard API.
  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
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
  };

  const copy = async () => {
    await copyToClipboard(text);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  const copyLink = async () => {
    await copyToClipboard(link);
    setLinkCopied(true);
    window.clearTimeout(linkTimer.current);
    linkTimer.current = window.setTimeout(() => setLinkCopied(false), 2200);
  };

  // Trim the text down to the channel's soft budget.
  const trim = () => setText((t) => t.slice(0, max));

  // Ask the model for a fresh, channel-native variant of this article.
  const regenerate = () => {
    if (ai.status === "loading") return;
    setAppliedAiText(null);
    ai.run({
      title: source.title,
      url: source.url,
      channels: [channel],
      tone: REPURPOSE_TONE,
    });
  };

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
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-navy-800">{channel}</span>
          {usingAi ? (
            <Pill tone="positive">
              <Sparkles width={12} height={12} />
              AI
            </Pill>
          ) : null}
        </span>
        <span className={`tnum text-xs ${over ? "text-negative" : "text-muted"}`}>
          {text.length}/{max}
        </span>
      </div>

      <button
        type="button"
        onClick={regenerate}
        disabled={ai.status === "loading"}
        className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-pill bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
      >
        {ai.status === "loading" ? (
          <>
            <Sparkles width={13} height={13} className="animate-pulse" />
            Generuji…
          </>
        ) : usingAi ? (
          <>
            <Refresh width={13} height={13} />
            Vygenerovat znovu
          </>
        ) : (
          <>
            <Sparkles width={13} height={13} />
            Přegenerovat AI variantu
          </>
        )}
      </button>

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

      {/* AI generation status — loading / error / demo (keyless) mode. The text
          itself (AI or deterministic) flows through the affordances below. */}
      {ai.status === "loading" ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
          <Sparkles width={14} height={14} className="shrink-0 animate-pulse" />
          Generuji variantu na míru kanálu… mezitím vidíte deterministický návrh.
        </p>
      ) : null}
      {ai.status === "error" ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-negative/30 bg-negative-soft px-3 py-2 text-xs">
          <span className="text-negative">
            {ai.timedOut
              ? "Model neodpověděl včas — ponecháváme deterministický návrh."
              : `Generování selhalo${ai.error ? `: ${ai.error}` : "."} Ponecháváme deterministický návrh.`}
          </span>
          <button
            type="button"
            onClick={regenerate}
            className="shrink-0 rounded-pill border border-line bg-surface px-2.5 py-1 font-medium text-navy-700 hover:border-brand-300"
          >
            Zkusit znovu
          </button>
        </div>
      ) : null}
      {usingAi && ai.data?.meta.demo ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-coral-soft bg-coral-soft px-3 py-2 text-xs text-coral-600">
          <Info width={14} height={14} className="shrink-0" />
          Ukázkový režim (bez API klíče) — připojte LLM pro generování modelem.
        </p>
      ) : null}

      {/* The exact UTM-stamped link shipped in this variant — visible + copyable
          so attribution is verifiable, not implied. */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">Odkaz s UTM</span>
        <code className="flex-1 truncate font-mono text-[0.7rem] text-navy-600" title={link}>
          {link.replace("https://", "")}
        </code>
        <button
          type="button"
          onClick={copyLink}
          aria-label={`Kopírovat odkaz s UTM pro ${channel}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line bg-surface px-2 py-1 text-[0.7rem] font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
        >
          {linkCopied ? (
            <Check width={12} height={12} className="text-positive" />
          ) : (
            <Link width={12} height={12} />
          )}
          <span>{linkCopied ? "Hotovo" : "Odkaz"}</span>
        </button>
      </div>

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
