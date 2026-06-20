"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useOptionalProject } from "@/lib/projects/context";
import { useT } from "@/lib/i18n/client";
import { Bulb, Check, Close, Search, Sparkles } from "@/components/icons";
import {
  PATTERN_CATEGORIES,
  PATTERN_CATEGORY_LABELS,
  type Pattern,
  type PatternCategory,
  type RankedPattern,
} from "@/lib/patterns/types";

const T = {
  cs: {
    infoBanner: "Vzory se odvozují z vašich vlastních výsledků. Hledání je",
    infoBannerSemantic: "sémantické",
    infoBannerSuffix: "— najde vzory podle významu, ne jen podle slov. Uložené vzory navíc ladí AI vyhodnocení portfolia.",
    filterAll: "Vše",
    searchPlaceholder: "Hledat podle významu…",
    searchAriaLabel: "Hledat",
    clearSearch: "Zpět",
    loading: "Načítám vzory…",
    searchResults: "Výsledky hledání ({n})",
    searching: "Hledám…",
    semantic: "Sémantické",
    textual: "Textové",
    noResults: "Nic neodpovídá dotazu.",
    yourLibrary: "Vaše knihovna ({n})",
    emptyLibrary: "Zatím nic uloženo. Připněte si rozpoznané vzory níže nebo přidejte vlastní.",
    noFilterMatch: "Žádný uložený vzor neodpovídá filtru.",
    autoDetected: "Automaticky rozpoznané z dat ({n})",
    noData: "Zatím nejsou data k analýze — synchronizujte kampaně na stránce Kampaně.",
    noAutoFilterMatch: "Žádný rozpoznaný vzor neodpovídá filtru.",
    relevanceTitle: "Relevance k dotazu",
    relevanceLabel: "relevance",
    removeLabel: "Odebrat",
    saveLabel: "Uložit",
    addCustomTitle: "Přidat vlastní vzor",
    patternNamePlaceholder: "Název vzoru",
    insightPlaceholder: "Poučení / pravidlo",
    evidencePlaceholder: "Důkaz / čísla (volitelné)",
    saveBusy: "Ukládám…",
    saveBtn: "Uložit vzor",
    saveFailed: "Uložení se nezdařilo.",
  },
  en: {
    infoBanner: "Patterns are derived from your own results. Search is",
    infoBannerSemantic: "semantic",
    infoBannerSuffix: "— it finds patterns by meaning, not just keywords. Saved patterns also tune the AI portfolio evaluation.",
    filterAll: "All",
    searchPlaceholder: "Search by meaning…",
    searchAriaLabel: "Search",
    clearSearch: "Clear",
    loading: "Loading patterns…",
    searchResults: "Search results ({n})",
    searching: "Searching…",
    semantic: "Semantic",
    textual: "Text",
    noResults: "Nothing matches your query.",
    yourLibrary: "Your library ({n})",
    emptyLibrary: "Nothing saved yet. Pin detected patterns below or add your own.",
    noFilterMatch: "No saved pattern matches the filter.",
    autoDetected: "Auto-detected from data ({n})",
    noData: "No data to analyse yet — sync campaigns on the Campaigns page.",
    noAutoFilterMatch: "No detected pattern matches the filter.",
    relevanceTitle: "Relevance to query",
    relevanceLabel: "relevance",
    removeLabel: "Remove",
    saveLabel: "Save",
    addCustomTitle: "Add custom pattern",
    patternNamePlaceholder: "Pattern name",
    insightPlaceholder: "Insight / rule",
    evidencePlaceholder: "Evidence / numbers (optional)",
    saveBusy: "Saving…",
    saveBtn: "Save pattern",
    saveFailed: "Save failed.",
  },
} as const;

type CategoryFilter = "all" | PatternCategory;

