"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Bolt, Check, Clock, Close, Info, Refresh, Share, Sparkles } from "@/components/icons";
import { useOptionalProject } from "@/lib/projects/context";
import { useFormatters, useT } from "@/lib/i18n/client";
import {
  PLATFORM_LIMITS,
  POST_STATUS_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  TONES,
  TONE_LABELS,
  type PostStatus,
  type SocialAccount,
  type SocialPlatform,
  type SocialPost,
  type Tone,
} from "@/lib/social/types";
import WeekPlanner from "./WeekPlanner";

const T = {
  cs: {
    signInPrompt: "Přihlaste se a připojte sociální účty. I bez přihlášení si vyzkoušíte návrh, plánování i schránku.",
    signInBtn: "Přihlásit přes Google",
    connectedAccounts: "Připojené účty",
    demoMode: "Ukázkový režim (bez OAuth)",
    newPost: "Nový příspěvek",
    topic: "Téma",
    topicPlaceholder: "Např. nová sezónní směs ořechů",
    tone: "Tón",
    brandVoice: "Hlas značky (volitelné)",
    brandPlaceholder: "Co prodáváte + jak mluvíte — např. Mionelo: ořechy a superpotraviny, přátelsky a autenticky",
    brandHint: "AI píše v hlase vaší značky, ne genericky.",
    brandAuto: "Píše na značku podle katalogu:",
    draftPlatforms: "Platformy pro návrh",
    templateBtn: "Šablona",
    drafting: "Navrhuji…",
    aiBtn: "Navrhnout s AI",
    aiWriting: "AI píše…",
    aiDraft: "AI návrh",
    demoSource: "Ukázkový režim",
    templateSource: "Šablona",
    useBtn: "Použít",
    postToPublish: "Příspěvek k publikaci",
    postPlaceholder: "Napište příspěvek nebo použijte návrh výše…",
    scheduleLabel: "Naplánovat na (volitelné)",
    saving: "Ukládám…",
    schedule: "Naplánovat",
    publishNow: "Zveřejnit teď",
    posts: "Příspěvky",
    refresh: "Obnovit",
    loading: "Načítám…",
    noPosts: "Zatím žádné příspěvky. Vytvořte první vlevo.",
    deleteAriaLabel: "Delete",
    scheduledAt: "scheduled for {dt}",
    publishedAt: "published {rel}",
    createdAt: "created {rel}",
    link: "link",
    demoLink: "ukázka — nezveřejněno",
    inboxTitle: "Inbox — comments & messages",
    pending: "{n} pending",
    loadingInbox: "Loading inbox…",
    comment: "comment",
    replied: "Replied",
    replyHint: "Suggested reply — edit and approve",
    sending: "Sending…",
    approveAndSend: "Approve & send",
    draftFailed: "Draft failed.",
    serverError: "Could not reach the server.",
    saveFailed: "Save failed.",
  },
  en: {
    signInPrompt: "Sign in to connect your social accounts. You can still preview drafts, scheduling, and the inbox without signing in.",
    signInBtn: "Sign in with Google",
    connectedAccounts: "Connected accounts",
    demoMode: "Demo mode (no OAuth)",
    newPost: "New post",
    topic: "Topic",
    topicPlaceholder: "e.g. new seasonal nut blend",
    tone: "Tone",
    brandVoice: "Brand voice (optional)",
    brandPlaceholder: "What you sell + how you talk — e.g. Mionelo: nuts & superfoods, friendly and authentic",
    brandHint: "AI writes in your brand voice, not generically.",
    brandAuto: "Writing on-brand from your catalogue:",
    draftPlatforms: "Platforms to draft for",
    templateBtn: "Template",
    drafting: "Drafting…",
    aiBtn: "Draft with AI",
    aiWriting: "AI writing…",
    aiDraft: "AI draft",
    demoSource: "Demo mode",
    templateSource: "Template",
    useBtn: "Use",
    postToPublish: "Post to publish",
    postPlaceholder: "Write a post or use a draft above…",
    scheduleLabel: "Schedule for (optional)",
    saving: "Saving…",
    schedule: "Schedule",
    publishNow: "Publish now",
    posts: "Posts",
    refresh: "Refresh",
    loading: "Loading…",
    noPosts: "No posts yet. Create your first one on the left.",
    deleteAriaLabel: "Delete",
    scheduledAt: "scheduled for {dt}",
    publishedAt: "published {rel}",
    createdAt: "created {rel}",
    link: "link",
    demoLink: "demo — not actually posted",
    inboxTitle: "Inbox — comments & messages",
    pending: "{n} pending",
    loadingInbox: "Loading inbox…",
    comment: "comment",
    replied: "Replied",
    replyHint: "Suggested reply — edit and approve",
    sending: "Sending…",
    approveAndSend: "Approve & send",
    draftFailed: "Draft failed.",
    serverError: "Could not reach the server.",
    saveFailed: "Save failed.",
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

const STATUS_TONE: Record<PostStatus, string> = {
  draft: "bg-navy-50 text-muted",
  scheduled: "bg-brand-50 text-brand-800",
  published: "bg-positive-soft text-positive",
  failed: "bg-negative-soft text-negative",
};

export default function SocialClient() {
  return (
    <div className="space-y-8">
      <AccountsBar />
      <WeekPlanner />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr] lg:items-start">
        <Composer />
        <PostsList />
      </div>
      <Inbox />
    </div>
  );
}

// --- accounts ----------------------------------------------------------------

function AccountsBar() {
  const { status } = useSession();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const t = useT(T);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/social/accounts");
      const json = (await res.json()) as { configured?: boolean; accounts?: SocialAccount[] };
      setConfigured(Boolean(json.configured));
      setAccounts(json.accounts ?? []);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load]);

  const toggle = async (platform: SocialPlatform, connected: boolean) => {
    setBusy(platform);
    try {
      const res = await fetch("/api/social/accounts", {
        method: connected ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      const json = (await res.json()) as { accounts?: SocialAccount[] };
      if (res.ok) setAccounts(json.accounts ?? []);
    } finally {
      setBusy(null);
    }
  };

  if (status !== "authenticated") {
    return (
      <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2.5 text-sm text-navy-700">
          <Share width={18} height={18} className="shrink-0 text-brand-600" />
          {t("signInPrompt")}
        </p>
        <button
          type="button"
          onClick={() => signIn("google")}
          className="shrink-0 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          {t("signInBtn")}
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Share width={17} height={17} className="text-brand-600" />
          {t("connectedAccounts")}
        </h2>
        {!configured && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Info width={13} height={13} />
            {t("demoMode")}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SOCIAL_PLATFORMS.map((p) => {
          const connected = accounts.some((a) => a.platform === p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p, connected)}
              disabled={busy === p}
              className={`inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                connected ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-navy-700 hover:border-brand-300"
              }`}
            >
              {connected ? <Check width={14} height={14} /> : <span aria-hidden>＋</span>}
              {SOCIAL_PLATFORM_LABELS[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- composer ----------------------------------------------------------------

function Composer() {
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("pratelsky");
  const [draftPlatforms, setDraftPlatforms] = useState<Set<SocialPlatform>>(new Set(["instagram", "facebook"]));
  const [drafts, setDrafts] = useState<{ platform: SocialPlatform; content: string }[]>([]);
  const [drafting, setDrafting] = useState<false | "template" | "ai">(false);
  const [draftSource, setDraftSource] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  // Brand voice (what they sell + how they talk) — de-hardcodes the assistant from a
  // single brand; persisted locally so it sticks, and fed to the AI draft as `brand`.
  const [brand, setBrand] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("app:social-brand");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setBrand(saved);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("app:social-brand", brand);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [brand]);
  // C1 unify: the project's auto-derived catalogue voice — used by the server when
  // this field is blank, so show it here too (parity with the WeekPlanner strip).
  const [autoBrand, setAutoBrand] = useState("");
  useEffect(() => {
    if (!pid) return;
    let live = true;
    fetch(`/api/projects/${encodeURIComponent(pid)}/brand-context`)
      .then((r) => (r.ok ? r.json() : { context: "" }))
      .then((j: { context?: string }) => {
        if (live) setAutoBrand(j.context ?? "");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pid]);

  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDraftPlatform = (p: SocialPlatform) =>
    setDraftPlatforms((s) => {
      const next = new Set(s);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const suggest = async (ai: boolean) => {
    if (topic.trim().length < 2 || draftPlatforms.size === 0) return;
    setDrafting(ai ? "ai" : "template");
    setDraftError(null);
    try {
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          tone,
          platforms: [...draftPlatforms],
          ai,
          brand: brand.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDraftError(json?.error ?? t("draftFailed"));
        return;
      }
      setDrafts(json.drafts ?? []);
      setDraftSource(json.source ?? null);
    } catch {
      setDraftError(t("serverError"));
    } finally {
      setDrafting(false);
    }
  };

  const use = (d: { platform: SocialPlatform; content: string }) => {
    setPlatform(d.platform);
    setContent(d.content);
  };

  const submit = async () => {
    if (content.trim().length < 2) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, content, scheduledAt: scheduledAt || undefined, projectId: pid }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? t("saveFailed"));
        return;
      }
      setContent("");
      setScheduledAt("");
      window.dispatchEvent(new CustomEvent("social:posts-changed"));
    } finally {
      setPosting(false);
    }
  };

  const over = content.length > PLATFORM_LIMITS[platform];

  return (
    <div className="card space-y-5 p-6 lg:sticky lg:top-24">
      <h2 className="text-base font-semibold text-navy-800">{t("newPost")}</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("topic")}</span>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t("topicPlaceholder")}
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("tone")}</span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          >
            {TONES.map((tn) => (
              <option key={tn} value={tn}>
                {TONE_LABELS[tn]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("brandVoice")}</span>
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder={t("brandPlaceholder")}
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
        {!brand.trim() && autoBrand ? (
          <span className="mt-1 flex items-start gap-1 text-xs text-positive">
            <Check width={13} height={13} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">{t("brandAuto")}</span> {autoBrand}
            </span>
          </span>
        ) : (
          <span className="mt-1 block text-xs text-muted">{t("brandHint")}</span>
        )}
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("draftPlatforms")}</span>
        <div className="flex flex-wrap gap-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleDraftPlatform(p)}
              className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                draftPlatforms.has(p) ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-navy-200"
              }`}
            >
              {SOCIAL_PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => suggest(false)}
          disabled={Boolean(drafting) || topic.trim().length < 2 || draftPlatforms.size === 0}
          className="inline-flex items-center justify-center gap-2 rounded-pill border border-line px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
        >
          <Bolt width={15} height={15} />
          {drafting === "template" ? t("drafting") : t("templateBtn")}
        </button>
        <button
          type="button"
          onClick={() => suggest(true)}
          disabled={Boolean(drafting) || topic.trim().length < 2 || draftPlatforms.size === 0}
          className="inline-flex items-center justify-center gap-2 rounded-pill bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          <Sparkles width={15} height={15} />
          {drafting === "ai" ? t("aiWriting") : t("aiBtn")}
        </button>
      </div>

      {draftError && <p className="text-sm text-negative">{draftError}</p>}

      {drafts.length > 0 && (
        <div className="space-y-2">
          {draftSource && (
            <span
              className={`pill ${
                draftSource === "ai"
                  ? "bg-positive-soft text-positive"
                  : draftSource === "demo"
                    ? "bg-coral-soft text-coral-600"
                    : "bg-navy-50 text-muted"
              }`}
            >
              {draftSource === "ai" ? t("aiDraft") : draftSource === "demo" ? t("demoSource") : t("templateSource")}
            </span>
          )}
          {drafts.map((d) => (
            <div key={d.platform} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-navy-700">{SOCIAL_PLATFORM_LABELS[d.platform]}</span>
                <button type="button" onClick={() => use(d)} className="text-xs font-semibold text-brand-accent hover:text-brand-800">
                  {t("useBtn")}
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-muted">{d.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-line pt-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-navy-700">{t("postToPublish")}</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
            className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs outline-none focus:border-brand-400"
          >
            {SOCIAL_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {SOCIAL_PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder={t("postPlaceholder")}
          className="mt-2 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className={`tnum ${over ? "text-negative" : "text-muted"}`}>
            {content.length}/{PLATFORM_LIMITS[platform]}
          </span>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("scheduleLabel")}</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          />
        </label>

        {error && <p className="mt-2 text-sm text-negative">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={posting || content.trim().length < 2 || over}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {posting ? t("saving") : scheduledAt ? t("schedule") : t("publishNow")}
        </button>
      </div>
    </div>
  );
}

// --- posts list --------------------------------------------------------------

function PostsList() {
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const fmt = useFormatters();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const url = pid ? `/api/social/posts?projectId=${encodeURIComponent(pid)}` : "/api/social/posts";
      const res = await fetch(url);
      const json = (await res.json()) as { posts?: SocialPost[] };
      setPosts(json.posts ?? []);
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const handler = () => void load();
    window.addEventListener("social:posts-changed", handler);
    return () => window.removeEventListener("social:posts-changed", handler);
  }, [load]);

  const remove = async (id: string) => {
    const res = await fetch("/api/social/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, projectId: pid }),
    });
    if (res.ok) setPosts((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy-800">{t("posts")}</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300"
        >
          <Refresh width={13} height={13} />
          {t("refresh")}
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-sm text-muted">{t("loading")}</div>
      ) : posts.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          {t("noPosts")}
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => (
            <li key={post.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                  {SOCIAL_PLATFORM_LABELS[post.platform]}
                  <span className={`pill ${STATUS_TONE[post.status]}`}>{POST_STATUS_LABELS[post.status]}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove(post.id)}
                  aria-label={t("deleteAriaLabel")}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-coral-600"
                >
                  <Close width={14} height={14} />
                </button>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-navy-700">{post.content}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Clock width={12} height={12} />
                {post.status === "scheduled" && post.scheduledAt
                  ? t("scheduledAt", { dt: fmt.fmtDateTime(post.scheduledAt) })
                  : post.status === "published" && post.publishedAt
                    ? t("publishedAt", { rel: fmt.fmtRelative(post.publishedAt) })
                    : t("createdAt", { rel: fmt.fmtRelative(post.createdAt) })}
                {post.externalUrl &&
                  (post.externalUrl.startsWith("https://demo.social/") ? (
                    // Simulated publish (demo mode): don't dress the placeholder URL
                    // up as a real, clickable published post.
                    <span className="text-muted">· {t("demoLink")}</span>
                  ) : (
                    // Real connected account: the returned URL is a genuine post link.
                    <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" className="link-inline">
                      {t("link")}
                    </a>
                  ))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- inbox -------------------------------------------------------------------

function Inbox() {
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

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
