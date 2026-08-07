/** Twin domain model — the project's communication double: a per-channel voice it
 *  has been trained on, and the drafts it writes in that voice for a human to
 *  approve. Framework-free (no React, no firebase) so the client shell, the server
 *  store and the AI tools can all import it.
 *
 *  Ported from the `twin` plugin of the personas app, with its personal-assistant
 *  half deliberately left behind: there is no TTS voice, no Obsidian wiki, no
 *  vector knowledge base and no multi-twin `is_active` flag here. In Adamant the
 *  PROJECT is the twin — one brand, one voice, many channels — and the grounding
 *  the personas twin got from a distilled-fact table comes from the catalog
 *  Offering spine instead (see lib/brand/context).
 *
 *  Everything the wire can supply passes through `sanitizeTwinState` first: the
 *  client owns this blob (it POSTs the whole thing), so nothing here may be trusted. */

/* -------------------------------------------------------------------------- */
/*  Channels + tone scopes                                                     */
/* -------------------------------------------------------------------------- */

/** Where the twin speaks. `leads` is the absorbed speed-to-lead inbox (the old
 *  Rychlá reakce module); the rest are conversational surfaces. */
export const TWIN_CHANNELS = ["leads", "email", "chat", "social", "reviews", "sms", "whatsapp"] as const;
export type TwinChannel = (typeof TWIN_CHANNELS)[number];

/** A voice is stored per channel, plus one `generic` register used as the fallback
 *  when a channel has no voice of its own — the same two-tier resolution the
 *  personas twin used (`tone_key = requested ?? channel`, then generic). */
export const TONE_SCOPES = ["generic", ...TWIN_CHANNELS] as const;
export type ToneScope = (typeof TONE_SCOPES)[number];

export function isTwinChannel(v: unknown): v is TwinChannel {
  return typeof v === "string" && (TWIN_CHANNELS as readonly string[]).includes(v);
}

export function isToneScope(v: unknown): v is ToneScope {
  return typeof v === "string" && (TONE_SCOPES as readonly string[]).includes(v);
}

/* -------------------------------------------------------------------------- */
/*  The voice                                                                  */
/* -------------------------------------------------------------------------- */

/** A single "always / never" rule. Rendered as a chip in the editor and injected
 *  verbatim into the draft prompt, so the model obeys the brand's hard lines
 *  („nikdy neslibuj termín", „vždy nabídni zpětné zavolání"). */
export interface VoiceConstraint {
  kind: "do" | "dont";
  rule: string;
}

/** How the brand sounds on one channel. `directives` is a prompt fragment written
 *  in the second person and injected as-is — it is the heart of the trained voice;
 *  the rest steers length, adds hard rules and gives the model something to imitate. */
