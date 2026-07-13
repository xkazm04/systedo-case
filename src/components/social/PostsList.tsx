"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Close, Refresh } from "@/components/icons";
import { useOptionalProject } from "@/lib/projects/context";
import { useFormatters, useT } from "@/lib/i18n/client";
import {
  POST_STATUS_LABELS,
  SOCIAL_PLATFORM_LABELS,
  type PostStatus,
  type SocialPost,
} from "@/lib/social/types";

const T = {
  cs: {
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
  },
  en: {
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
  },
} as const;

const STATUS_TONE: Record<PostStatus, string> = {
  draft: "bg-navy-50 text-muted",
  scheduled: "bg-brand-50 text-brand-800",
  publishing: "bg-brand-50 text-brand-800",
  published: "bg-positive-soft text-positive",
  failed: "bg-negative-soft text-negative",
};

export default function PostsList() {
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
