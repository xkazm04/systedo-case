"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Bolt, Check, Gauge, Search } from "@/components/icons";
import { fmtCZK, fmtInt } from "@/lib/format";
import type { BriefKeyword } from "@/lib/ai-types";
import {
  COMPETITION_LABELS,
  KEYWORD_INTENT_LABELS,
  type KeywordIdea,
  type KeywordIntent,
  type KeywordResult,
} from "@/lib/keywords/types";
import { Field, ToolEmpty, ToolError, inputClass } from "./primitives";

type Status = "idle" | "loading" | "done" | "error";
type IntentFilter = "all" | KeywordIntent;

export interface BriefSeed {
  topic: string;
  primaryKeyword: string;
  keywords: BriefKeyword[];
}

const COMP_COLOR: Record<string, string> = {
  low: "text-positive",
  medium: "text-coral-600",
  high: "text-negative",
};

/** Keyword research + content-gap tool. Pulls keyword ideas with real volume /
 *  competition / CPC (Google Ads Keyword Planner when connected, deterministic
 *  sample otherwise), ranks them by opportunity, and hands the selection to the
 *  brief tool — grounding content planning in actual demand. */
export default function KeywordResearch({
  onCreateBrief,
  onSaved,
}: {
  onCreateBrief: (seed: BriefSeed) => void;
  onSaved?: () => void;
}) {
  const { status: authStatus } = useSession();
  const [seed, setSeed] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<KeywordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<IntentFilter>("all");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const canSubmit = seed.trim().length >= 2 && status !== "loading";

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setError(null);
    setSelected(new Set());
    setFilter("all");
    setSaveState("idle");
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: seed.trim(), url: url.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Něco se pokazilo.");
        setStatus("error");
        return;
      }
      setResult(json as KeywordResult);
      setStatus("done");
    } catch {
      setError("Nepodařilo se spojit se serverem.");
      setStatus("error");
    }
  }

  const toggle = (kw: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });

  const visible = useMemo(
    () => (result ? result.ideas.filter((i) => filter === "all" || i.intent === filter) : []),
    [result, filter]
  );

  const createBrief = () => {
    if (!result) return;
    const picks = result.ideas.filter((i) => selected.has(i.keyword));
    const chosen = picks.length ? picks : result.ideas.slice(0, 8);
    // Highest-opportunity pick becomes the primary keyword (ideas are sorted desc).
    const primary = chosen[0]?.keyword ?? result.seed;
    onCreateBrief({
      topic: result.seed,
      primaryKeyword: primary,
      keywords: chosen.map((i) => ({
        keyword: i.keyword,
        volume: i.avgMonthlySearches,
        competition: i.competition,
      })),
    });
  };

  /** Persist the current research as a named list. Selected keywords are tagged
   *  "core", the rest "watch" — ready for negative tagging in the saved panel. */
  const saveList = async () => {
    if (!result || saveState === "saving") return;
    setSaveState("saving");
    try {
      const keywords = result.ideas.map((i) => ({
        keyword: i.keyword,
        intent: i.intent,
        opportunity: i.opportunity,
        avgMonthlySearches: i.avgMonthlySearches,
        competition: i.competition,
        tag: selected.has(i.keyword) ? "core" : "watch",
      }));
      const res = await fetch("/api/keywords/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: result.seed, seed: result.seed, source: result.source, keywords }),
      });
      if (!res.ok) {
        setSaveState("idle");
        return;
      }
      setSaveState("saved");
      onSaved?.();
    } catch {
      setSaveState("idle");
    }
  };

  const intentsPresent = result ? result.groups.map((g) => g.intent) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <form onSubmit={run} className="card space-y-5 p-6 lg:sticky lg:top-24">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-800">Téma k prozkoumání</h2>
          <button
            type="button"
            onClick={() => {
              setSeed("ořechy");
              setUrl("");
            }}
            className="text-xs font-semibold text-brand-accent hover:text-brand-800"
          >
            Vyplnit ukázku
          </button>
        </div>

        <Field label="Klíčové slovo / téma" htmlFor="kw-seed">
          <input
            id="kw-seed"
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="ořechy"
            className={inputClass}
          />
        </Field>

        <Field label="Cílová URL (volitelné)" htmlFor="kw-url">
          <input
            id="kw-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mionelo.cz/orechy"
            className={inputClass}
          />
        </Field>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {status === "loading" ? (
            <>
              <Gauge width={17} height={17} className="animate-pulse" />
              Hledám…
            </>
          ) : (
            <>
              <Search width={17} height={17} />
              Najít klíčová slova
            </>
          )}
        </button>

        <p className="text-xs leading-relaxed text-muted">
          Reálná hledanost a konkurence z Google Ads Keyword Planneru u připojeného účtu; jinak
          realistická ukázková data. „Příležitost“ kombinuje vysokou hledanost s nízkou konkurencí.
        </p>
      </form>

      <div className="min-w-0">
        {status === "idle" && (
          <ToolEmpty
            icon={Search}
            title="Výzkum klíčových slov se zobrazí tady"
            body="Zadejte téma. Nástroj najde související dotazy s hledaností, konkurencí a CPC, seřadí je podle příležitosti a předá výběr do obsahového briefu."
            hint="Tip: zkuste „Vyplnit ukázku“ a klikněte na Najít klíčová slova."
          />
        )}
        {status === "loading" && (
          <div className="card flex animate-fade-in items-center justify-center gap-3 p-12 text-sm text-muted">
            <Gauge width={18} height={18} className="animate-pulse text-brand-600" />
            Sestavuji návrhy klíčových slov…
          </div>
        )}
        {status === "error" && <ToolError message={error ?? ""} onRetry={() => setStatus("idle")} />}

        {status === "done" && result && (
          <div className="animate-fade-up space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill bg-navy-50 text-navy-700">{result.ideas.length} návrhů</span>
                <span
                  className={`pill ${
                    result.source === "google-ads" ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-600"
                  }`}
                >
                  {result.source === "google-ads" ? "Google Ads · živá data" : "Ukázková data"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {selected.size > 0 && (
                  <span className="text-xs text-muted">{selected.size} vybráno</span>
                )}
                {authStatus === "authenticated" && (
                  <button
                    type="button"
                    onClick={saveList}
                    disabled={saveState !== "idle"}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-60"
                  >
                    {saveState === "saved" ? (
                      <>
                        <Check width={13} height={13} /> Uloženo
                      </>
                    ) : (
                      <>{saveState === "saving" ? "Ukládám…" : "Uložit seznam"}</>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* intent filter */}
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {(["all", ...intentsPresent] as IntentFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === f
                      ? "border-brand-400 bg-brand-50 text-brand-800"
                      : "border-line text-muted hover:border-navy-200"
                  }`}
                >
                  {f === "all" ? "Vše" : KEYWORD_INTENT_LABELS[f]}
                </button>
              ))}
            </div>

            <ul className="space-y-2">
              {visible.map((idea) => (
                <IdeaRow
                  key={idea.keyword}
                  idea={idea}
                  checked={selected.has(idea.keyword)}
                  onToggle={() => toggle(idea.keyword)}
                />
              ))}
            </ul>

            <div className="sticky bottom-4 flex justify-end">
              <button
                type="button"
                onClick={createBrief}
                className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-pop transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99]"
              >
                <Bolt width={16} height={16} />
                {selected.size > 0
                  ? `Vytvořit brief z výběru (${selected.size})`
                  : "Vytvořit brief z TOP slov"}
                <ArrowRight width={16} height={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaRow({
  idea,
  checked,
  onToggle,
}: {
  idea: KeywordIdea;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
          checked ? "border-brand-400 bg-brand-50" : "border-line hover:border-navy-200"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-navy-800">{idea.keyword}</span>
            <span className="pill bg-navy-50 text-muted">{KEYWORD_INTENT_LABELS[idea.intent]}</span>
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            <span className="tnum">{fmtInt(idea.avgMonthlySearches)}</span>/měs · konkurence{" "}
            <span className={COMP_COLOR[idea.competition]}>{COMPETITION_LABELS[idea.competition]}</span> · CPC{" "}
            <span className="tnum">
              {fmtCZK(idea.lowBidCzk)}–{fmtCZK(idea.highBidCzk)}
            </span>
          </span>
        </span>
        <span className="w-16 shrink-0 text-right">
          <span className="text-[11px] text-muted">Příležitost</span>
          <span className="mt-0.5 flex items-center justify-end gap-1.5">
            <span className="h-1.5 w-8 overflow-hidden rounded-full bg-navy-50" aria-hidden>
              <span
                className="block h-full rounded-full bg-brand-500"
                style={{ width: `${idea.opportunity}%` }}
              />
            </span>
            <span className="tnum text-xs font-semibold text-navy-800">{idea.opportunity}</span>
          </span>
        </span>
      </label>
    </li>
  );
}
