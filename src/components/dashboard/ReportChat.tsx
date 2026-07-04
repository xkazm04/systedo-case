"use client";

/** Datový report → chat. A dedicated split surface: the deterministic performance
 *  report sits in a sticky left rail as reference, and a live chat (grounded in the
 *  same snapshot, via /api/ai mode:chat) owns the right. Opened from the "Datový
 *  report" action on the Výkon dashboard. Shared by the demo and the authed app. */
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bolt, Check, Target, TrendDown } from "@/components/icons";
import { useT } from "@/lib/i18n/client";
import type { AnalysisPeriod, AnalysisResult, ChatTurn } from "@/lib/ai-types";

const T = {
  cs: {
    back: "Zpět na dashboard",
    eyebrow: "Datový report",
    assistant: "Datový report — asistent",
    assistantSub: "Ptejte se na detaily reportu — model odpovídá z reálných dat.",
    empty: "Vyberte otázku níže, nebo napište vlastní.",
    placeholder: "Zeptejte se na cokoli z reportu…",
    thinking: "Přemýšlím…",
    send: "Odeslat",
    retry: "Zkusit znovu",
    wins: "Co se daří",
    risks: "Na co si dát pozor",
    actions: "Doporučené kroky",
  },
  en: {
    back: "Back to dashboard",
    eyebrow: "Data report",
    assistant: "Data report — assistant",
    assistantSub: "Ask about the report — the model answers from real data.",
    empty: "Pick a question below, or type your own.",
    placeholder: "Ask anything about the report…",
    thinking: "Thinking…",
    send: "Send",
    retry: "Retry",
    wins: "What’s working",
    risks: "Watch out for",
    actions: "Recommended actions",
  },
} as const;

/** One live chat turn against /api/ai mode:chat, grounded server-side by period. */
function useReportChat(period: AnalysisPeriod) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** POST a transcript (already ending on a user turn) and append the reply. */
  const post = async (msgs: ChatTurn[]) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "chat", period, messages: msgs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Chyba");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.result.reply }]);
    } catch {
      setError("Nepodařilo se odeslat zprávu.");
    } finally {
      setPending(false);
    }
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const next: ChatTurn[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    void post(next);
  };

  // Re-send the last (failed) user turn without duplicating it — `messages`
  // already ends on that user turn when a POST errored before the reply landed.
  const retry = () => {
    if (pending) return;
    const last = messages[messages.length - 1];
    if (last?.role === "user") void post(messages);
  };

  return { messages, pending, error, send, retry };
}

export default function ReportChat({
  report,
  period,
  chips,
  backHref,
  subtitle,
}: {
  report: AnalysisResult;
  period: AnalysisPeriod;
  chips: string[];
  backHref: string;
  subtitle: string;
}) {
  const t = useT(T);
  const { messages, pending, error, send, retry } = useReportChat(period);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onSend = (text: string) => {
    void send(text);
    // Nudge the thread to the newest turn after the state flush.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-navy-800"
      >
        <ArrowRight width={15} height={15} className="rotate-180" />
        {t("back")}
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-start">
        {/* report rail */}
        <div className="card space-y-4 p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">
              {t("eyebrow")}
            </p>
            <span className="rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              {subtitle}
            </span>
          </div>

          <div className="rounded-card border border-navy-200 bg-navy-50 p-4">
            <p className="font-semibold text-navy-800">{report.headline}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{report.summary}</p>
          </div>

          <ReportGroup title={t("wins")}>
            {report.wins.map((w, i) => (
              <ReportLine key={i} tone="good">
                {w}
              </ReportLine>
            ))}
          </ReportGroup>
          <ReportGroup title={t("risks")}>
            {report.risks.map((r, i) => (
              <ReportLine key={i} tone="warn">
                {r}
              </ReportLine>
            ))}
          </ReportGroup>
          <ReportGroup title={t("actions")} hint={String(report.actions.length)}>
            <ol className="space-y-2">
              {report.actions.map((a, i) => (
                <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-3">
                  <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy-800">{a.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{a.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </ReportGroup>
        </div>

        {/* chat column */}
        <div className="card flex min-h-[560px] flex-col overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-onyx text-brand-400">
              <Target width={18} height={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-navy-800">{t("assistant")}</p>
              <p className="text-xs text-muted">{t("assistantSub")}</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto scrollbar-slim px-5 py-5">
            {messages.length === 0 && !pending && (
              <p className="py-8 text-center text-sm text-muted">{t("empty")}</p>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
            {pending && <TypingBubble label={t("thinking")} />}
            {error && (
              <div className="flex items-center justify-between gap-3 rounded-card border border-coral-200 bg-coral-soft px-4 py-3 text-sm text-coral-700">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={retry}
                  className="shrink-0 font-semibold underline hover:no-underline"
                >
                  {t("retry")}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-line bg-canvas/40 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={pending}
                  onClick={() => onSend(c)}
                  className="rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
                >
                  {c}
                </button>
              ))}
            </div>
            <Composer onSend={onSend} disabled={pending} placeholder={t("placeholder")} sendLabel={t("send")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{title}</h4>
        {hint && (
          <span className="rounded-pill bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-muted">{hint}</span>
        )}
      </div>
      {Array.isArray(children) ? <ul className="space-y-2">{children}</ul> : children}
    </div>
  );
}

function ReportLine({ tone, children }: { tone: "good" | "warn"; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-navy-700">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          tone === "good" ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-600"
        }`}
      >
        {tone === "good" ? <Check width={12} height={12} /> : <TrendDown width={12} height={12} />}
      </span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function MessageBubble({ msg }: { msg: ChatTurn }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-line rounded-card rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
        <Bolt width={17} height={17} />
      </span>
      <div className="max-w-[85%] whitespace-pre-line rounded-card rounded-tl-sm border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-navy-700">
        {msg.content}
      </div>
    </div>
  );
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
        <Bolt width={17} height={17} />
      </span>
      <div className="flex items-center gap-2 rounded-card rounded-tl-sm border border-line bg-surface px-4 py-3 text-sm text-muted">
        <span className="flex gap-1" aria-hidden>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-300 [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-300 [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-300" />
        </span>
        {label}
      </div>
    </div>
  );
}

function Composer({
  onSend,
  disabled,
  placeholder,
  sendLabel,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder: string;
  sendLabel: string;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (disabled) return;
    onSend(value);
    setValue("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 rounded-pill border border-line bg-surface px-2 py-1.5 shadow-card focus-within:border-brand-300"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-navy-800 placeholder:text-muted focus:outline-none"
      />
      <button
        type="submit"
        aria-label={sendLabel}
        disabled={disabled || !value.trim()}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
      >
        <ArrowRight width={16} height={16} />
      </button>
    </form>
  );
}
