"use client";

import { useEffect, useState } from "react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Bolt, Check, Clock, Copy, Info } from "@/components/icons";
import type { AiMeta } from "@/lib/ai-types";
import { fmtDateTime, fmtInt, fmtRelative } from "@/lib/format";
import { AI_TIMER_TARGET_MS, AI_TIMEOUT_SECONDS } from "./useAiTool";

/** Form field with label. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-navy-700">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface";

/** Copy-to-clipboard button with a transient confirmation. */
export function CopyButton({ text, label = "Kopírovat" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1300);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-navy-50 hover:text-navy-700"
      aria-label={label || "Kopírovat"}
    >
      {copied ? <Check width={14} height={14} className="text-positive" /> : <Copy width={14} height={14} />}
      {copied ? "Zkopírováno" : label}
    </button>
  );
}

/** Character counter that goes red over the limit. */
export function CharCount({ value, limit }: { value: number; limit: number }) {
  const over = value > limit;
  return (
    <span
      className={`tnum shrink-0 text-xs font-medium ${over ? "text-negative" : "text-muted"}`}
      title={over ? "Přes limit znaků" : "V limitu"}
    >
      {value}/{limit}
    </span>
  );
}

/** A single generated text line with its character count and a copy button. */
export function TextRow({ text, limit }: { text: string; limit: number }) {
  const over = text.length > limit;
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
        over ? "border-negative/40 bg-negative-soft" : "border-line bg-surface"
      }`}
    >
      <span className="min-w-0 flex-1 text-sm text-navy-800">{text}</span>
      <CharCount value={text.length} limit={limit} />
      <CopyButton text={text} label="" />
    </li>
  );
}

/** Labelled result section. */
export function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-navy-800">{title}</h3>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Result header: model badge, demo / live status, an optional relative
 *  "generated X ago" stamp for stored reports, and an optional "copy all". */
export function ResultMeta({
  meta,
  copyAllText,
  createdAt,
}: {
  meta: AiMeta;
  copyAllText?: string;
  createdAt?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill bg-navy-50 text-navy-700">{meta.model}</span>
        {meta.demo ? (
          <span className="pill bg-coral-soft text-coral-600">
            <Info width={13} height={13} />
            Ukázkový režim (bez API klíče)
          </span>
        ) : (
          <span className="pill bg-positive-soft text-positive">
            <Check width={13} height={13} />
            Vygenerováno modelem · {(meta.tookMs / 1000).toFixed(1)} s
          </span>
        )}
        {createdAt && (
          <span className="pill bg-navy-50 text-muted" title={fmtDateTime(createdAt)}>
            <Clock width={13} height={13} />
            <time dateTime={createdAt}>{fmtRelative(createdAt)}</time>
          </span>
        )}
        {/* token usage + cost — makes the "subscription (free) vs metered API"
            story explicit; only on real provider runs. */}
        {!meta.demo && meta.estCostUsd !== undefined && (
          meta.usage ? (
            <span
              className="pill bg-navy-50 text-muted"
              title={`${fmtInt(meta.usage.inputTokens)} vstupních + ${fmtInt(
                meta.usage.outputTokens
              )} výstupních tokenů`}
            >
              {fmtInt(meta.usage.totalTokens)} tok · ~${meta.estCostUsd.toFixed(4)}
            </span>
          ) : meta.estCostUsd === 0 ? (
            <span
              className="pill bg-navy-50 text-muted"
              title="Vývojový provider běží na předplatném (Claude Code) — bez platby za token"
            >
              předplatné · 0 $
            </span>
          ) : null
        )}
        {/* the output was auto-corrected to the platform limits */}
        {meta.repaired && (
          <span
            className="pill bg-brand-50 text-brand-700"
            title={
              meta.violations?.length
                ? `Automaticky opraveno do limitů: ${meta.violations.join("; ")}`
                : "Výstup byl automaticky opraven do limitů"
            }
          >
            <Bolt width={13} height={13} />
            Samoopraveno
          </span>
        )}
      </div>
      {copyAllText && <CopyButton text={copyAllText} label="Kopírovat vše" />}
    </div>
  );
}

/** Transparency: collapsible view of the exact prompt sent to the model. */
export function PromptDisclosure({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-navy-800"
      >
        <span className="flex items-center gap-2">
          <Info width={16} height={16} className="text-brand-600" />
          Zobrazit prompt poslaný modelu
        </span>
        <span className="text-muted">{open ? "skrýt" : "zobrazit"}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-line bg-onyx px-5 py-4 font-mono text-xs leading-relaxed text-onyx-ink">
          {prompt}
        </pre>
      )}
    </div>
  );
}

/** Empty state shown before the first run of a tool. */
export function ToolEmpty({
  icon: Icon,
  title,
  body,
  hint,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  hint?: string;
}) {
  return (
    <div className="card flex animate-fade-in flex-col items-center justify-center p-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon width={28} height={28} />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-navy-800">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>
      {hint && <p className="mt-4 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Error state with a retry handler. */
export function ToolError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card animate-fade-in border-negative/30 p-6">
      <p className="text-sm font-semibold text-negative">Generování selhalo</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-pill border border-line px-4 py-2 text-sm font-medium text-navy-700 hover:border-brand-300"
      >
        Zkusit znovu
      </button>
    </div>
  );
}

/** Animated loading indicator: a ring that fills toward the ~15s target the
 *  model usually needs. Results render the instant the response arrives (the
 *  ring is purely visual); past the target it keeps spinning until the hard limit. */
export function LoadingTimer() {
  const [elapsed, setElapsed] = useState(0); // seconds

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - start) / 1000), 100);
    return () => clearInterval(id);
  }, []);

  const target = AI_TIMER_TARGET_MS / 1000;
  const progress = Math.min(elapsed / target, 1);
  const over = elapsed >= target;
  const R = 42;
  const C = 2 * Math.PI * R;
  const color = over ? "var(--color-coral-500)" : "var(--color-brand-500)";

  return (
    <div
      data-testid="ai-loading"
      className="card flex animate-fade-in flex-col items-center justify-center p-10 text-center"
    >
      <div className="relative h-28 w-28">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            className={over ? "animate-pulse" : ""}
            style={{ transition: "stroke-dashoffset 0.12s linear, stroke 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="tnum text-2xl font-semibold text-navy-800">{Math.floor(elapsed)}s</span>
        </div>
      </div>
      <p className="mt-5 text-base font-semibold text-navy-800">
        {over ? "Model přemýšlí o něco déle…" : "Generuji odpověď…"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-muted">
        Výsledek se zobrazí ihned, jakmile dorazí.{over ? ` Limit je ${AI_TIMEOUT_SECONDS} sekund.` : ""}
      </p>
    </div>
  );
}

/** Timeout illustration shown when the model doesn't answer within the limit. */
export function TimeoutState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      data-testid="ai-timeout"
      className="card flex animate-fade-in flex-col items-center justify-center p-10 text-center"
    >
      <div className="relative">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-coral-soft text-coral-600">
          <Clock width={30} height={30} />
        </span>
        <span className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-coral-500 text-xs font-bold text-white">
          !
        </span>
      </div>
      <h2 className="mt-5 text-lg font-semibold text-navy-800">Vypršel časový limit</h2>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Model neodpověděl do {AI_TIMEOUT_SECONDS} sekund. Někdy stačí druhý pokus — zkuste to prosím znovu.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
      >
        Zkusit znovu
      </button>
    </div>
  );
}