export interface TwinVoice {
  scope: ToneScope;
  /** free-text style guide, injected verbatim into the draft prompt */
  directives: string;
  /** short adjectives ("věcný", "vřelý") — display + prompt seasoning */
  traits: string[];
  /** e.g. "2–4 věty" */
  lengthHint: string;
  constraints: VoiceConstraint[];
  /** real messages in this voice, used as few-shot examples at draft time */
  examples: string[];
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Autonomy + channel configuration                                           */
/* -------------------------------------------------------------------------- */

/** How much rope the twin gets on a channel.
 *   - `review` — the twin never drafts unasked; a human writes.
 *   - `assist` — the twin drafts, a human approves every message. (default)
 *   - `auto`   — the twin drafts AND self-approves, but only when it is confident
 *                and flagged no risks. Everything else still falls to a human.
 *  The personas plugin had no autonomy at all (every reply was hand-approved);
 *  `auto` is the semi-automation this app asked for, and `decideDraft` below is
 *  the single place the escalation rule lives. */
export const AUTONOMY_LEVELS = ["review", "assist", "auto"] as const;
export type Autonomy = (typeof AUTONOMY_LEVELS)[number];

export interface TwinChannelConfig {
  channel: TwinChannel;
  enabled: boolean;
  autonomy: Autonomy;
  /** which connector delivers an approved draft (see ./connectors) */
  connector: string;
  /** confidence (0–100) an `auto` draft must clear to self-approve */
  autoThreshold: number;
}

export const DEFAULT_AUTO_THRESHOLD = 80;

/** How far below a channel's confidence bar (`autoThreshold`) a draft may still sit and
 *  read as "close" (coral) rather than "well short" (red) on the outbox confidence meter. */
export const CONFIDENCE_WARN_MARGIN = 15;

export type ConfidenceTone = "positive" | "coral" | "negative";

/** The outbox confidence-meter colour, keyed to the CHANNEL'S own bar (`autoThreshold`,
 *  50–100 and user-configurable) plus its risks — not two hardcoded magic numbers that
 *  disagreed with the autonomy verdict shown next to the meter. Green: at/above the bar
 *  with no risks (what the gate would clear). Coral: within CONFIDENCE_WARN_MARGIN below
 *  the bar, or above it but carrying a risk (a human read is still owed). Red: well below.
 *  Pure so the meter and the gate can never drift. */
export function confidenceTone(confidence: number, threshold: number, riskCount: number): ConfidenceTone {
  if (confidence >= threshold) return riskCount > 0 ? "coral" : "positive";
  if (confidence >= threshold - CONFIDENCE_WARN_MARGIN) return "coral";
  return "negative";
}

/* -------------------------------------------------------------------------- */
/*  Training material                                                          */
/* -------------------------------------------------------------------------- */

/** One piece of evidence about how the brand talks: either a real past message the
 *  user pasted (`sample`), or their answer to a question the twin asked because it
 *  could not tell from the samples alone (`interview`). Both feed the next
 *  `twin-style` distillation — this is the training loop. */
export type StyleFactSource = "sample" | "interview";

export interface TwinStyleFact {
  id: string;
  scope: ToneScope;
  /** the twin's question — empty for a pasted sample */
  question: string;
  /** the human's answer, or the pasted message itself */
  answer: string;
  source: StyleFactSource;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Drafts (the outbox)                                                        */
/* -------------------------------------------------------------------------- */

/** Unlike the personas plugin — where a draft was ephemeral in-memory state and
 *  only the approved message was ever persisted — a draft here is a real record
 *  with a lifecycle, because `auto` mode means a message can reach `approved`
 *  with no human in the loop and someone has to be able to audit that later. */
export const DRAFT_STATUSES = ["pending", "approved", "sent", "rejected"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** Why a human turned a draft down. Fixed presets (not free text) because these
 *  are counted: `rejectionPatterns` turns the tally into "avoid" directives fed
 *  back into the next draft prompt. Free-text notes ride alongside in `rejectNote`. */
export const REJECT_REASONS = ["off_brand", "inaccurate", "too_long", "wrong_tone", "risky_claim"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export interface TwinDraft {
  id: string;
  channel: TwinChannel;
  /** who it is addressed to (a name or handle) */
  contact: string;
  /** the inbound message being answered */
  inbound: string;
  /** the drafted reply, as edited by the human */
  reply: string;
  /** follow-up questions the twin wants answered (lead qualification) */
  questions: string[];
  /** the model's own 0–100 confidence that this is send-ready */
  confidence: number;
  /** things a human should look at before sending — non-empty blocks `auto` */
  risks: string[];
  status: DraftStatus;
  /** true when `auto` mode approved this without a human */
  autoApproved: boolean;
  rejectReason?: RejectReason;
  rejectNote?: string;
  createdAt: string;
  decidedAt?: string;
  sentAt?: string;
}

/* -------------------------------------------------------------------------- */
/*  The persisted blob                                                         */
/* -------------------------------------------------------------------------- */

export interface TwinState {
  voices: TwinVoice[];
  channels: TwinChannelConfig[];
  facts: TwinStyleFact[];
  drafts: TwinDraft[];
  updatedAt?: string;
}

/* -------------------------------------------------------------------------- */
/*  Pure resolution + policy                                                   */
/* -------------------------------------------------------------------------- */

/** The voice that governs a scope: its own, else the `generic` register, else
 *  nothing. `override` lets an operator draft for one channel in another's voice
 *  (the personas "tone register" dropdown) without editing any stored voice.
 *  Takes a `ToneScope` rather than a `TwinChannel` so the server-side loader can
 *  ask for `generic` directly (every channel is already a scope). */
export function resolveVoice(
  voices: TwinVoice[],
  scope: ToneScope,
  override?: ToneScope
): TwinVoice | null {
  const key = override ?? scope;
  return voices.find((v) => v.scope === key) ?? voices.find((v) => v.scope === "generic") ?? null;
}

export function channelConfig(channels: TwinChannelConfig[], channel: TwinChannel): TwinChannelConfig {
  return (
    channels.find((c) => c.channel === channel) ?? {
      channel,
      enabled: false,
      autonomy: "assist",
      connector: "manual",
      autoThreshold: DEFAULT_AUTO_THRESHOLD,
    }
  );
}

/** Whether the twin may DRAFT on a channel at all — the rule behind Správa kanálů's
 *  promise „Twin na tomto kanálu nepíše": a disabled channel and a `review`
 *  (human-only) channel both refuse twin drafting. One pure function so the server
 *  gate (the twin-reply mode's prepare) and every drafting UI (the outbox composer,
 *  the leads inbox) can never drift on what "locked" means. Distinct from
 *  `decideDraft`, which governs the pending↔approved verdict of a draft that was
 *  ALLOWED to exist. */
export type DraftGateVerdict = { allowed: true } | { allowed: false; reason: "disabled" | "review" };

export function draftGateVerdict(cfg: TwinChannelConfig): DraftGateVerdict {
  if (!cfg.enabled) return { allowed: false, reason: "disabled" };
  if (cfg.autonomy === "review") return { allowed: false, reason: "review" };
  return { allowed: true };
}

/** The autonomy gate. A freshly generated draft is `approved` only on an ENABLED
 *  channel, under `auto`, above the channel's confidence bar, AND with no flagged
 *  risks — a risk always buys a human read, however confident the model claims to be.
 *  A disabled channel (one the operator switched off, even if its stored config still
 *  says `auto`) may still receive a pending draft but never a self-approved one — the
 *  exact trust breach the autonomy tiers exist to prevent. Everything else lands in
 *  `pending`. Pure: the one rule, in one place, so callers never re-check `enabled`. */
export function decideDraft(
  cfg: TwinChannelConfig,
  draft: { confidence: number; risks: string[] }
): { status: DraftStatus; autoApproved: boolean } {
  const clears =
    cfg.enabled && cfg.autonomy === "auto" && draft.confidence >= cfg.autoThreshold && draft.risks.length === 0;
  return clears ? { status: "approved", autoApproved: true } : { status: "pending", autoApproved: false };
}

/** True for a draft in a terminal lifecycle state — past the autonomy gate's reach and
 *  a completed audit event. A terminal state must never be un-set by a later write. */
export function isTerminalDraft(d: Pick<TwinDraft, "status">): boolean {
  return d.status === "sent" || d.status === "rejected";
}

/** Merge STORED terminal statuses over a POSTed blob: when a stored draft for the
 *  same id is terminal (`sent`/`rejected`), the STORED record wins outright —
 *  whatever the posted copy claims. A terminal record is a frozen audit event: a
 *  stale client copy (a send that landed after the client last read) must not flip
 *  a `sent` draft back to `approved` (erasing the send from the audit trail and
 *  making it send-eligible again), and a posted copy that is still terminal must
 *  not rewrite the frozen record's reply or stamps either. Pure/total, so it can
 *  run inside the atomic mutate that closes the check-then-act gap. */
export function mergeTerminalDrafts(stored: TwinDraft[] | null | undefined, posted: TwinDraft[]): TwinDraft[] {
  if (!stored || stored.length === 0) return posted;
  const terminalById = new Map<string, TwinDraft>();
  for (const d of stored) if (isTerminalDraft(d)) terminalById.set(d.id, d);
  if (terminalById.size === 0) return posted;
  return posted.map((d) => terminalById.get(d.id) ?? d);
}

/** SERVER-MINTED SENDS ("sent means sent"). The `approved → sent` transition is
 *  owned by `send/route.ts`'s atomic claim — a `sent` record asserts that the claim
 *  path ran (delivering through a real connector, or recording the human's own
 *  manual send). A client may therefore never POST a NEW `sent` record into
 *  existence: a posted draft claiming `sent` that the STORE does not already know
 *  as sent is demoted to `approved` — the strongest status a client may assert —
 *  with its `sentAt` stripped and any machine-approval claim cleared (the autonomy
 *  gate never judged it: `enforceAutonomy` skips terminal drafts, and the next save
 *  re-derives the bit anyway). A store-corroborated `sent` passes through for
 *  `mergeTerminalDrafts` to resolve (the stored record then wins wholesale).
 *  Client-asserted `rejected` stays legal — a human rejection is a genuinely
 *  client-side decision, like approval. Pure/total — runs inside the atomic mutate,
 *  BEFORE the terminal merge. */
export function enforceServerSent(stored: TwinDraft[] | null | undefined, posted: TwinDraft[]): TwinDraft[] {
  const sentIds = new Set((stored ?? []).filter((d) => d.status === "sent").map((d) => d.id));
  return posted.map((d) => {
    if (d.status !== "sent" || sentIds.has(d.id)) return d;
    const demoted: TwinDraft = { ...d, status: "approved", autoApproved: false };
    delete demoted.sentAt;
    return demoted;
  });
}

/** Tally why humans have been rejecting this channel's drafts. Feeds the "avoid"
 *  block of the next draft prompt, so the twin stops repeating the mistake — the
 *  personas RejectionPatternsPanel loop, pointed at replies instead of memories. */
export function rejectionPatterns(
  drafts: TwinDraft[],
  channel?: TwinChannel
): { reason: RejectReason; count: number }[] {
  const tally = new Map<RejectReason, number>();
  for (const d of drafts) {
    if (d.status !== "rejected" || !d.rejectReason) continue;
    if (channel && d.channel !== channel) continue;
    tally.set(d.rejectReason, (tally.get(d.rejectReason) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/** The locale of the avoid context. The twin's directives are grounding text in the
 *  USER prompt, so switching them per project locale never moves a golden fingerprint. */
export type AvoidLocale = "cs" | "en";

/** The Czech instruction each rejection reason turns into, so a tally of past
 *  human "no"s becomes a constraint on the next generation. */
const AVOID_CS: Record<RejectReason, string> = {
  off_brand: "Drž se přesně hlasu značky — poslední odpovědi byly odmítnuty jako mimo tón značky.",
  inaccurate: "Netvrď nic, co není v podkladech — poslední odpovědi byly odmítnuty jako nepřesné.",
  too_long: "Piš výrazně kratší odpověď — poslední odpovědi byly odmítnuty jako příliš dlouhé.",
  wrong_tone: "Uprav tón (formálnost i vřelost) — poslední odpovědi měly špatný tón.",
  risky_claim: "Nedávej žádné sliby o cenách, termínech ani výsledcích — poslední odpovědi obsahovaly rizikové sliby.",
};

/** The English mirror, for an `en` project — the loop was Czech-only before. */
const AVOID_EN: Record<RejectReason, string> = {
  off_brand: "Stick precisely to the brand voice — recent replies were rejected as off-brand.",
  inaccurate: "Claim nothing that isn't in the source material — recent replies were rejected as inaccurate.",
  too_long: "Write a markedly shorter reply — recent replies were rejected as too long.",
  wrong_tone: "Adjust the tone (formality and warmth) — recent replies had the wrong tone.",
  risky_claim: "Make no promises about prices, deadlines or outcomes — recent replies contained risky claims.",
};

const AVOID_MAP: Record<AvoidLocale, Record<RejectReason, string>> = { cs: AVOID_CS, en: AVOID_EN };

/** Top-N rejection reasons rendered as prompt directives, in the project's locale.
 *  Defaults to `cs` so existing callers (and the golden) stay byte-identical. */
export function avoidDirectives(
  patterns: { reason: RejectReason; count: number }[],
  locale: AvoidLocale = "cs",
  limit = 3
): string[] {
  const map = AVOID_MAP[locale] ?? AVOID_CS;
  return patterns.slice(0, limit).map((p) => map[p.reason]);
}

/** How many free-text reject NOTES fold into the avoid context, and how long each
 *  may be. Documented bounds: the counted reasons are the strong signal; the notes
 *  add the specific "why" a human typed, newest first. */
export const REJECT_NOTE_CAP = 5;
export const REJECT_NOTE_MAXLEN = 200;

const NOTE_AVOID_PREFIX: Record<AvoidLocale, string> = {
  cs: "Člověk u dřívějšího zamítnutí napsal: ",
  en: "A human wrote on an earlier rejection: ",
};

/** The most-recent, non-empty, de-duplicated reject notes — newest first (by the
 *  decision stamp), each length-clamped, capped. Pure selection over the same
 *  drafts the tally reads; the caller merges the bounded archive in first so an old
 *  lesson survives its draft aging out of the hot blob. */
export function recentRejectNotes(
  drafts: TwinDraft[],
  channel?: TwinChannel,
  cap = REJECT_NOTE_CAP,
  maxLen = REJECT_NOTE_MAXLEN
): string[] {
  const rejected = drafts
    .filter((d) => d.status === "rejected" && (!channel || d.channel === channel))
    .map((d) => ({ note: (d.rejectNote ?? "").trim(), at: d.decidedAt ?? d.createdAt }))
    .filter((x) => x.note.length > 0)
    // ISO stamps sort lexicographically; descending = newest first.
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const out: string[] = [];
  const seen = new Set<string>();
  for (const { note } of rejected) {
    const clamped = note.slice(0, maxLen);
    const key = clamped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clamped);
    if (out.length >= cap) break;
  }
  return out;
}

/** Reject notes rendered as avoid-context lines, prefixed per locale. */
export function rejectNoteDirectives(
  drafts: TwinDraft[],
  channel: TwinChannel | undefined,
  locale: AvoidLocale = "cs",
  cap = REJECT_NOTE_CAP
): string[] {
  const prefix = NOTE_AVOID_PREFIX[locale] ?? NOTE_AVOID_PREFIX.cs;
  return recentRejectNotes(drafts, channel, cap).map((n) => `${prefix}${n}`);
}

/** The full avoid context for a channel: the counted-reason directives first (the
 *  strongest, tallied signal), then the most-recent free-text reject notes (what a
 *  human actually said). Both locale-aware; pure over drafts the caller has already
 *  merged with the bounded reject archive. */
export function twinAvoidContext(
  drafts: TwinDraft[],
  channel: TwinChannel | undefined,
  locale: AvoidLocale = "cs"
): string[] {
  const directives = avoidDirectives(rejectionPatterns(drafts, channel), locale);
  const notes = rejectNoteDirectives(drafts, channel, locale);
  return [...directives, ...notes];
}

/* -------------------------------------------------------------------------- */
/*  Wire sanitizers — never trust the client's blob                            */
/* -------------------------------------------------------------------------- */

const MAX_VOICES = TONE_SCOPES.length;
const MAX_FACTS = 200;
/** The wire boundary's HARD safety ceiling on the drafts array — a bound on the
 *  POST payload, NOT the hot-blob policy. Sanitize must no longer silently slice
 *  audit records at 200 (the old MAX_DRAFTS): the server route splits live vs.
 *  terminal drafts and ARCHIVES the overflow instead (see lib/twin/archive +
 *  archive-store). This ceiling only guards against a pathological megablob; a
 *  legacy oversized blob up to this size survives sanitize so the route can archive
 *  it on first save. */
const MAX_DRAFTS_WIRE = 2000;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

const strList = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => str(x, maxLen))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};

const iso = (v: unknown): string => {
  const s = typeof v === "string" ? v : "";
  return s && !Number.isNaN(Date.parse(s)) ? s : new Date(0).toISOString();
};

function sanitizeConstraints(v: unknown): VoiceConstraint[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const o = raw as Record<string, unknown> | null;
      const rule = str(o?.rule, 200);
      if (!rule) return null;
      return { kind: o?.kind === "dont" ? "dont" : "do", rule } as VoiceConstraint;
    })
    .filter((c): c is VoiceConstraint => c !== null)
    .slice(0, 12);
}

export function sanitizeVoice(raw: unknown): TwinVoice | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || !isToneScope(o.scope)) return null;
  return {
    scope: o.scope,
    directives: str(o.directives, 2000),
    traits: strList(o.traits, 8, 40),
    lengthHint: str(o.lengthHint, 60),
    constraints: sanitizeConstraints(o.constraints),
    examples: strList(o.examples, 6, 1200),
    updatedAt: iso(o.updatedAt),
  };
}

export function sanitizeChannelConfig(raw: unknown): TwinChannelConfig | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || !isTwinChannel(o.channel)) return null;
  const autonomy = (AUTONOMY_LEVELS as readonly string[]).includes(o.autonomy as string)
    ? (o.autonomy as Autonomy)
    : "assist";
  return {
    channel: o.channel,
    enabled: o.enabled === true,
    autonomy,
    // Shape-only here (client-safe): the connector is free-text-bounded. The twin save
    // route reconciles it to a known+configured id (storableConnectorId) — "configured"
    // is env-dependent, so it can't live in this client-imported module.
    connector: str(o.connector, 40) || "manual",
    autoThreshold: clamp(o.autoThreshold, 50, 100, DEFAULT_AUTO_THRESHOLD),
  };
}