export default function PatternsLibrary() {
  const { status: authStatus } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const t = useT(T);
  const [auto, setAuto] = useState<Pattern[]>([]);
  const [saved, setSaved] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Semantic search state. `results === null` = browse mode.
  const [results, setResults] = useState<RankedPattern[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [semantic, setSemantic] = useState(true);

  const load = useCallback(async () => {
    try {
      const qs = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
      const res = await fetch(`/api/patterns${qs}`);
      const json = (await res.json()) as { auto?: Pattern[]; saved?: Pattern[] };
      setAuto(json.auto ?? []);
      setSaved(json.saved ?? []);
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

  const byCategory = useCallback(
    (p: Pattern) => filter === "all" || p.category === filter,
    [filter]
  );
  const visibleSaved = useMemo(() => saved.filter(byCategory), [saved, byCategory]);
  const visibleAuto = useMemo(() => auto.filter(byCategory), [auto, byCategory]);
  const displayedResults = useMemo(
    () => (results ? results.filter(byCategory) : []),
    [results, byCategory]
  );
  // Normalize relevance within the result set so the bar is meaningful (cosine
  // scores cluster high); only used in semantic mode.
  const relBounds = useMemo(() => {
    if (!results || results.length === 0) return { min: 0, max: 1 };
    const vals = results.map((r) => r.relevance);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [results]);
  const norm = (r: number) =>
    relBounds.max > relBounds.min ? (r - relBounds.min) / (relBounds.max - relBounds.min) : 1;

  const authed = authStatus === "authenticated";

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch("/api/patterns/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pid ? { query: q, projectId: pid } : { query: q }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResults([]);
        setSemantic(false);
        return;
      }
      setResults(json.results ?? []);
      setSemantic(Boolean(json.semantic));
    } catch {
      setResults([]);
      setSemantic(false);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults(null);
  };

  const pin = async (p: Pattern) => {
    setBusy(p.id);
    try {
      const res = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: p.title, category: p.category, insight: p.insight, evidence: p.evidence, projectId: pid }),
      });
      if (res.ok) {
        const { pattern } = (await res.json()) as { pattern: Pattern };
        setSaved((s) => [pattern, ...s]);
        setAuto((a) => a.filter((x) => x.id !== p.id));
        setResults((r) => (r ? r.filter((x) => x.id !== p.id) : r));
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch("/api/patterns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, projectId: pid }),
      });
      if (res.ok) {
        setSaved((s) => s.filter((p) => p.id !== id));
        setResults((r) => (r ? r.filter((x) => x.id !== id) : r));
      }
    } finally {
      setBusy(null);
    }
  };

  const actionFor = (p: Pattern) =>
    !authed
      ? undefined
      : p.source === "manual"
        ? ({ label: t("removeLabel"), icon: "remove", busy: busy === p.id, onClick: () => remove(p.id) } as const)
        : ({ label: t("saveLabel"), icon: "save", busy: busy === p.id, onClick: () => pin(p) } as const);

  return (
    <div className="space-y-6">
      <p className="rounded-card border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        {t("infoBanner")} <strong>{t("infoBannerSemantic")}</strong> {t("infoBannerSuffix")}
      </p>

      {/* filters + semantic search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {(["all", ...PATTERN_CATEGORIES] as CategoryFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              aria-pressed={filter === c}
              className={`shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === c ? "border-brand-400 bg-brand-50 text-brand-800" : "border-line text-muted hover:border-navy-200"
              }`}
            >
              {c === "all" ? t("filterAll") : PATTERN_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <form onSubmit={runSearch} className="flex w-full gap-2 sm:w-auto">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface sm:w-64"
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            aria-label={t("searchAriaLabel")}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            <Search width={16} height={16} />
          </button>
          {results !== null && (
            <button
              type="button"
              onClick={clearSearch}
              className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300"
            >
              {t("clearSearch")}
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-sm text-muted">{t("loading")}</div>
      ) : results !== null ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Search width={16} height={16} className="text-brand-600" />
              {t("searchResults", { n: displayedResults.length })}
            </h2>
            <span className={`pill ${semantic ? "bg-positive-soft text-positive" : "bg-navy-50 text-muted"}`}>
              {searching ? t("searching") : semantic ? t("semantic") : t("textual")}
            </span>
          </div>
          {displayedResults.length === 0 ? (
            <p className="text-sm text-muted">{t("noResults")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {displayedResults.map((r) => (
                <PatternCard
                  key={r.id}
                  p={r}
                  relevance={semantic ? norm(r.relevance) : undefined}
                  action={actionFor(r)}
                  relevanceTitle={t("relevanceTitle")}
                  relevanceLabel={t("relevanceLabel")}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Check width={16} height={16} className="text-brand-600" />
              {t("yourLibrary", { n: saved.length })}
            </h2>
            {visibleSaved.length === 0 ? (
              <p className="text-sm text-muted">
                {saved.length === 0
                  ? t("emptyLibrary")
                  : t("noFilterMatch")}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleSaved.map((p) => (
                  <PatternCard key={p.id} p={p} action={actionFor(p)} relevanceTitle={t("relevanceTitle")} relevanceLabel={t("relevanceLabel")} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Sparkles width={16} height={16} className="text-brand-600" />
              {t("autoDetected", { n: auto.length })}
            </h2>
            {visibleAuto.length === 0 ? (
              <p className="text-sm text-muted">
                {auto.length === 0
                  ? t("noData")
                  : t("noAutoFilterMatch")}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleAuto.map((p) => (
                  <PatternCard key={p.id} p={p} action={actionFor(p)} relevanceTitle={t("relevanceTitle")} relevanceLabel={t("relevanceLabel")} />
                ))}
              </div>
            )}
          </section>

          {authed && <ManualAdd pid={pid} onAdded={(p) => setSaved((s) => [p, ...s])} t={t} />}
        </>
      )}
    </div>
  );
}

function PatternCard({
  p,
  action,
  relevance,
  relevanceTitle,
  relevanceLabel,
}: {
  p: Pattern;
  action?: { label: string; icon: "save" | "remove"; busy: boolean; onClick: () => void };
  relevance?: number;
  relevanceTitle: string;
  relevanceLabel: string;
}) {
  return (
    <div className="card flex flex-col p-4">
      {relevance !== undefined && (
        <span className="mb-2.5 flex items-center gap-2" title={relevanceTitle}>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-navy-50" aria-hidden>
            <span
              className="block h-full rounded-full bg-brand-500"
              style={{ width: `${Math.round(Math.max(0.08, relevance) * 100)}%` }}
            />
          </span>
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted">{relevanceLabel}</span>
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="pill bg-navy-50 text-muted">{PATTERN_CATEGORY_LABELS[p.category]}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.busy}
            className={`inline-flex items-center gap-1 rounded-pill border border-line px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              action.icon === "remove"
                ? "text-muted hover:border-coral-400/60 hover:text-coral-600"
                : "text-navy-700 hover:border-brand-300 hover:text-brand-accent"
            }`}
          >
            {action.icon === "remove" ? <Close width={12} height={12} /> : <Check width={12} height={12} />}
            {action.label}
          </button>
        )}
      </div>
      <h3 className="mt-2.5 text-sm font-semibold text-navy-800">{p.title}</h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-navy-700">{p.insight}</p>
      {p.evidence && (
        <p className="mt-2 flex items-start gap-1.5 border-t border-line pt-2 text-xs text-muted">
          <Bulb width={13} height={13} className="mt-0.5 shrink-0 text-brand-500" />
          {p.evidence}
        </p>
      )}
    </div>
  );
}

function ManualAdd({ pid, onAdded, t }: { pid?: string; onAdded: (p: Pattern) => void; t: (key: keyof typeof T.cs, vars?: Record<string, string | number>) => string }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<PatternCategory>("structure");
  const [insight, setInsight] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3 || insight.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, insight, evidence, projectId: pid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? t("saveFailed"));
        return;
      }
      onAdded(json.pattern as Pattern);
      setTitle("");
      setInsight("");
      setEvidence("");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface";

  return (
    <details className="card p-5">
      <summary className="cursor-pointer text-sm font-semibold text-navy-800">{t("addCustomTitle")}</summary>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("patternNamePlaceholder")} className={inputCls} />
        <select value={category} onChange={(e) => setCategory(e.target.value as PatternCategory)} className={inputCls}>
          {PATTERN_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PATTERN_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <textarea
          value={insight}
          onChange={(e) => setInsight(e.target.value)}
          placeholder={t("insightPlaceholder")}
          rows={2}
          className={`${inputCls} sm:col-span-2`}
        />
        <input
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder={t("evidencePlaceholder")}
          className={`${inputCls} sm:col-span-2`}
        />
        {error && <p className="text-sm text-negative sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t("saveBusy") : t("saveBtn")}
          </button>
        </div>
      </form>
    </details>
  );
}
