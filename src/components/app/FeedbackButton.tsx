"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Chat } from "@/components/icons";
import Modal from "@/components/app/Modal";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    open: "Zpětná vazba",
    title: "Napište nám zpětnou vazbu",
    body: "Co funguje, co drhne, co chybí? Čteme všechno.",
    messageLabel: "Zpráva",
    messagePlaceholder: "Vaše postřehy, nápady nebo problémy…",
    emailLabel: "E-mail (nepovinné — pokud chcete odpověď)",
    emailPlaceholder: "vas@email.cz",
    send: "Odeslat",
    sending: "Odesílám…",
    sentTitle: "Díky za zpětnou vazbu!",
    sentBody: "Zprávu jsme dostali a přečteme si ji.",
    close: "Zavřít",
    errGeneric: "Odeslání se nepodařilo. Zkuste to prosím znovu.",
    errRate: "Příliš mnoho zpráv za sebou. Zkuste to prosím později.",
    errInvalid: "Napište prosím krátkou zprávu (a případně platný e-mail).",
  },
  en: {
    open: "Feedback",
    title: "Send us feedback",
    body: "What works, what's rough, what's missing? We read everything.",
    messageLabel: "Message",
    messagePlaceholder: "Your observations, ideas or problems…",
    emailLabel: "Email (optional — if you'd like a reply)",
    emailPlaceholder: "you@email.com",
    send: "Send",
    sending: "Sending…",
    sentTitle: "Thanks for the feedback!",
    sentBody: "We got your message and will read it.",
    close: "Close",
    errGeneric: "Sending failed. Please try again.",
    errRate: "Too many messages in a row. Please try again later.",
    errInvalid: "Please write a short message (and a valid email, if you enter one).",
  },
} as const;

/** Topbar feedback control: opens the shared Modal with a short form (message +
 *  optional reply email for anonymous demo visitors) posting to /api/feedback.
 *  `source` names the surface; the email field only shows where the submitter has
 *  no account to answer to (the public demo). */
export default function FeedbackButton({ source }: { source: "app" | "demo" }) {
  const t = useT(T);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (phase === "sending") return;
    setOpen(false);
    setError(null);
    if (phase === "sent") {
      setPhase("idle");
      setMessage("");
      setEmail("");
    }
  };

  const submit = async () => {
    if (message.trim().length < 3 || phase === "sending") return;
    setPhase("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
          source,
          path: pathname,
        }),
      });
      if (res.ok) {
        setPhase("sent");
        return;
      }
      setPhase("idle");
      setError(res.status === 429 ? t("errRate") : res.status === 422 ? t("errInvalid") : t("errGeneric"));
    } catch {
      setPhase("idle");
      setError(t("errGeneric"));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        <Chat width={14} height={14} />
        <span className="hidden sm:inline">{t("open")}</span>
      </button>
      <Modal open={open} onClose={close} title={t("title")} description={t("body")}>
        {phase === "sent" ? (
          <div className="space-y-2 py-2 text-center">
            <p className="text-base font-semibold text-navy-800">{t("sentTitle")}</p>
            <p className="text-sm text-muted">{t("sentBody")}</p>
            <button
              type="button"
              onClick={close}
              className="mt-2 inline-flex items-center rounded-pill bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
            >
              {t("close")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-navy-800">{t("messageLabel")}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t("messagePlaceholder")}
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 placeholder:text-muted focus:border-brand-400 focus:outline-none"
              />
            </label>
            {source === "demo" && (
              <label className="block">
                <span className="text-sm font-medium text-navy-800">{t("emailLabel")}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  placeholder={t("emailPlaceholder")}
                  className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-navy-800 placeholder:text-muted focus:border-brand-400 focus:outline-none"
                />
              </label>
            )}
            {error && <p className="text-sm text-negative">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={message.trim().length < 3 || phase === "sending"}
              className="inline-flex items-center rounded-pill bg-brand-700 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "sending" ? t("sending") : t("send")}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