function sanitizeFact(raw: unknown, i: number): TwinStyleFact | null {
  const o = raw as Record<string, unknown> | null;
  if (!o) return null;
  const answer = str(o.answer, 2000);
  if (!answer) return null;
  return {
    id: str(o.id, 60) || `f${i}`,
    scope: isToneScope(o.scope) ? o.scope : "generic",
    question: str(o.question, 400),
    answer,
    source: o.source === "interview" ? "interview" : "sample",
    createdAt: iso(o.createdAt),
  };
}

/** Coerce one wire draft into a bounded record. NOTE ON THE AUDIT TRAIL: the
 *  lifecycle fields (`status`, `autoApproved`, `decidedAt`, `sentAt`) are only
 *  SHAPE-checked here, not authenticated — this sanitizer runs on a client POST that
 *  owns the whole blob. They are made trustworthy downstream, not here: the twin POST
 *  route re-derives `autoApproved` from the gate (`enforceAutonomy`) so it can't be
 *  forged or laundered, `send/route.ts` is the sole writer of `sent`/`sentAt`
 *  (ENFORCED: the twin POST route runs `enforceServerSent`, demoting any freshly
 *  client-claimed `sent` to `approved`), and `mergeTerminalDrafts` keeps a STORED
 *  terminal (`sent`/`rejected`) record from being rewritten by a posted blob. A raw
 *  `sanitizeDraft` result on its own is NOT an audit trail — always pair it with
 *  those route-level guards. */
