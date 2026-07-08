"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useOptionalProject } from "@/lib/projects/context";
import { Layers, Close, Download } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import { toCsv, downloadText } from "@/lib/export";
import { CopyButton } from "./primitives";
import {
  KEYWORD_INTENT_LABELS,
  KEYWORD_TAG_LABELS,
  type KeywordList,
  type KeywordTag,
} from "@/lib/keywords/types";

const T = {
  cs: {
    sectionHeading: "Uložené seznamy",
    negativesHeading: "Vylučovací klíčová slova ({n})",
    negativesBody: "Sjednocený seznam napříč seznamy — připravený k vložení do Google Ads jako vylučovací klíčová slova, aby se snížil zbytečný útrata.",
    copyNegatives: "Kopírovat",
    csvNegatives: "CSV",
    csvFilename: "adamant-vylucovaci-slova.csv",
    csvHeader: "Vylučovací klíčové slovo",
    perMonth: "/měs",
    sourceGoogleAds: "Google Ads",
    sourceDemo: "ukázka",
    sourceLabel: "{count} slov · zdroj {source}",
    deleteListAriaLabel: "Smazat seznam {name}",
  },
  en: {
    sectionHeading: "Saved lists",
    negativesHeading: "Negative keywords ({n})",
    negativesBody: "Unified list across all lists — ready to paste into Google Ads as negative keywords to cut wasted spend.",
    copyNegatives: "Copy",
    csvNegatives: "CSV",
    csvFilename: "adamant-negative-keywords.csv",
    csvHeader: "Negative keyword",
    perMonth: "/mo",
    sourceGoogleAds: "Google Ads",
    sourceDemo: "sample",
    sourceLabel: "{count} keywords · source {source}",
    deleteListAriaLabel: "Delete list {name}",
  },
} as const;

const TAG_ORDER: KeywordTag[] = ["core", "negative", "watch"];

const TAG_STYLE: Record<KeywordTag, string> = {
  core: "border-brand-400 bg-brand-50 text-brand-800",
  negative: "border-negative/40 bg-negative-soft text-negative",
  watch: "border-line text-muted",
};

/** Persisted keyword lists with per-keyword tagging (core / negative / watch) and
 *  a paste-ready block of aggregated negatives. Turns the one-shot research tool
 *  into a returning workflow. Renders nothing for anonymous visitors (saving
 *  requires an account). Reloads when `refreshKey` changes. */
export default function SavedKeywordLists({ refreshKey }: { refreshKey: number }) {
  const t = useT(T);
  const fmt = useFormatters();
  const { status } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [lists, setLists] = useState<KeywordList[]>([]);
  const [negatives, setNegatives] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/keywords/lists${pid ? `?projectId=${pid}` : ""}`);
      if (!res.ok) return;
      const json = (await res.json()) as { lists?: KeywordList[]; negatives?: string[] };
      setLists(json.lists ?? []);
      setNegatives(json.negatives ?? []);
    } catch {
      /* non-critical */
    } finally {
      setLoaded(true);
    }
  }, [pid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "authenticated") void load();
  }, [status, load, refreshKey]);

  const retag = async (listId: string, keyword: string, tag: KeywordTag) => {
    // Optimistic local update, then persist + re-derive negatives.
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? { ...l, keywords: l.keywords.map((k) => (k.keyword === keyword ? { ...k, tag } : k)) }
          : l
      )
    );
    try {
      await fetch("/api/keywords/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listId, tags: { [keyword]: tag }, projectId: pid }),
      });
      await load();
    } catch {
      /* keep optimistic state */
    }
  };

  const remove = async (listId: string) => {
    setLists((prev) => prev.filter((l) => l.id !== listId));
    try {
      await fetch("/api/keywords/lists", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: listId, projectId: pid }),
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const exportNegatives = () =>
    downloadText(t("csvFilename"), toCsv([t("csvHeader")], negatives.map((n) => [n])));

  if (status !== "authenticated" || (!lists.length && loaded)) return null;
  if (!loaded) return null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <Layers width={16} height={16} className="text-brand-accent" />
        <h3 className="text-base font-semibold text-navy-800">{t("sectionHeading")}</h3>
        <span className="pill bg-navy-50 text-muted">{lists.length}</span>
      </div>

      {negatives.length > 0 && (
        <div className="card border-negative/30 bg-negative-soft/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-negative">
              {t("negativesHeading", { n: negatives.length })}
            </p>
            <div className="flex items-center gap-2">
              <CopyButton text={negatives.join("\n")} label={t("copyNegatives")} />
              <button
                type="button"
                onClick={exportNegatives}
                className="inline-flex items-center gap-1 text-xs font-medium text-negative hover:underline"
              >
                <Download width={13} height={13} />
                {t("csvNegatives")}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t("negativesBody")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {negatives.map((n) => (
              <span key={n} className="pill bg-surface text-negative">{n}</span>
            ))}
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {lists.map((list) => (
          <li key={list.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-navy-800">{list.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {t("sourceLabel", {
                    count: list.keywords.length,
                    source: list.source === "google-ads" ? t("sourceGoogleAds") : t("sourceDemo"),
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(list.id)}
                aria-label={t("deleteListAriaLabel", { name: list.name })}
                className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-negative-soft hover:text-negative"
              >
                <Close width={15} height={15} />
              </button>
            </div>

            <ul className="mt-3 space-y-1.5">
              {list.keywords.map((k) => (
                <li
                  key={k.keyword}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="truncate text-sm font-medium text-navy-800">{k.keyword}</span>
                    <span className="ml-2 text-xs text-muted">
                      <span className="tnum">{fmt.fmtInt(k.avgMonthlySearches)}</span>{t("perMonth")} ·{" "}
                      {KEYWORD_INTENT_LABELS[k.intent]}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {TAG_ORDER.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => retag(list.id, k.keyword, tag)}
                        aria-pressed={k.tag === tag}
                        className={`rounded-pill border px-2.5 py-1 text-[13px] font-medium transition-colors ${
                          k.tag === tag ? TAG_STYLE[tag] : "border-line text-muted hover:border-navy-200"
                        }`}
                      >
                        {KEYWORD_TAG_LABELS[tag]}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
