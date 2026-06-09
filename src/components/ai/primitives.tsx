"use client";

import { useState } from "react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Check, Copy, Info } from "@/components/icons";
import type { AiMeta } from "@/lib/ai-types";

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
        over ? "border-negative/40 bg-[#fcf1ef]" : "border-line bg-surface"
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

/** Result header: model badge, demo / live status, and an optional "copy all". */
export function ResultMeta({ meta, copyAllText }: { meta: AiMeta; copyAllText?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill bg-navy-50 text-navy-700">{meta.model}</span>
        {meta.demo ? (
          <span className="pill bg-[#fff0e9] text-coral-600">
            <Info width={13} height={13} />
            Ukázkový režim (bez API klíče)
          </span>
        ) : (
          <span className="pill bg-[#e7f4ef] text-positive">
            <Check width={13} height={13} />
            Vygenerováno modelem · {(meta.tookMs / 1000).toFixed(1)} s
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
        <pre className="overflow-x-auto border-t border-line bg-navy-800 px-5 py-4 font-mono text-xs leading-relaxed text-navy-100">
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

/** Skeleton shown while a request is in flight. */
export function ToolLoading() {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="h-7 w-48 animate-pulse rounded-full bg-navy-100" />
      {[0, 1].map((g) => (
        <div key={g} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-navy-100" />
          {[0, 1, 2].map((r) => (
            <div key={r} className="h-11 animate-pulse rounded-lg bg-navy-50" />
          ))}
        </div>
      ))}
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