function sanitizeDraft(raw: unknown, i: number): TwinDraft | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || !isTwinChannel(o.channel)) return null;
  const reply = str(o.reply, 4000);
  if (!reply) return null;
  const status = (DRAFT_STATUSES as readonly string[]).includes(o.status as string)
    ? (o.status as DraftStatus)
    : "pending";
  const rejectReason = (REJECT_REASONS as readonly string[]).includes(o.rejectReason as string)
    ? (o.rejectReason as RejectReason)
    : undefined;
  const draft: TwinDraft = {
    id: str(o.id, 60) || `d${i}`,
    channel: o.channel,
    contact: str(o.contact, 120),
    inbound: str(o.inbound, 4000),
    reply,
    questions: strList(o.questions, 5, 300),
    confidence: clamp(o.confidence, 0, 100, 0),
    risks: strList(o.risks, 5, 300),
    status,
    autoApproved: o.autoApproved === true,
    createdAt: iso(o.createdAt),
  };
  if (rejectReason) draft.rejectReason = rejectReason;
  const note = str(o.rejectNote, 400);
  if (note) draft.rejectNote = note;
  if (typeof o.decidedAt === "string") draft.decidedAt = iso(o.decidedAt);
  if (typeof o.sentAt === "string") draft.sentAt = iso(o.sentAt);
  return draft;
}

