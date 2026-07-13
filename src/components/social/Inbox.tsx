"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Share, Sparkles } from "@/components/icons";
import { useOptionalProject } from "@/lib/projects/context";
import { replySeedKey, type ReplySeed } from "@/lib/twin/reply-seed";
import { useT } from "@/lib/i18n/client";
import {
  SOCIAL_PLATFORM_LABELS,
  type SocialPlatform,
} from "@/lib/social/types";

const T = {
  cs: {
    inboxTitle: "Inbox — comments & messages",
    pending: "{n} pending",
    loadingInbox: "Loading inbox…",
    comment: "comment",
    replied: "Replied",
    replyHint: "Suggested reply — edit and approve",
    replyInTwin: "Odpovědět v twinu",
    handoffHint: "Odpověď připraví twin ve Schránce zpráv",
    sending: "Sending…",
    approveAndSend: "Approve & send",
  },
  en: {
    inboxTitle: "Inbox — comments & messages",
    pending: "{n} pending",
    loadingInbox: "Loading inbox…",
    comment: "comment",
    replied: "Replied",
    replyHint: "Suggested reply — edit and approve",
    replyInTwin: "Reply in the twin",
    handoffHint: "The twin drafts the reply in your Message box",
    sending: "Sending…",
    approveAndSend: "Approve & send",
  },
} as const;

interface InboxMessage {
  id: string;
  platform: SocialPlatform;
  author: string;
  text: string;
  kind: "comment" | "dm";
  receivedAt: string;
  status: "open" | "replied";
  reply?: string;
  suggestedReply?: string;
}

export default function Inbox() {
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const router = useRouter();
  const pathname = usePathname();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  /** Inside the authed shell a reply is NOT drafted here — it is handed to Schránka
   *  zpráv, so every outbound message the twin writes passes one voice, one autonomy
   *  gate and one approve/reject record. The public demo (and the marketing page)
   *  have no `/app/:id` routes and no twin, so they keep the deterministic inline
   *  reply rather than dead-ending on a button that can't navigate anywhere. */
  const canHandOff = Boolean(pid) && pathname.startsWith("/app/");

  const replyInTwin = (m: InboxMessage) => {
    if (!pid) return;
    try {
      sessionStorage.setItem(
        replySeedKey(pid),
        JSON.stringify({ channel: "social", contact: m.author, inbound: m.text } satisfies ReplySeed)
      );
    } catch {
      /* storage unavailable — the outbox still opens, just unseeded */
    }
    router.push(`/app/${pid}/schranka`);
  };

  const load = useCallback(async () => {
    try {
      const url = pid ? `/api/social/messages?projectId=${encodeURIComponent(pid)}` : "/api/social/messages";
      const res = await fetch(url);
      const json = (await res.json()) as { messages?: InboxMessage[] };
      const list = json.messages ?? [];
      setMessages(list);
      setDrafts(Object.fromEntries(list.filter((m) => m.suggestedReply).map((m) => [m.id, m.suggestedReply!])));
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const send = async (m: InboxMessage) => {
    const reply = (drafts[m.id] ?? "").trim();
    if (!reply) return;
    setBusy(m.id);
    try {
      const res = await fetch("/api/social/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, platform: m.platform, reply, projectId: pid }),
      });
      if (res.ok) {
        setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, status: "replied", reply } : x)));
      }
    } finally {
      setBusy(null);
    }
  };

  const open = messages.filter((m) => m.status === "open");

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-navy-800">{t("inboxTitle")}</h2>
        <span className="text-xs text-muted">{t("pending", { n: open.length })}</span>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-sm text-muted">{t("loadingInbox")}</div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {messages.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-navy-800">{m.author}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="pill bg-navy-50 text-muted">{SOCIAL_PLATFORM_LABELS[m.platform]}</span>
                  {m.kind === "dm" ? "DM" : t("comment")}
                </span>
              </div>
              <p className="mt-2 text-sm text-navy-700">{m.text}</p>

              {m.status === "replied" ? (
                <div className="mt-3 rounded-lg bg-positive-soft px-3 py-2 text-sm text-positive">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Check width={14} height={14} />
                    {t("replied")}
                  </span>
                  <p className="mt-1 text-navy-700">{m.reply}</p>
                </div>
              ) : canHandOff ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-muted">{t("handoffHint")}</span>
                  <button
                    type="button"
                    onClick={() => replyInTwin(m)}
                    className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    <Sparkles width={13} height={13} />
                    {t("replyInTwin")}
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <textarea
                    value={drafts[m.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.id]: e.target.value }))}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px] text-muted">{t("replyHint")}</span>
                    <button
                      type="button"
                      onClick={() => send(m)}
                      disabled={busy === m.id}
                      className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Share width={13} height={13} />
                      {busy === m.id ? t("sending") : t("approveAndSend")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
