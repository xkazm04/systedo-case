"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Bulb, Check, Close, Sparkles } from "@/components/icons";
import {
  PATTERN_CATEGORIES,
  PATTERN_CATEGORY_LABELS,
  type Pattern,
  type PatternCategory,
} from "@/lib/patterns/types";

type CategoryFilter = "all" | PatternCategory;

export default function PatternsLibrary() {
  const { status: authStatus } = useSession();
  const [auto, setAuto] = useState<Pattern[]>([]);
  const [saved, setSaved] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/patterns");
      const json = (await res.json()) as { auto?: Pattern[]; saved?: Pattern[] };
      setAuto(json.auto ?? []);
      setSaved(json.saved ?? []);
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

  const match = useCallback(
    (p: Pattern) => {
      if (filter !== "all" && p.category !== filter) return false;
      const q = query.trim().toLowerCase();
      if (q && !`${p.title} ${p.insight} ${p.evidence}`.toLowerCase().includes(q)) return false;
      return true;
    },
    [filter, query]
  );

  const visibleSaved = useMemo(() => saved.filter(match), [saved, match]);
  const visibleAuto = useMemo(() => auto.filter(match), [auto, match]);

  const authed = authStatus === "authenticated";

  const pin = async (p: Pattern) => {
    setBusy(p.id);
    try {
      const res = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: p.title, category: p.category, insight: p.insight, evidence: p.evidence }),
      });
      if (res.ok) {
        const { pattern } = (await res.json()) as { pattern: Pattern };
        setSaved((s) => [pattern, ...s]);
        setAuto((a) => a.filter((x) => x.id !== p.id));
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
        body: JSON.stringify({ id }),
      });
      if (res.ok) setSaved((s) => s.filter((p) => p.id !== id));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="rounded-card border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Vzory se odvozují z vašich vlastních výsledků. Uložené vzory navíc{" "}
        <strong>ladí AI vyhodnocení portfolia</strong> — model pak vychází z toho, co u vás funguje.
      </p>

      {/* filters */}
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
              {c === "all" ? "Vše" : PATTERN_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat ve vzorech…"
          className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface sm:w-64"
        />
      </div>

      {loading ? (
        <div className="card p-10 text-center text-sm text-muted">Načítám vzory…</div>
      ) : (
        <>
          {/* saved library */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Check width={16} height={16} className="text-brand-600" />
              Vaše knihovna ({saved.length})
            </h2>
            {visibleSaved.length === 0 ? (
              <p className="text-sm text-muted">
                {saved.length === 0
                  ? "Zatím nic uloženo. Připněte si rozpoznané vzory níže nebo přidejte vlastní."
                  : "Žádný uložený vzor neodpovídá filtru."}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleSaved.map((p) => (
                  <PatternCard
                    key={p.id}
                    p={p}
                    action={
                      authed
                        ? { label: "Odebrat", icon: "remove", busy: busy === p.id, onClick: () => remove(p.id) }
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* auto-detected */}
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
              <Sparkles width={16} height={16} className="text-brand-600" />
              Automaticky rozpoznané z dat ({auto.length})
            </h2>
            {visibleAuto.length === 0 ? (
              <p className="text-sm text-muted">
                {auto.length === 0
                  ? "Zatím nejsou data k analýze — synchronizujte kampaně na stránce Kampaně."
                  : "Žádný rozpoznaný vzor neodpovídá filtru."}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {visibleAuto.map((p) => (
                  <PatternCard
                    key={p.id}
                    p={p}
                    action={
                      authed
                        ? { label: "Uložit", icon: "save", busy: busy === p.id, onClick: () => pin(p) }
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {authed && <ManualAdd onAdded={(p) => setSaved((s) => [p, ...s])} />}
        </>
      )}
    </div>
  );
}

function PatternCard({
  p,
  action,
}: {
  p: Pattern;
  action?: { label: string; icon: "save" | "remove"; busy: boolean; onClick: () => void };
}) {
  return (
    <div className="card flex flex-col p-4">
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

function ManualAdd({ onAdded }: { onAdded: (p: Pattern) => void }) {
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
        body: JSON.stringify({ title, category, insight, evidence }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Uložení se nezdařilo.");
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
      <summary className="cursor-pointer text-sm font-semibold text-navy-800">Přidat vlastní vzor</summary>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Název vzoru" className={inputCls} />
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
          placeholder="Poučení / pravidlo"
          rows={2}
          className={`${inputCls} sm:col-span-2`}
        />
        <input
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Důkaz / čísla (volitelné)"
          className={`${inputCls} sm:col-span-2`}
        />
        {error && <p className="text-sm text-negative sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Ukládám…" : "Uložit vzor"}
          </button>
        </div>
      </form>
    </details>
  );
}