/** Coerce an arbitrary client payload into a bounded, well-typed `TwinState`. */
export function sanitizeTwinState(raw: unknown): TwinState {
  const o = (raw ?? {}) as Record<string, unknown>;
  const voices = Array.isArray(o.voices)
    ? o.voices.map(sanitizeVoice).filter((v): v is TwinVoice => v !== null)
    : [];
  // One voice per scope — a duplicate scope would make `resolveVoice` order-dependent.
  const byScope = new Map<ToneScope, TwinVoice>();
  for (const v of voices.slice(0, MAX_VOICES * 2)) byScope.set(v.scope, v);

  const channels = Array.isArray(o.channels)
    ? o.channels.map(sanitizeChannelConfig).filter((c): c is TwinChannelConfig => c !== null)
    : [];
  const byChannel = new Map<TwinChannel, TwinChannelConfig>();
  for (const c of channels) byChannel.set(c.channel, c);

  return {
    voices: [...byScope.values()],
    channels: [...byChannel.values()],
    facts: Array.isArray(o.facts)
      ? o.facts.map(sanitizeFact).filter((f): f is TwinStyleFact => f !== null).slice(0, MAX_FACTS)
      : [],
    drafts: Array.isArray(o.drafts)
      ? o.drafts.map(sanitizeDraft).filter((d): d is TwinDraft => d !== null).slice(0, MAX_DRAFTS_WIRE)
      : [],
  };
}
