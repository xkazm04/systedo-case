"use client";

/** The outbox: paste an inbound message, the twin drafts a reply in the trained
 *  voice, a human approves or rejects it, then it's sent through the channel's
 *  connector.
 *
 *  Two things the personas ReplyOutbox didn't have, both load-bearing:
 *   1. `decideDraft` runs on every generation. Under `auto` a confident, risk-free
 *      draft self-approves; everything else waits for a human. The badge says which.
 *   2. A rejection carries a REASON, and those reasons are tallied into the `avoid`
 *      block of the next prompt. Rejecting is training, not just deleting.
 *
 *  One thing it did have and we keep: the draft is generated against a frozen
 *  context (the channel + contact at generation time), so switching the dropdown
 *  mid-review can't log a reply against the wrong conversation. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "@/lib/projects/context";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useT } from "@/lib/i18n/client";
import { Pill } from "@/components/ui";
import { Check, Close, Copy, Send, Sparkles } from "@/components/icons";
import { useAiTool } from "@/components/ai/useAiTool";
import { LoadingTimer, RefineBar, TimeoutState, ToolError, inputClass } from "@/components/ai/primitives";
import { promptSafeName } from "@/lib/projects/name";
import { voiceToWire } from "@/lib/twin/wire";
import type { TwinReplyResult } from "@/lib/ai-types";
import type { ProjectType } from "@/lib/projects/types";
import {
  avoidDirectives,
  channelConfig,
  decideDraft,
  rejectionPatterns,
  resolveVoice,
  REJECT_REASONS,
  TWIN_CHANNELS,
  type RejectReason,
  type TwinChannel,
  type TwinDraft,
  type TwinState,
} from "@/lib/twin/types";

const T = {
  cs: {
    channel: "Kanál",
    contact: "Komu",
    contactPlaceholder: "Jméno nebo handle…",
    inbound: "Příchozí zpráva",
    inboundPlaceholder: "Vložte zprávu, na kterou má twin odpovědět…",
    draft: "Vygenerovat odpověď",
    drafting: "Píšu odpověď…",
    regenerate: "Přegenerovat",
    reply: "Návrh odpovědi",
    confidence: "Jistota",
    risks: "Ke kontrole",
    noRisks: "Bez rizik",
    toneNotes: "Hlas",
    questions: "Doptat se",
    approve: "Schválit",
    reject: "Zamítnout",
    rejectWhy: "Proč zamítáte?",
    rejectNote: "Poznámka (nepovinná)",
    confirmReject: "Zamítnout a poučit twin",
    cancel: "Zrušit",
    send: "Odeslat",
    sending: "Odesílám…",
    copy: "Kopírovat",
    copied: "Zkopírováno",
    autoApproved: "Schváleno automaticky",
    needsReview: "Čeká na schválení",
    approved: "Schváleno",
    sent: "Odesláno",
    rejected: "Zamítnuto",
    history: "Historie",
    noHistory: "Zatím žádné koncepty na tomto kanálu.",
    disabledChannel: "Tento kanál je vypnutý — twin na něm nepíše. Zapněte ho v modulu Správa kanálů.",
    autonomyReview: "Režim: jen člověk",
    autonomyAssist: "Režim: twin píše, člověk schvaluje",
    autonomyAuto: "Režim: samostatný nad {n} % jistoty",
    manualNote: "Adamant zprávu neodesílá — zkopírujte ji a odešlete svým kanálem.",
    learned: "Twin se poučil z {n} zamítnutí na tomto kanálu.",
  },
  en: {
    channel: "Channel",
    contact: "To",
    contactPlaceholder: "Name or handle…",
    inbound: "Inbound message",
    inboundPlaceholder: "Paste the message the twin should answer…",
    draft: "Generate reply",
    drafting: "Writing the reply…",
    regenerate: "Regenerate",
    reply: "Draft reply",
    confidence: "Confidence",
    risks: "To check",
    noRisks: "No risks",
    toneNotes: "Voice",
    questions: "Ask about",
    approve: "Approve",
    reject: "Reject",
    rejectWhy: "Why are you rejecting?",
    rejectNote: "Note (optional)",
    confirmReject: "Reject and teach the twin",
    cancel: "Cancel",
    send: "Send",
    sending: "Sending…",
    copy: "Copy",
    copied: "Copied",
    autoApproved: "Auto-approved",
    needsReview: "Awaiting approval",
    approved: "Approved",
    sent: "Sent",
    rejected: "Rejected",
    history: "History",
    noHistory: "No drafts on this channel yet.",
    disabledChannel: "This channel is off — the twin does not write here. Turn it on in Channel management.",
    autonomyReview: "Mode: human only",
    autonomyAssist: "Mode: twin drafts, human approves",
    autonomyAuto: "Mode: autonomous above {n}% confidence",
    manualNote: "Adamant does not send messages — copy the text and send it yourself.",
    learned: "The twin has learned from {n} rejections on this channel.",
  },
} as const;

const CHANNEL_LABELS: Record<TwinChannel, { cs: string; en: string }> = {
  leads: { cs: "Poptávky", en: "Enquiries" },
  email: { cs: "E-mail", en: "Email" },
  chat: { cs: "Chat", en: "Chat" },
  social: { cs: "Sociální sítě", en: "Social" },
  reviews: { cs: "Recenze", en: "Reviews" },
  sms: { cs: "SMS", en: "SMS" },
  whatsapp: { cs: "WhatsApp", en: "WhatsApp" },
};

const REASON_LABELS: Record<RejectReason, { cs: string; en: string }> = {
  off_brand: { cs: "Mimo hlas značky", en: "Off-brand" },
  inaccurate: { cs: "Nepřesné", en: "Inaccurate" },
  too_long: { cs: "Příliš dlouhé", en: "Too long" },
  wrong_tone: { cs: "Špatný tón", en: "Wrong tone" },
  risky_claim: { cs: "Rizikový slib", en: "Risky claim" },
};

const uid = () => Math.random().toString(36).slice(2, 10);

export default function TwinOutbox({
  state,
  projectType,
  channel,
  onChannel,
  onCommit,
  initialContact = "",
  initialInbound = "",
}: {
  state: TwinState;
  projectType: ProjectType;
  channel: TwinChannel;
  onChannel: (c: TwinChannel) => void;
  onCommit: (next: TwinState) => void;
  /** pre-filled from a hand-off (e.g. the Socials inbox → `replySeedKey`) */
  initialContact?: string;
  initialInbound?: string;
}) {
  const project = useProject();
  const { locale } = useLocale();
  const t = useT(T);
  const L = locale === "en" ? "en" : "cs";

  const [contact, setContact] = useState(initialContact);
  const [inbound, setInbound] = useState(initialInbound);
  const [replyText, setReplyText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<RejectReason>("off_brand");
  const [rejectNote, setRejectNote] = useState("");
  /** The channel+contact the live draft was generated for — never the live inputs. */
  const [draftContext, setDraftContext] = useState<{ channel: TwinChannel; contact: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const ai = useAiTool<TwinReplyResult>("twin-reply", channel);

  const cfg = channelConfig(state.channels, channel);
  const voice = resolveVoice(state.voices, channel);
  const patterns = useMemo(() => rejectionPatterns(state.drafts, channel), [state.drafts, channel]);
  const rejectedCount = patterns.reduce((n, p) => n + p.count, 0);

  const channelDrafts = useMemo(
    () => state.drafts.filter((d) => d.channel === channel).slice().reverse(),
    [state.drafts, channel]
  );

  const result = ai.status === "done" ? ai.data?.result ?? null : null;
  /** Seed the editor from a fresh generation exactly once (render-time adjust, no
   *  effect cascade) — the user's later edits then stick. */
  const [seededReply, setSeededReply] = useState<string | null>(null);
  if (result?.reply && result.reply !== seededReply) {
    setSeededReply(result.reply);
    setReplyText(result.reply);
  }

  const runDraft = () => {
    if (!inbound.trim() || ai.status === "loading") return;
    setDraftContext({ channel, contact: contact.trim() });
    setPendingId(null);
    const avoid = avoidDirectives(patterns);
    ai.run({
      inbound: inbound.trim(),
      channel,
      projectType,
      brand: promptSafeName(project.name),
      ...(contact.trim() ? { contact: contact.trim() } : {}),
      ...(voice ? { voice: voiceToWire(voice) } : {}),
      ...(voice?.examples.length ? { examples: voice.examples } : {}),
      ...(avoid.length > 0 ? { avoid } : {}),
    });
  };

  /** Bank the live draft as a record. The autonomy gate decides whether it lands
   *  approved or pending — the human's edits ride along either way. */
  const bankDraft = (): TwinDraft | null => {
    if (!result || !draftContext) return null;
    const verdict = decideDraft(cfg, { confidence: result.confidence, risks: result.risks });
    const now = new Date().toISOString();
    const draft: TwinDraft = {
      id: uid(),
      channel: draftContext.channel,
      contact: draftContext.contact,
      inbound: inbound.trim(),
      reply: replyText,
      questions: result.questions,
      confidence: result.confidence,
      risks: result.risks,
      status: verdict.status,
      autoApproved: verdict.autoApproved,
      createdAt: now,
    };
    return draft;
  };

  /** The gate's verdict on the live draft, recomputed as the human edits nothing
   *  that would change it. `null` until there is something to judge. */
  const verdict = result ? decideDraft(cfg, { confidence: result.confidence, risks: result.risks }) : null;

  /** Under `auto`, a confident risk-free draft is banked as approved WITHOUT a human
   *  click — otherwise `autoApproved` would be a label the app never earns. The ref
   *  keys on the generated reply so a re-render (or a parent state change flowing
   *  back down) can't bank the same draft twice. The human can still reject it
   *  afterwards; that is exactly why a draft is a persisted record with a status
   *  rather than the ephemeral in-memory value the personas plugin used. */
  const autoBankedRef = useRef<string | null>(null);
  /** The id the gate banked, so a later human rejection FLIPS that record rather
   *  than appending a duplicate of the same message. */
  const autoBankedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result || !draftContext || !cfg.enabled) return;
    if (!verdict?.autoApproved) return;
    if (autoBankedRef.current === result.reply) return;
    autoBankedRef.current = result.reply;
    const id = uid();
    autoBankedIdRef.current = id;
    const now = new Date().toISOString();
    onCommit({
      ...state,
      drafts: [
        ...state.drafts,
        {
          id,
          channel: draftContext.channel,
          contact: draftContext.contact,
          inbound: inbound.trim(),
          reply: result.reply,
          questions: result.questions,
          confidence: result.confidence,
          risks: result.risks,
          status: "approved",
          autoApproved: true,
          decidedAt: now,
          createdAt: now,
        },
      ],
    });
  }, [result, verdict, draftContext, cfg, inbound, state, onCommit]);

  const approve = () => {
    const draft = bankDraft();
    if (!draft) return;
    const now = new Date().toISOString();
    // A human pressed Approve, so this is never an auto-approval however the gate
    // would have ruled.
    const approved: TwinDraft = { ...draft, status: "approved", autoApproved: false, decidedAt: now };
    onCommit({ ...state, drafts: [...state.drafts, approved] });
    setPendingId(approved.id);
    ai.reset();
    setSeededReply(null);
    setInbound("");
  };

  const confirmReject = () => {
    const draft = bankDraft();
    if (!draft) return;
    const now = new Date().toISOString();
    const note = rejectNote.trim();
    const decide = <T extends TwinDraft>(d: T): T => ({
      ...d,
      status: "rejected" as const,
      autoApproved: false,
      decidedAt: now,
      rejectReason,
      ...(note ? { rejectNote: note } : {}),
    });

    // The gate may already have banked this exact message as approved. Overturning
    // that verdict must edit the record, not add a second one — otherwise the
    // rejection tally (and the audit trail) double-counts.
    const bankedId = autoBankedIdRef.current;
    const alreadyBanked = bankedId !== null && state.drafts.some((d) => d.id === bankedId);
    onCommit({
      ...state,
      drafts: alreadyBanked
        ? state.drafts.map((d) => (d.id === bankedId ? decide(d) : d))
        : [...state.drafts, decide(draft)],
    });
    autoBankedIdRef.current = null;
    setRejecting(null);
    setRejectNote("");
    ai.reset();
    setSeededReply(null);
  };

  /** Ask the server to deliver an approved draft through its connector. The server
   *  re-reads the SAVED state, so this cannot smuggle an unapproved message out. */
  const send = async (draftId: string) => {
    setSendingId(draftId);
    setSendNote(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/twin/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      const json = await res.json();
      if (res.ok) {
        setSendNote(json.detail ?? t("manualNote"));
        onCommit({
          ...state,
          drafts: state.drafts.map((d) =>
            d.id === draftId ? { ...d, status: "sent" as const, sentAt: json.sentAt } : d
          ),
        });
      } else {
        setSendNote(json.error ?? t("manualNote"));
      }
    } catch {
      // Offline / demo project: the draft stays approved and the human copies it.
      setSendNote(t("manualNote"));
    } finally {
      setSendingId(null);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1300);
    } catch {
      /* clipboard unavailable */
    }
  };

  const autonomyLabel =
    cfg.autonomy === "review"
      ? t("autonomyReview")
      : cfg.autonomy === "assist"
        ? t("autonomyAssist")
        : t("autonomyAuto", { n: cfg.autoThreshold });

  const justApproved = pendingId ? state.drafts.find((d) => d.id === pendingId) ?? null : null;

  return (
    <div className="space-y-5">
      {/* Channel picker + autonomy badge */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="twin-outbox-channel" className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("channel")}
          </label>
          <select
            id="twin-outbox-channel"
            value={channel}
            onChange={(e) => {
              onChannel(e.target.value as TwinChannel);
              setSeededReply(null);
              setPendingId(null);
              setSendNote(null);
            }}
            className={`${inputClass} mt-1.5 max-w-xs`}
          >
            {TWIN_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c][L]}
              </option>
            ))}
          </select>
        </div>
        <span className="pill bg-navy-50 text-muted">{autonomyLabel}</span>
      </div>

      {!cfg.enabled && (
        <p className="rounded-card border border-line bg-canvas px-4 py-3 text-sm text-muted">
          {t("disabledChannel")}
        </p>
      )}

      {rejectedCount > 0 && (
        <p className="text-xs text-muted">{t("learned", { n: rejectedCount })}</p>
      )}

      {/* `leads` renders the purpose-built inbox below this component, so the free-form
          composer would be a second, conflicting entry point. */}
      {channel !== "leads" && cfg.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_2fr]">
            <div>
              <label htmlFor="twin-contact" className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("contact")}
              </label>
              <input
                id="twin-contact"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t("contactPlaceholder")}
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="twin-inbound" className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("inbound")}
              </label>
              <textarea
                id="twin-inbound"
                value={inbound}
                onChange={(e) => setInbound(e.target.value)}
                rows={4}
                placeholder={t("inboundPlaceholder")}
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={runDraft}
            disabled={!inbound.trim() || ai.status === "loading" || cfg.autonomy === "review"}
            className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles width={16} height={16} className={ai.status === "loading" ? "animate-pulse" : ""} />
            {ai.status === "loading" ? t("drafting") : result ? t("regenerate") : t("draft")}
          </button>

          {ai.status === "loading" && <LoadingTimer expectedMs={ai.expectedMs} />}
          {ai.status === "error" &&
            (ai.timedOut ? (
              <TimeoutState onRetry={runDraft} />
            ) : (
              <ToolError message={ai.error ?? ""} onRetry={runDraft} retryIn={ai.retryIn} upgradeUrl={ai.upgradeUrl} />
            ))}

          {/* The live draft */}
          {result && (
            <section className="animate-fade-up space-y-3 rounded-card border border-brand-200 bg-brand-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("reply")}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold uppercase tracking-wide text-muted">{t("confidence")}</span>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-navy-50" aria-hidden>
                    <span
                      className={`block h-full rounded-full ${result.confidence >= 80 ? "bg-positive" : result.confidence >= 50 ? "bg-coral-500" : "bg-negative"}`}
                      style={{ width: `${result.confidence}%` }}
                    />
                  </span>
                  <span className="tnum font-semibold text-navy-800">{result.confidence}</span>
                  {result.risks.length === 0 && <Pill tone="positive">{t("noRisks")}</Pill>}
                </div>
              </div>

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={7}
                className="w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-navy-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
              />

              {result.risks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("risks")}</p>
                  <ul className="mt-1 space-y-1 rounded-lg bg-coral-soft px-3 py-2">
                    {result.risks.map((r, i) => (
                      <li key={i} className="text-xs leading-relaxed text-navy-700">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.questions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("questions")}</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {result.questions.map((q, i) => (
                      <li key={i} className="text-xs leading-relaxed text-navy-700">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.toneNotes && (
                <p className="text-xs italic text-muted">
                  {t("toneNotes")}: {result.toneNotes}
                </p>
              )}

              {rejecting === "live" ? (
                <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
                  <p className="text-xs font-semibold text-navy-800">{t("rejectWhy")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REJECT_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRejectReason(r)}
                        aria-pressed={rejectReason === r}
                        className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          rejectReason === r
                            ? "border-brand-400 bg-brand-50 text-brand-800"
                            : "border-line text-muted hover:border-navy-200"
                        }`}
                      >
                        {REASON_LABELS[r][L]}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder={t("rejectNote")}
                    className={inputClass}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={confirmReject}
                      className="rounded-pill bg-negative px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      {t("confirmReject")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejecting(null)}
                      className="rounded-pill border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-navy-800"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {verdict?.autoApproved ? (
                    // Already banked by the autonomy gate — offering "Approve" here
                    // would create a second, duplicate record.
                    <Pill tone="positive">
                      <Check width={12} height={12} />
                      {t("autoApproved")}
                    </Pill>
                  ) : (
                    <button
                      type="button"
                      onClick={approve}
                      className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      <Check width={13} height={13} />
                      {t("approve")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRejecting("live")}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-negative/40 hover:text-negative"
                  >
                    <Close width={13} height={13} />
                    {t("reject")}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(replyText)}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-navy-800"
                  >
                    <Copy width={13} height={13} />
                    {copied ? t("copied") : t("copy")}
                  </button>
                </div>
              )}
              {ai.canRefine && <RefineBar onRefine={ai.refine} />}
            </section>
          )}

          {/* An approved draft awaiting delivery */}
          {justApproved && justApproved.status === "approved" && (
            <div className="flex flex-wrap items-center gap-2 rounded-card border border-positive/40 bg-positive-soft px-4 py-3">
              <Pill tone="positive">
                {justApproved.autoApproved ? t("autoApproved") : t("approved")}
              </Pill>
              <button
                type="button"
                onClick={() => send(justApproved.id)}
                disabled={sendingId === justApproved.id}
                className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                <Send width={13} height={13} />
                {sendingId === justApproved.id ? t("sending") : t("send")}
              </button>
              <button
                type="button"
                onClick={() => copy(justApproved.reply)}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-navy-800"
              >
                <Copy width={13} height={13} />
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
          )}
          {sendNote && <p className="text-xs text-muted">{sendNote}</p>}
        </>
      )}

      {/* History */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("history")}</p>
        {channelDrafts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("noHistory")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {channelDrafts.map((d) => (
              <li key={d.id} className="rounded-card border border-line bg-surface px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill
                    tone={
                      d.status === "sent" || d.status === "approved"
                        ? "positive"
                        : d.status === "rejected"
                          ? "negative"
                          : "neutral"
                    }
                  >
                    {d.status === "sent"
                      ? t("sent")
                      : d.status === "approved"
                        ? d.autoApproved
                          ? t("autoApproved")
                          : t("approved")
                        : d.status === "rejected"
                          ? t("rejected")
                          : t("needsReview")}
                  </Pill>
                  {d.contact && <span className="text-xs font-medium text-navy-800">{d.contact}</span>}
                  <span className="tnum text-xs text-muted">{d.confidence} %</span>
                  {d.rejectReason && (
                    <span className="pill bg-navy-50 text-muted">{REASON_LABELS[d.rejectReason][L]}</span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-navy-700">{d.reply}</p>
                {d.status === "approved" && (
                  <button
                    type="button"
                    onClick={() => send(d.id)}
                    disabled={sendingId === d.id}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-navy-800 disabled:opacity-50"
                  >
                    <Send width={12} height={12} />
                    {sendingId === d.id ? t("sending") : t("send")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
