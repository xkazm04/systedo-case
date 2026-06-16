"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Bolt, Check, Clock, Close, Info, Refresh, Share } from "@/components/icons";
import { fmtDateTime, fmtRelative } from "@/lib/format";
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
          Přihlaste se a připojte sociální účty. I bez přihlášení si vyzkoušíte návrh, plánování i schránku.
        </p>
        <button
          type="button"
          onClick={() => signIn("google")}
          className="shrink-0 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Přihlásit přes Google
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
          <Share width={17} height={17} className="text-brand-600" />
          Připojené účty
        </h2>
        {!configured && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Info width={13} height={13} />
            Ukázkový režim (bez OAuth)
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
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("pratelsky");
  const [draftPlatforms, setDraftPlatforms] = useState<Set<SocialPlatform>>(new Set(["instagram", "facebook"]));
  const [drafts, setDrafts] = useState<{ platform: SocialPlatform; content: string }[]>([]);
  const [drafting, setDrafting] = useState(false);

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

  const suggest = async () => {
    if (topic.trim().length < 2 || draftPlatforms.size === 0) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), tone, platforms: [...draftPlatforms] }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Návrh se nezdařil.");
        return;
      }
      setDrafts(json.drafts ?? []);
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
        body: JSON.stringify({ platform, content, scheduledAt: scheduledAt || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Uložení se nezdařilo.");
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
      <h2 className="text-base font-semibold text-navy-800">Nový příspěvek</h2>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-navy-700">Téma</span>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Např. nová sezónní směs ořechů"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">Tón</span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
          >
            {TONES.map((t) => (
              <option key={t} value={t}>
                {TONE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-navy-700">Platformy pro návrh</span>
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

      <button
        type="button"
        onClick={suggest}
        disabled={drafting || topic.trim().length < 2 || draftPlatforms.size === 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-pill border border-line px-5 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-50"
      >
        <Bolt width={16} height={16} />
        {drafting ? "Navrhuji…" : "Navrhnout varianty"}
      </button>

      {drafts.length > 0 && (
        <div className="space-y-2">
          {drafts.map((d) => (
            <div key={d.platform} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-navy-700">{SOCIAL_PLATFORM_LABELS[d.platform]}</span>
                <button type="button" onClick={() => use(d)} className="text-xs font-semibold text-brand-accent hover:text-brand-800">
                  Použít
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-muted">{d.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-line pt-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-navy-700">Příspěvek k publikaci</span>
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
          placeholder="Napište příspěvek nebo použijte návrh výše…"
          className="mt-2 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className={`tnum ${over ? "text-negative" : "text-muted"}`}>
            {content.length}/{PLATFORM_LIMITS[platform]}
          </span>
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-sm font-medium text-navy-700">Naplánovat na (volitelné)</span>
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
          {posting ? "Ukládám…" : scheduledAt ? "Naplánovat" : "Zveřejnit teď"}
        </button>
      </div>
    </div>
  );
}

// --- posts list --------------------------------------------------------------

function PostsList() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/social/posts");
      const json = (await res.json()) as { posts?: SocialPost[] };
      setPosts(json.posts ?? []);
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

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
      body: JSON.stringify({ id }),
    });
    if (res.ok) setPosts((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy-800">Příspěvky</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300"
        >
          <Refresh width={13} height={13} />
          Obnovit
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-sm text-muted">Načítám…</div>
      ) : posts.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          Zatím žádné příspěvky. Vytvořte první vlevo.
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
                  aria-label="Smazat"
                  className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-navy-50 hover:text-coral-600"
                >
                  <Close width={14} height={14} />
                </button>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-navy-700">{post.content}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Clock width={12} height={12} />
                {post.status === "scheduled" && post.scheduledAt
                  ? `naplánováno na ${fmtDateTime(post.scheduledAt)}`
                  : post.status === "published" && post.publishedAt
                    ? `zveřejněno ${fmtRelative(post.publishedAt)}`
                    : `vytvořeno ${fmtRelative(post.createdAt)}`}
                {post.externalUrl && (
                  <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" className="link-inline">
                    odkaz
                  </a>
                )}
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
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/social/messages");
      const json = (await res.json()) as { messages?: InboxMessage[] };
      const list = json.messages ?? [];
      setMessages(list);
      setDrafts(Object.fromEntries(list.filter((m) => m.suggestedReply).map((m) => [m.id, m.suggestedReply!])));
    } catch {
      /* non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

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
        body: JSON.stringify({ id: m.id, platform: m.platform, reply }),
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
        <h2 className="text-sm font-semibold text-navy-800">Schránka — komentáře a zprávy</h2>
        <span className="text-xs text-muted">{open.length} k vyřízení</span>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-sm text-muted">Načítám schránku…</div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {messages.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-navy-800">{m.author}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="pill bg-navy-50 text-muted">{SOCIAL_PLATFORM_LABELS[m.platform]}</span>
                  {m.kind === "dm" ? "DM" : "komentář"}
                </span>
              </div>
              <p className="mt-2 text-sm text-navy-700">{m.text}</p>

              {m.status === "replied" ? (
                <div className="mt-3 rounded-lg bg-positive-soft px-3 py-2 text-sm text-positive">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Check width={14} height={14} />
                    Odpovězeno
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
                    <span className="text-[11px] text-muted">Návrh odpovědi — upravte a schvalte</span>
                    <button
                      type="button"
                      onClick={() => send(m)}
                      disabled={busy === m.id}
                      className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Share width={13} height={13} />
                      {busy === m.id ? "Odesílám…" : "Schválit a odeslat"}
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
